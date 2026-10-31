// Copyright (c) Meta Platforms, Inc. and affiliates.

import CoreGraphics
import SwiftUI
@testable import Astryx

/// RGBA pixels of a view drawn at 1x, with an optional theme, color scheme,
/// and Dynamic Type size.
struct Pixels {
  let width: Int
  let height: Int
  private let bytes: [UInt8]

  @MainActor
  init<V: View>(
    _ view: V,
    theme: Theme? = nil,
    scheme: ColorScheme = .light,
    typeSize: DynamicTypeSize = .large
  ) {
    let themed = Group {
      if let theme { view.astryxTheme(theme) } else { view }
    }
    let renderer = ImageRenderer(
      content: themed.environment(\.colorScheme, scheme).environment(\.dynamicTypeSize, typeSize)
    )
    renderer.scale = 1
    let image = renderer.cgImage!
    width = image.width
    height = image.height
    var data = [UInt8](repeating: 0, count: width * height * 4)
    let context = CGContext(
      data: &data, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
      space: CGColorSpace(name: CGColorSpace.sRGB)!,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    bytes = data
  }

  /// The pixel at `x`, `y` from the top left, as RGBA components. A bitmap
  /// context stores its top row first.
  func at(_ x: Int, _ y: Int) -> [Int] {
    let i = (y * width + x) * 4
    return (0..<4).map { Int(bytes[i + $0]) }
  }

  func contains(where match: ([Int]) -> Bool) -> Bool {
    for y in 0..<height { for x in 0..<width where match(at(x, y)) { return true } }
    return false
  }
}

/// The components of a `#RRGGBBAA` token.
func rgba(_ hex: String) -> [Int] {
  let value = UInt32(hex.dropFirst(), radix: 16)!
  return [24, 16, 8, 0].map { Int((value >> UInt32($0)) & 0xFF) }
}

/// The components of a theme color, resolved in sRGB.
func rgba(_ color: Color) -> [Int] {
  let r = color.resolve(in: EnvironmentValues())
  return [r.red, r.green, r.blue, r.opacity].map { Int(($0 * 255).rounded()) }
}

func close(_ a: [Int], _ b: [Int], within tolerance: Int = 8) -> Bool {
  zip(a, b).allSatisfy { abs($0 - $1) <= tolerance }
}
