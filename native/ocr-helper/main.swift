import Foundation
import Vision
import ImageIO

struct OcrObservation: Encodable {
  let text: String
  let confidence: Float
  let box: [Double]
}

struct OcrResponse: Encodable {
  let engine: String
  let text: String
  let confidence: Float?
  let observations: [OcrObservation]
}

struct ErrorResponse: Encodable {
  let error: String
}

func writeJson<T: Encodable>(_ value: T, to handle: FileHandle = FileHandle.standardOutput) {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.withoutEscapingSlashes]
  do {
    let data = try encoder.encode(value)
    handle.write(data)
    handle.write(Data("\n".utf8))
  } catch {
    let fallback = #"{"error":"failed_to_encode_json"}"# + "\n"
    handle.write(Data(fallback.utf8))
  }
}

func fail(_ message: String) -> Never {
  writeJson(ErrorResponse(error: message), to: FileHandle.standardError)
  exit(1)
}

let args = CommandLine.arguments.dropFirst()
guard let imagePath = args.first else {
  fail("usage: ClawSenseOCR <image-path>")
}

let imageUrl = URL(fileURLWithPath: imagePath)
guard FileManager.default.fileExists(atPath: imageUrl.path) else {
  fail("image_not_found")
}

guard
  let imageSource = CGImageSourceCreateWithURL(imageUrl as CFURL, nil),
  let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil)
else {
  fail("image_decode_failed")
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["ja-JP", "en-US"]
request.usesLanguageCorrection = true
request.minimumTextHeight = 0.004

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
  try handler.perform([request])
} catch {
  fail("vision_ocr_failed: \(error.localizedDescription)")
}

let observations = (request.results ?? [])
  .compactMap { observation -> OcrObservation? in
    guard let candidate = observation.topCandidates(1).first else {
      return nil
    }
    let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.isEmpty {
      return nil
    }
    let box = observation.boundingBox
    return OcrObservation(
      text: text,
      confidence: candidate.confidence,
      box: [box.origin.x, box.origin.y, box.size.width, box.size.height].map(Double.init)
    )
  }
  .sorted { lhs, rhs in
    let lhsY = lhs.box[1]
    let rhsY = rhs.box[1]
    if abs(lhsY - rhsY) > 0.015 {
      return lhsY > rhsY
    }
    return lhs.box[0] < rhs.box[0]
  }

let joined = observations.map(\.text).joined(separator: "\n")
let averageConfidence: Float?
if observations.isEmpty {
  averageConfidence = nil
} else {
  averageConfidence = observations.map(\.confidence).reduce(0, +) / Float(observations.count)
}

writeJson(
  OcrResponse(
    engine: "apple-vision",
    text: joined,
    confidence: averageConfidence,
    observations: observations
  )
)
