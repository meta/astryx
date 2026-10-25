// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

// Swift Icon spec (component:swift/Icon): one SF Symbol per shared icon name,
// at core's icon size and color, decorative unless labeled.

@Test func everyBuiltInNameDrawsASymbolThePlatformHas() {
  #expect(IconName.builtIn.count == astryxDefaultIcons.count)
  for name in IconName.builtIn {
    let symbol = Icon.symbol(for: name, themeIcons: [:])
    #expect(symbol != nil, "no symbol for \(name.rawValue)")
    if let symbol {
      #if canImport(UIKit)
      #expect(UIImage(systemName: symbol) != nil, "\(symbol) is not an SF Symbol here")
      #elseif canImport(AppKit)
      #expect(NSImage(systemSymbolName: symbol, accessibilityDescription: nil) != nil, "\(symbol) is not an SF Symbol here")
      #endif
    }
  }
}

@Test func aThemeReplacesASymbolAndRegistersALibraryName() {
  #expect(Icon.symbol(for: .search, themeIcons: [:]) == "magnifyingglass")
  #expect(Icon.symbol(for: .search, themeIcons: ["search": "sparkle.magnifyingglass"]) == "sparkle.magnifyingglass")
  #expect(Icon.symbol(for: "acme:rocket", themeIcons: ["acme:rocket": "airplane"]) == "airplane")
  // An unregistered name maps to nothing; the view then draws nothing.
  #expect(Icon.symbol(for: "acme:rocket", themeIcons: [:]) == nil)
}

@Test func iconNamesAreStringsOnTheWire() throws {
  let encoded = try JSONEncoder().encode([IconName.chevronDown, "acme:rocket"])
  #expect(String(decoding: encoded, as: UTF8.self) == #"["chevronDown","acme:rocket"]"#)
  #expect(try JSONDecoder().decode([IconName].self, from: encoded) == [.chevronDown, "acme:rocket"])
}

@MainActor
@Test func iconInitializersBuildTheSameProps() {
  let labeled = Icon(.success, color: .success, size: .lg, label: "Completed").props
  let fromProps = Icon(IconProps(icon: .success, color: .success, size: .lg, label: "Completed")).props
  #expect(labeled.icon == fromProps.icon)
  #expect(labeled.color == fromProps.color)
  #expect(labeled.size == fromProps.size)
  #expect(labeled.label == fromProps.label)
  #expect(labeled.base == fromProps.base)

  let defaults = Icon(.search).props
  #expect(defaults.color == nil)
  #expect(defaults.size == nil)
  #expect(defaults.label == nil)
}

@MainActor
@Test func anExplicitSizeWinsThenTheOwnersThenMedium() {
  #expect(Icon(.search).resolvedSize == .md)
  #expect(Icon(.search, size: .sm).resolvedSize == .sm)
  #expect(Icon.points(for: .xsm) == 12)
  #expect(Icon.points(for: .sm) == 16)
  #expect(Icon.points(for: .md) == 20)
  #expect(Icon.points(for: .lg) == 24)

  let owned = Pixels(Icon(.stop, color: .primary).environment(\.astryxIconDefaultSize, .lg).fixedSize())
  #expect(owned.width == 24)
  let explicit = Pixels(Icon(.stop, color: .primary, size: .xsm).environment(\.astryxIconDefaultSize, .lg).fixedSize())
  #expect(explicit.width == 12)
}

@Test func colorsDrawCoresTokensAndInheritKeepsTheForeground() {
  let tokens = Theme.default.light
  #expect(Icon.color(for: .primary, in: tokens) == tokens.color.iconPrimary)
  #expect(Icon.color(for: .secondary, in: tokens) == tokens.color.iconSecondary)
  #expect(Icon.color(for: .tertiary, in: tokens) == tokens.color.iconSecondary)
  #expect(Icon.color(for: .disabled, in: tokens) == tokens.color.iconDisabled)
  #expect(Icon.color(for: .accent, in: tokens) == tokens.color.accent)
  #expect(Icon.color(for: .success, in: tokens) == tokens.color.success)
  #expect(Icon.color(for: .error, in: tokens) == tokens.color.error)
  #expect(Icon.color(for: .warning, in: tokens) == tokens.color.warning)
  #expect(Icon.color(for: .inherit, in: tokens) == nil)
}

@MainActor
@Test func anInheritIconTakesTheSurroundingForeground() {
  let red = [255, 0, 0, 255]
  let inherit = Pixels(Icon(.stop, size: .lg).foregroundStyle(Color(red: 1, green: 0, blue: 0)).fixedSize())
  #expect(inherit.contains { close($0, red) })
  let colored = Pixels(Icon(.stop, color: .accent, size: .lg).foregroundStyle(Color(red: 1, green: 0, blue: 0)).fixedSize())
  #expect(!colored.contains { close($0, red) })
}

// FR5 accessibility: what the view sets. The rendered accessibility tree is
// not measured until an app-hosted target exists.
@MainActor
@Test func aLabeledIconIsNamedAndAnUnlabeledOneIsDecorative() {
  #expect(Icon(.success, label: "Completed").accessibilityLabel == "Completed")
  #expect(Icon(.success).accessibilityLabel == nil)
  #expect(Icon(.success, label: "").accessibilityLabel == nil)
}

@MainActor
@Test func anIconDrawsInItsThemeColor() {
  let accent = rgba(Theme.default.light.color.accent)
  let icon = Pixels(Icon(.stop, color: .accent, size: .lg).fixedSize())
  #expect(icon.width == 24 && icon.height == 24)
  #expect(icon.contains { close($0, accent) })
}

@MainActor
@Test func anIconRendersFromTwoThemesWithNoColorOfItsOwn() {
  let view = Icon(.stop, color: .accent, size: .lg).fixedSize()
  let neutral = Pixels(view, theme: .neutral)
  let butter = Pixels(view, theme: .butter)
  #expect(neutral.contains { close($0, rgba(Theme.neutral.light.color.accent)) })
  #expect(butter.contains { close($0, rgba(Theme.butter.light.color.accent)) })
  #expect(!butter.contains { close($0, rgba(Theme.neutral.light.color.accent)) })
}

@MainActor
@Test func anIconGrowsWithTheLargestTextSize() {
  let large = Pixels(Icon(.stop, color: .primary).fixedSize())
  let largest = Pixels(Icon(.stop, color: .primary).fixedSize(), typeSize: .accessibility5)
  #expect(large.width == 20)
  #expect(largest.width > large.width)
}

@MainActor
@Test func aHiddenIconDrawsNothing() {
  let hidden = Pixels(
    HStack(spacing: 0) {
      Color.clear.frame(width: 1, height: 1)
      Icon(IconProps(icon: .stop, base: AstryxBaseProps(isHidden: true)))
    }.fixedSize()
  )
  #expect(hidden.width == 1)
}
