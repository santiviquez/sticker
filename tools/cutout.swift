// Cuts the subject out of a photo with macOS Vision's subject lifting
// (macOS 14+), crops a square around it, and prints where the googly eyes go.
//
//   swiftc -O tools/cutout.swift -o /tmp/cutout
//   /tmp/cutout photo.jpg me.png
//
// Optional, for a lighter file:
//   sips -Z 640 me.png && cwebp -q 86 -alpha_q 100 -exact me.png -o me.webp
import CoreImage
import CoreImage.CIFilterBuiltins
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count >= 3 else {
  print("usage: cutout <photo> <out.png>")
  exit(1)
}
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])

guard let ci = CIImage(contentsOf: input, options: [.applyOrientationProperty: true]) else {
  fatalError("can't read \(input.path)")
}
let extent = ci.extent
let handler = VNImageRequestHandler(ciImage: ci)
let subject = VNGenerateForegroundInstanceMaskRequest()
let faces = VNDetectFaceLandmarksRequest()
try handler.perform([subject, faces])
guard let result = subject.results?.first else { fatalError("no subject found") }
let mask = CIImage(cvPixelBuffer: try result.generateScaledMaskForImage(forInstances: result.allInstances, from: handler))

// The subject's bounds, from the mask (Core Image's origin is bottom-left).
let ctx = CIContext()
let W = Int(extent.width)
let H = Int(extent.height)
var px = [UInt8](repeating: 0, count: W * H)
ctx.render(mask, toBitmap: &px, rowBytes: W, bounds: extent, format: .L8, colorSpace: nil)
var minX = W, minY = H, maxX = 0, maxY = 0
for row in 0..<H {
  for x in 0..<W where px[row * W + x] > 127 {
    let y = H - 1 - row
    minX = min(minX, x); maxX = max(maxX, x)
    minY = min(minY, y); maxY = max(maxY, y)
  }
}
guard maxX > minX else { fatalError("empty subject") }

// A square around it with a little room, so the die-cut border fits.
let side = Double(max(maxX - minX, maxY - minY)) * 1.04
let square = CGRect(
  x: Double(minX + maxX) / 2 - side / 2,
  y: Double(minY + maxY) / 2 - side / 2,
  width: side,
  height: side
).integral

let blend = CIFilter.blendWithMask()
blend.inputImage = ci
blend.backgroundImage = CIImage.empty()
blend.maskImage = mask
// Padded onto a transparent square, even where the square runs past the photo.
let canvas = CGRect(origin: .zero, size: square.size)
let cut = blend.outputImage!.cropped(to: square)
  .transformed(by: CGAffineTransform(translationX: -square.minX, y: -square.minY))
  .composited(over: CIImage(color: CIColor.clear).cropped(to: canvas))
  .cropped(to: canvas)
try ctx.writePNGRepresentation(
  of: cut, to: output, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
print("wrote \(output.path) (\(Int(square.width))px square)")

// Pupils, as fractions of the square with the origin top-left, as the sticker expects.
guard let face = faces.results?.first,
  let l = face.landmarks?.leftPupil?.normalizedPoints.first,
  let r = face.landmarks?.rightPupil?.normalizedPoints.first
else {
  print("no face found; leave eyes off, or place them in the lab")
  exit(0)
}
func place(_ p: CGPoint) -> (Double, Double) {
  let b = face.boundingBox
  let x = (b.minX + p.x * b.width) * extent.width
  let y = (b.minY + p.y * b.height) * extent.height
  return ((x - square.minX) / square.width, 1 - (y - square.minY) / square.height)
}
let eyes = [place(l), place(r)].sorted { $0.0 < $1.0 }
let size = 0.35 * hypot(eyes[1].0 - eyes[0].0, eyes[1].1 - eyes[0].1)
let f = { (n: Double) in String(format: "%.3f", n) }
print("eyes: { left: { x: \(f(eyes[0].0)), y: \(f(eyes[0].1)) }, right: { x: \(f(eyes[1].0)), y: \(f(eyes[1].1)) }, size: \(f(size)) }")
