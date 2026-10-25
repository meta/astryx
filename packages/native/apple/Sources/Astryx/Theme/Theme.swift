// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from github.com/ejc3/astryx-swift (MIT).

import SwiftUI

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// A theme's light and dark tokens, as typed members (`Generated/Tokens.swift`).
/// Every `Theme.<name>` is generated from an Astryx theme by core's own
/// resolver (`Generated/`); `Theme.default` is core's defaults. An app
/// generates its own theme the same way.
public struct Theme: Equatable, Sendable {
  public var light: Tokens
  public var dark: Tokens
  /// Images that replace the defaults for shared icon names, or register a
  /// `<library>:<name>` name (AST-082 FR17): an SF Symbol, such as
  /// `["success": "checkmark.seal.fill"]`, or an app asset, such as
  /// `["close": .assetName("brand.close")]`.
  public var icons: [String: IconImage]
  /// Native visual intent from `defineNativeTheme`. Reserved: empty until a
  /// component reads it.
  public var native: NativeIntent

  public init(light: Tokens, dark: Tokens, icons: [String: IconImage] = [:], native: NativeIntent = .init()) {
    self.light = light
    self.dark = dark
    self.icons = icons
    self.native = native
  }
}

/// Native visual intent a theme carries beside its tokens (durable `material`,
/// platform entries), resolved for the running OS version. Reserved and empty
/// until the first component reads it.
public struct NativeIntent: Equatable, Sendable {
  public init() {}
}

/// The tokens a component paints with: one mode of the theme, grown by the
/// person's Dynamic Type setting. Components read every color, size, and font
/// from here, never from a constant of their own.
public struct AstryxStyle: Sendable {
  /// The theme's tokens in the current mode, as typed members
  /// (`tokens.color.textPrimary`).
  public let tokens: Tokens
  /// How much Dynamic Type grows text at the person's setting (1 at Large).
  public let textScale: CGFloat
  /// The theme's replacements for shared icon names.
  public let icons: [String: IconImage]
  /// Whether the person turned on Bold Text (`legibilityWeight == .bold`).
  public let isBoldText: Bool

  public init(
    tokens: Tokens, textScale: CGFloat = 1, icons: [String: IconImage] = [:], isBoldText: Bool = false
  ) {
    self.tokens = tokens
    self.textScale = textScale
    self.icons = icons
    self.isBoldText = isBoldText
  }

  /// A token color by its CSS name, for code that only has the name. A name
  /// the theme does not define draws clear. New code reads the typed members.
  public func color(_ token: String) -> Color {
    tokens.color.value(named: token) ?? .clear
  }

  /// A token size in points by its CSS name, or `fallback` when the theme does
  /// not define it. New code reads the typed members.
  public func size(_ token: String, _ fallback: CGFloat) -> CGFloat {
    tokens.space.value(named: token) ?? tokens.radius.value(named: token)
      ?? tokens.size.value(named: token) ?? tokens.font.number(named: token) ?? fallback
  }

  /// A step on the spacing ladder: `space(4)` reads `spacing-4`.
  public func space(_ step: Int) -> CGFloat {
    size("spacing-\(step)", CGFloat(step) * 4)
  }

  /// A token font size grown by Dynamic Type.
  public func fontSize(_ token: String, _ fallback: CGFloat) -> CGFloat {
    size(token, fallback) * textScale
  }

  /// The theme's font family at a token size and a token weight. The first
  /// family in the stack that the device has wins; a system family, such as
  /// `-apple-system` or `sans-serif`, is the system font.
  public func font(
    size token: String,
    _ fallback: CGFloat,
    weight: String,
    family: String = "font-family-body"
  ) -> Font {
    astryxFont(
      families: tokens.font.families(named: family) ?? [],
      size: fontSize(token, fallback),
      weight: fontWeight(size(weight, 400)),
      isBoldText: isBoldText
    )
  }

  /// The image for a shared icon name (AST-082 FR17): the theme's
  /// replacement, else the default SF Symbol. An unknown name stops a
  /// development build with a message that names it, and draws nothing in a
  /// release build.
  public func icon(_ name: String) -> IconImage? {
    if let image = icons[name] ?? astryxDefaultIcons[name].map(IconImage.systemName) { return image }
    assertionFailure("Astryx has no icon named \"\(name)\"")
    return nil
  }

