import AppKit

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let outDir = root.appendingPathComponent("assets/tray", isDirectory: true)
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

func drawBrow(size: CGFloat, url: URL) throws {
  guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: Int(size),
    pixelsHigh: Int(size),
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else {
    throw NSError(domain: "ClawBrowIcon", code: 1)
  }
  bitmap.size = NSSize(width: size, height: size)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
  NSColor.clear.setFill()
  NSRect(x: 0, y: 0, width: size, height: size).fill()

  let scale = size / 16.0
  let path = NSBezierPath()
  path.move(to: NSPoint(x: 1.7 * scale, y: 5.4 * scale))
  path.curve(
    to: NSPoint(x: 14.6 * scale, y: 9.9 * scale),
    controlPoint1: NSPoint(x: 4.3 * scale, y: 8.8 * scale),
    controlPoint2: NSPoint(x: 9.1 * scale, y: 10.2 * scale)
  )
  path.curve(
    to: NSPoint(x: 14.3 * scale, y: 11.9 * scale),
    controlPoint1: NSPoint(x: 15.6 * scale, y: 9.8 * scale),
    controlPoint2: NSPoint(x: 15.1 * scale, y: 11.3 * scale)
  )
  path.curve(
    to: NSPoint(x: 3.0 * scale, y: 6.9 * scale),
    controlPoint1: NSPoint(x: 10.6 * scale, y: 14.0 * scale),
    controlPoint2: NSPoint(x: 6.1 * scale, y: 12.2 * scale)
  )
  path.curve(
    to: NSPoint(x: 1.7 * scale, y: 5.4 * scale),
    controlPoint1: NSPoint(x: 2.6 * scale, y: 6.2 * scale),
    controlPoint2: NSPoint(x: 2.1 * scale, y: 5.7 * scale)
  )
  path.close()

  NSColor.black.setFill()
  path.fill()
  NSGraphicsContext.restoreGraphicsState()

  guard let png = bitmap.representation(using: .png, properties: [:]) else {
    throw NSError(domain: "ClawBrowIcon", code: 1)
  }
  try png.write(to: url)
}

try drawBrow(size: 16, url: outDir.appendingPathComponent("BrowTemplate.png"))
try drawBrow(size: 32, url: outDir.appendingPathComponent("BrowTemplate@2x.png"))
