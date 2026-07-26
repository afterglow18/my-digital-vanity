/**
 * PhotoCleanupPlugin — on-device photo cleanup using Apple's Vision framework.
 *
 * iOS 17+:  VNGenerateForegroundInstanceMaskRequest isolates the foreground
 *           subject (beauty product) from its background, then composites it
 *           over a clean white surface.  Core Image enhancement is applied on
 *           top: auto-levels, vibrance boost, subtle sharpening.
 *
 * iOS < 17: Background removal is skipped.  Only the Core Image enhancement
 *           pipeline runs — still produces a noticeably better photo.
 *
 * Photos never leave the device.  No network calls are made.
 * Processing runs on a background queue and resolves the Capacitor call from
 * any thread (the bridge handles marshalling).
 */

import Foundation
import Capacitor
import Vision
import UIKit
import CoreImage
import CoreImage.CIFilterBuiltins

@objc(PhotoCleanupPlugin)
public class PhotoCleanupPlugin: CAPPlugin {

    // MARK: - Plugin entry point

    @objc func processPhoto(_ call: CAPPluginCall) {
        guard let b64 = call.getString("imageData") else {
            call.reject("processPhoto: missing imageData argument")
            return
        }
        // Use .ignoreUnknownCharacters so minor whitespace / encoding
        // artefacts introduced by the JS↔native bridge don't cause nil.
        guard let data = Data(base64Encoded: b64, options: .ignoreUnknownCharacters) else {
            call.reject("processPhoto: base64 decode failed (length \(b64.count))")
            return
        }
        guard let input = UIImage(data: data) else {
            call.reject("processPhoto: UIImage init failed (data length \(data.count))")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            // Normalise EXIF orientation before processing
            let image = self.normalizedImage(input)
            if #available(iOS 17.0, *) {
                self.removeBackgroundAndEnhance(image: image, call: call)
            } else {
                self.enhanceOnly(image: image, call: call)
            }
        }
    }

    // MARK: - Vision background removal (iOS 17+)

    @available(iOS 17.0, *)
    private func removeBackgroundAndEnhance(image: UIImage, call: CAPPluginCall) {
        guard let cgImage = image.cgImage else {
            enhanceOnly(image: image, call: call)
            return
        }

        let request = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

        do {
            try handler.perform([request])

            guard
                let observation = request.results?.first,
                !observation.allInstances.isEmpty
            else {
                // No foreground subject detected — enhance only
                print("[PhotoCleanup] No subject found — falling back to enhance-only")
                enhanceOnly(image: image, call: call)
                return
            }

            // generateMaskedImage returns the subject pixels at full resolution
            // with the background replaced by transparent pixels.
            let maskedBuffer = try observation.generateMaskedImage(
                ofInstances: observation.allInstances,
                from: handler,
                croppedToInstancesExtent: false
            )

            let maskedCI  = CIImage(cvPixelBuffer: maskedBuffer)
            let sourceCI  = CIImage(cgImage: cgImage)

            // Composite subject over a clean white background so the product
            // sits on a pure white surface — ideal for beauty product photos.
            let whiteBackground = CIImage(color: .white).cropped(to: sourceCI.extent)

            let blend = CIFilter.blendWithMask()
            blend.inputImage      = sourceCI       // original pixels for subject area
            blend.backgroundImage = whiteBackground
            blend.maskImage       = maskedCI       // alpha mask from Vision

            guard let composited = blend.outputImage else {
                enhanceOnly(image: image, call: call)
                return
            }

            let enhanced = applyEnhancement(to: composited)
            returnResult(ciImage: enhanced, supported: true, hadSubject: true, call: call)

        } catch {
            print("[PhotoCleanup] Vision error: \(error) — falling back to enhance-only")
            enhanceOnly(image: image, call: call)
        }
    }

    // MARK: - Enhancement-only fallback (iOS < 17 or no subject detected)

    private func enhanceOnly(image: UIImage, call: CAPPluginCall) {
        guard let cgImage = image.cgImage else {
            call.reject("processPhoto: cannot create CGImage")
            return
        }
        let ciImage  = CIImage(cgImage: cgImage)
        let enhanced = applyEnhancement(to: ciImage)
        returnResult(ciImage: enhanced, supported: false, hadSubject: false, call: call)
    }

    // MARK: - Core Image enhancement pipeline

    /**
     Applies three sequential enhancements:
       1. Auto-adjustment (exposure, tone mapping, white balance)
       2. Vibrance boost — saturates muted colours without clipping vivid ones
       3. Luminance sharpening — crisper edges without colour fringing
     */
    private func applyEnhancement(to image: CIImage) -> CIImage {
        var current = image

        // 1. Auto-adjust: exposure + tone mapping (skip red-eye and face-aware)
        let options: [CIImageAutoAdjustmentOption: Any] = [
            .enhance:  true,
            .features: [],
        ]
        let adjustments = current.autoAdjustmentFilters(options: options)
        for filter in adjustments {
            filter.setValue(current, forKey: kCIInputImageKey)
            current = filter.outputImage ?? current
        }

        // 2. Vibrance — gentle saturation lift (+0.25 is subtle)
        if let vibrance = CIFilter(name: "CIVibrance") {
            vibrance.setValue(current,               forKey: kCIInputImageKey)
            vibrance.setValue(NSNumber(value: 0.25), forKey: "inputAmount")
            current = vibrance.outputImage ?? current
        }

        // 3. Luminance sharpening — 0.35 is noticeable but not crunchy
        if let sharpen = CIFilter(name: "CISharpenLuminance") {
            sharpen.setValue(current,               forKey: kCIInputImageKey)
            sharpen.setValue(NSNumber(value: 0.35), forKey: kCIInputSharpnessKey)
            current = sharpen.outputImage ?? current
        }

        return current
    }

    // MARK: - Helpers

    /** Resolve the Capacitor call with a JPEG-encoded CIImage. */
    private func returnResult(
        ciImage: CIImage,
        supported: Bool,
        hadSubject: Bool,
        call: CAPPluginCall
    ) {
        let context = CIContext(options: [.useSoftwareRenderer: false])
        guard
            let cgOut  = context.createCGImage(ciImage, from: ciImage.extent),
            let jpgData = UIImage(cgImage: cgOut).jpegData(compressionQuality: 0.88)
        else {
            call.reject("processPhoto: failed to encode output image")
            return
        }
        print("[PhotoCleanup] Done — supported:\(supported) hadSubject:\(hadSubject) size:\(jpgData.count / 1024)KB")
        call.resolve([
            "cleanedImageData": jpgData.base64EncodedString(),
            "supported":         supported,
            "hadSubject":        hadSubject,
        ])
    }

    /**
     Draw UIImage into a fresh context to bake EXIF orientation into pixel data.
     Vision's VNImageRequestHandler uses cgImage directly and ignores the UIImage
     orientation property, so we must normalise first.
     */
    private func normalizedImage(_ image: UIImage) -> UIImage {
        guard image.imageOrientation != .up else { return image }
        let renderer = UIGraphicsImageRenderer(size: image.size)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
        }
    }
}
