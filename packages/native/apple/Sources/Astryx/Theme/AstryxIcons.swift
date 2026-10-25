// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// The image a shared icon name draws on Apple platforms (AST-082 FR17): an SF
/// Symbol, or an image the app ships in its asset catalog. A string literal is
/// an SF Symbol name, so `["success": "checkmark.seal.fill"]` maps a symbol.
public enum IconImage: Equatable, Hashable, Sendable, ExpressibleByStringLiteral {
  /// An SF Symbol, by its system name.
  case systemName(String)
  /// An image in the app's main bundle asset catalog, by its asset name.
  case assetName(String)

  public init(stringLiteral value: String) {
    self = .systemName(value)
  }

  /// The image to draw. An asset the app does not ship stops a development
  /// build with a message that names the asset, and draws nothing in a release
  /// build, as an unknown icon name does (AST-082 FR17). An asset draws as its
  /// asset catalog renders it: a template image takes the icon's color, an
  /// original image keeps its own colors.
  public var image: Image? { image(in: .main) }

  /// The image from `bundle`: the app's main bundle in an app, a test bundle
  /// in tests. A missing asset is reported through `reportMissing`, which
  /// stops a development build (`assertionFailure` does nothing in a release
  /// build), and the image is nil, so nothing draws.
  func image(
    in bundle: Bundle,
    reportMissing: (String) -> Void = { assertionFailure("Astryx: an icon maps to the asset \"\($0)\", which the app does not ship") }
  ) -> Image? {
    switch self {
    case .systemName(let name):
      return Image(systemName: name)
    case .assetName(let name):
      guard astryxAppShipsAsset(name, in: bundle) else {
        reportMissing(name)
        return nil
      }
      return Image(name, bundle: bundle)
    }
  }

  /// The icon at a text size. An SF Symbol scales with the font the caller
  /// applies; an asset, which has no font size, fits a square `side` points
  /// wide, the same text-relative size, grown with Dynamic Type.
  @ViewBuilder func sized(_ side: CGFloat, in bundle: Bundle = .main) -> some View {
    if let image = image(in: bundle) {
      switch self {
      case .systemName: image
      case .assetName: image.resizable().scaledToFit().frame(width: side, height: side)
      }
    }
  }
}

/// Whether `bundle` has an image asset with this name.
func astryxAppShipsAsset(_ name: String, in bundle: Bundle = .main) -> Bool {
  #if canImport(UIKit)
  UIImage(named: name, in: bundle, with: nil) != nil
  #elseif canImport(AppKit)
  bundle.image(forResource: name) != nil
  #else
  false
  #endif
}

/// The SF Symbol each of Astryx's built-in icon names draws by default on
/// Apple platforms (AST-082 FR17). A test keeps this map equal to
/// `NATIVE_ICON_DEFAULTS` in `@astryxdesign/native`; a theme replaces any
/// entry through `Theme(icons:)`, with an SF Symbol or an app asset.
let astryxDefaultIcons: [String: String] = [
  "close": "xmark",
  "chevronDown": "chevron.down",
  "chevronLeft": "chevron.left",
  "chevronRight": "chevron.right",
  "chevronsLeft": "chevron.left.2",
  "chevronsRight": "chevron.right.2",
  "check": "checkmark",
  "success": "checkmark.circle.fill",
  "error": "exclamationmark.circle.fill",
  "warning": "exclamationmark.triangle.fill",
  "info": "info.circle.fill",
  "calendar": "calendar",
  "clock": "clock",
  "externalLink": "arrow.up.right.square",
  "menu": "line.3.horizontal",
  "moreHorizontal": "ellipsis",
  "search": "magnifyingglass",
  "upload": "square.and.arrow.up",
  "arrowUp": "arrow.up",
  "arrowDown": "arrow.down",
  "arrowsUpDown": "arrow.up.arrow.down",
  "funnel": "line.3.horizontal.decrease",
  "eyeSlash": "eye.slash",
  "viewColumns": "rectangle.split.3x1",
  "copy": "doc.on.doc",
  "checkDouble": "checkmark.message",
  "wrench": "wrench.adjustable",
  "stop": "stop.fill",
  "microphone": "mic",
]
