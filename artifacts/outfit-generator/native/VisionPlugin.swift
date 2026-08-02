/**
 * VisionPlugin — on-device image classification and text recognition.
 *
 * Runs two Vision requests against a caller-supplied base64 JPEG/PNG:
 *   • VNClassifyImageRequest  — scene/object labels (confidence ≥ 0.3)
 *   • VNRecognizeTextRequest  — OCR in accurate mode
 *
 * Both requests run synchronously on a background queue so the main thread
 * is never blocked.  Any error silently returns empty arrays so the JS layer
 * can persist visionVersion = 1 and avoid re-running.
 *
 * Resolves the Capacitor call with:
 *   { labels: string[], text: string[] }
 */

import Foundation
import Capacitor
import Vision
import UIKit

@objc(VisionPlugin)
public class VisionPlugin: CAPPlugin {

    @objc func analyzeImage(_ call: CAPPluginCall) {
        guard let b64 = call.getString("imageData") else {
            call.resolve(["labels": [], "text": []])
            return
        }
        guard
            let data   = Data(base64Encoded: b64, options: .ignoreUnknownCharacters),
            let uiImage = UIImage(data: data),
            let cgImage = uiImage.cgImage
        else {
            call.resolve(["labels": [], "text": []])
            return
        }

        DispatchQueue.global(qos: .utility).async {
            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

            // ── Classification ──────────────────────────────────────────────
            var labels: [String] = []
            let classifyRequest = VNClassifyImageRequest()
            do {
                try handler.perform([classifyRequest])
                if let results = classifyRequest.results {
                    labels = results
                        .filter { $0.confidence >= 0.3 }
                        .map    { $0.identifier }
                }
            } catch {
                print("[VisionPlugin] classify error: \(error)")
            }

            // ── Text recognition ────────────────────────────────────────────
            var recognizedText: [String] = []
            let textRequest = VNRecognizeTextRequest()
            textRequest.recognitionLevel = .accurate
            textRequest.usesLanguageCorrection = true
            do {
                try handler.perform([textRequest])
                if let observations = textRequest.results {
                    recognizedText = observations.compactMap {
                        $0.topCandidates(1).first?.string
                    }
                }
            } catch {
                print("[VisionPlugin] text recognition error: \(error)")
            }

            call.resolve(["labels": labels, "text": recognizedText])
        }
    }
}
