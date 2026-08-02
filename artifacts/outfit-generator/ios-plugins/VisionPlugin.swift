/**
 * VisionPlugin.swift
 *
 * After running `npx cap add ios && npx cap sync`, copy this file to:
 *   ios/App/App/VisionPlugin.swift
 * and add it to the Xcode target (Build Phases → Compile Sources).
 *
 * Runs VNClassifyImageRequest (threshold 0.3) + VNRecognizeTextRequest (accurate)
 * on a background queue. Returns { labels: [String], text: [String] }.
 * Falls back silently to empty arrays on any error.
 */

import Foundation
import Capacitor
import Vision
import UIKit

@objc(VisionPlugin)
public class VisionPlugin: CAPPlugin {

    @objc func analyzeImage(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString) else {
            call.resolve(["labels": [], "text": []])
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            guard let imageData = try? Data(contentsOf: url),
                  let uiImage  = UIImage(data: imageData),
                  let cgImage  = uiImage.cgImage else {
                call.resolve(["labels": [], "text": []])
                return
            }

            var labels: [String] = []
            var textItems: [String] = []
            let group = DispatchGroup()

            // Classification
            group.enter()
            let classifyReq = VNClassifyImageRequest { request, error in
                defer { group.leave() }
                guard error == nil,
                      let results = request.results as? [VNClassificationObservation] else { return }
                labels = results
                    .filter { $0.confidence >= 0.3 }
                    .map    { $0.identifier }
            }

            // OCR
            group.enter()
            let textReq = VNRecognizeTextRequest { request, error in
                defer { group.leave() }
                guard error == nil,
                      let results = request.results as? [VNRecognizedTextObservation] else { return }
                textItems = results.compactMap { $0.topCandidates(1).first?.string }
            }
            textReq.recognitionLevel = .accurate

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            try? handler.perform([classifyReq, textReq])

            group.notify(queue: .main) {
                call.resolve(["labels": labels, "text": textItems])
            }
        }
    }
}