  func fontWeight(_ value: CGFloat) -> Font.Weight {
    switch value {
    case ..<350: .light
    case 350..<450: .regular
    case 450..<550: .medium
    case 550..<650: .semibold
    case 650..<750: .bold
    default: .heavy
    }
  }
}

/// A font from a CSS family stack: the first system family or installed font.
/// System fonts follow Bold Text by themselves; an installed custom face is
/// drawn one weight step heavier when Bold Text is on (theme environment
/// spec, E1).
func astryxFont(families: [String], size: CGFloat, weight: Font.Weight, isBoldText: Bool = false) -> Font {
  for family in families {
    switch family.lowercased() {
    case "-apple-system", "blinkmacsystemfont", "system-ui", "ui-sans-serif", "sans-serif":
      return .system(size: size, weight: weight)
    case "ui-monospace", "monospace":
      return .system(size: size, weight: weight, design: .monospaced)
    case "ui-serif", "serif":
      return .system(size: size, weight: weight, design: .serif)
    case "ui-rounded":
      return .system(size: size, weight: weight, design: .rounded)
    default:
      if astryxFontIsInstalled(family) {
        // Fixed size: the size already carries the Dynamic Type scale.
        return .custom(family, fixedSize: size).weight(isBoldText ? astryxBoldTextWeight(weight) : weight)
      }
    }
  }
  return .system(size: size, weight: weight)
}

/// The weight a custom face draws at with Bold Text on: one step heavier,
/// with regular and medium both stepping to semibold, as iOS does for its own
/// text.
func astryxBoldTextWeight(_ weight: Font.Weight) -> Font.Weight {
  switch weight {
  case .ultraLight: .thin
  case .thin: .light
  case .light: .regular
  case .regular, .medium: .semibold
  case .semibold: .bold
  case .bold: .heavy
  case .heavy, .black: .black
  default: weight
  }
}

func astryxFontIsInstalled(_ name: String) -> Bool {
  #if canImport(UIKit)
  UIFont(name: name, size: 12) != nil
  #elseif canImport(AppKit)
  NSFont(name: name, size: 12) != nil
  #else
  false
  #endif
}

/// Dynamic Type's growth for body-sized text, as Apple's Body style grows
/// (17 pt at Large).
func astryxTextScale(for size: DynamicTypeSize) -> CGFloat {
  switch size {
  case .xSmall: 0.82
  case .small: 0.88
  case .medium: 0.94
  case .large: 1
  case .xLarge: 1.12
  case .xxLarge: 1.23
  case .xxxLarge: 1.35
  case .accessibility1: 1.6
  case .accessibility2: 1.9
  case .accessibility3: 2.35
  case .accessibility4: 2.75
  case .accessibility5: 3.1
  @unknown default: 1
  }
}

private struct AstryxThemeKey: EnvironmentKey {
  static let defaultValue = Theme.default
}

extension EnvironmentValues {
  /// The theme `astryxTheme(_:)` sets; core's default theme without it.
  public var astryxTheme: Theme {
    get { self[AstryxThemeKey.self] }
    set { self[AstryxThemeKey.self] = newValue }
  }

  /// The style components paint with: the theme's tokens for the current
  /// color scheme, grown by the person's text size. It follows Dark Mode and
  /// Dynamic Type with or without `astryxTheme(_:)`.
  public var astryx: AstryxStyle {
    let theme = astryxTheme
    return AstryxStyle(
      tokens: astryxTokens(theme, scheme: colorScheme, contrast: colorSchemeContrast),
      textScale: astryxTextScale(for: dynamicTypeSize),
      icons: theme.icons,
      isBoldText: legibilityWeight == .bold
    )
  }
}

/// A theme's tokens for a color scheme and contrast. With Increase Contrast
/// on, borders and separators use the emphasized border color, since core has
/// no contrast mode (theme generator spec, D4).
func astryxTokens(_ theme: Theme, scheme: ColorScheme, contrast: ColorSchemeContrast) -> Tokens {
  var tokens = scheme == .dark ? theme.dark : theme.light
  if contrast == .increased {
    tokens.color.border = tokens.color.borderEmphasized
  }
  return tokens
}

extension View {
  /// Paints this subtree with a theme. Components follow the color scheme and
  /// the person's text size either way.
  public func astryxTheme(_ theme: Theme = .default) -> some View {
    environment(\.astryxTheme, theme)
  }
}
