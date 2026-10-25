// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
import SwiftUI

/// One symbol for a shared icon name, at core's icon size and color, hidden
/// from VoiceOver unless it carries a label (core `Icon`).
///
/// ```swift
/// Icon(.search)
/// Icon(.success, color: .success, label: "Completed")
/// ```
public struct Icon: View {
  /// The contract the view draws, the same for both initializers.
  public let props: IconProps
  @Environment(\.astryx) private var astryx
  @Environment(\.astryxIconDefaultSize) private var contextualSize

  /// An icon from its labeled props.
  /// - Parameters:
  ///   - icon: The shared icon name to draw (core `icon`).
  ///   - color: The icon color token; `nil` keeps the surrounding foreground (core `color`).
  ///   - size: The icon size; `nil` takes the owning component's icon size, else `md` (core `size`).
  ///   - label: The accessible name of a meaningful icon; `nil` or empty keeps it decorative (core `label`).
  public init(_ icon: IconName, color: IconColor? = nil, size: IconSize? = nil, label: String? = nil) {
    self.init(IconProps(icon: icon, color: color, size: size, label: label))
  }

  /// An icon from its generated contract, for generated and wire-driven callers.
  public init(_ props: IconProps) {
    self.props = props
  }

  public var body: some View {
    if props.base.isHidden != true {
      if let source = Icon.symbol(for: props.icon, themeIcons: astryx.icons) {
        let side = Icon.points(for: resolvedSize) * astryx.textScale
        // An asset the app does not ship draws nothing (IconImage.image).
        source.image?
          .resizable()
          .scaledToFit()
          .frame(width: side, height: side)
          .modifier(IconTint(color: tint))
          .modifier(IconAccessibility(label: accessibilityLabel))
          .modifier(IconIdentifier(id: props.base.id))
      } else {
        // AST-082 FR17: a name nothing maps draws nothing, never a substitute.
        let _ = assertionFailure("Astryx has no icon named \"\(props.icon.rawValue)\"")
      }
    }
  }

  /// The size the icon draws at: its own, else its owner's icon size, else `md`.
  var resolvedSize: IconSize {
    props.size ?? contextualSize ?? .md
  }

  /// The theme color the icon draws in, or `nil` to keep the surrounding
  /// foreground (`inherit`).
  var tint: Color? {
    Icon.color(for: props.color ?? .inherit, in: astryx.tokens)
  }

  /// The name VoiceOver reads, or `nil` when the icon is decorative.
  var accessibilityLabel: String? {
    guard let label = props.label, !label.isEmpty else { return nil }
    return label
  }

  /// Core's fixed icon scale in points at the default text size: 12, 16, 20,
  /// and 24, as core's 0.75, 1, 1.25, and 1.5 rem.
  nonisolated static func points(for size: IconSize) -> CGFloat {
    switch size {
    case .xsm: 12
    case .sm: 16
    case .md: 20
    case .lg: 24
    }
  }

  /// The theme token each color draws with, as core maps them; `inherit` has none.
  nonisolated static func color(for color: IconColor, in tokens: Tokens) -> Color? {
    switch color {
    case .primary: tokens.color.iconPrimary
    case .secondary, .tertiary: tokens.color.iconSecondary
    case .disabled: tokens.color.iconDisabled
    case .accent: tokens.color.accent
    case .success: tokens.color.success
    case .error: tokens.color.error
    case .warning: tokens.color.warning
    case .inherit: nil
    }
  }

  /// The SF Symbol a name draws: the theme's mapping (which also registers a
  /// `<library>:<name>` name), else the platform default; `nil` for a name
  /// neither maps.
  nonisolated static func symbol(for name: IconName, themeIcons: [String: IconImage]) -> IconImage? {
    themeIcons[name.rawValue] ?? astryxDefaultIcons[name.rawValue].map(IconImage.systemName)
  }
}

/// A labeled icon reads as an image with its label; an unlabeled one is
/// hidden from VoiceOver (AST-082 FR17).
private struct IconAccessibility: ViewModifier {
  let label: String?

  func body(content: Content) -> some View {
    if let label {
      content.accessibilityLabel(label)
    } else {
      content.accessibilityHidden(true)
    }
  }
}

/// A theme color, or no style of its own so the surrounding foreground
/// reaches the symbol (`inherit`).
private struct IconTint: ViewModifier {
  let color: Color?

  func body(content: Content) -> some View {
    if let color {
      content.foregroundStyle(color)
    } else {
      content
    }
  }
}

/// The base `id` becomes the accessibility identifier (AST-082 FR7).
private struct IconIdentifier: ViewModifier {
  let id: String?

  func body(content: Content) -> some View {
    if let id {
      content.accessibilityIdentifier(id)
    } else {
      content
    }
  }
}

private struct AstryxIconDefaultSizeKey: EnvironmentKey {
  static let defaultValue: IconSize? = nil
}

extension EnvironmentValues {
  /// The icon size a component gives the icons in its documented icon slot;
  /// an `Icon` with no size of its own draws at it (core's contextual size).
  var astryxIconDefaultSize: IconSize? {
    get { self[AstryxIconDefaultSizeKey.self] }
    set { self[AstryxIconDefaultSizeKey.self] = newValue }
  }
}
