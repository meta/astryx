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
    let image = Icon.symbol(for: name, themeIcons: [:])
    #expect(image != nil, "no symbol for \(name.rawValue)")
    if case .systemName(let symbol) = image {
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

// AST-082 FR17 and Swift slots S2: a theme maps a name to an SF Symbol or to
// an image the app ships; a string literal is an SF Symbol name.

@Test func aThemeMapsANameToAnAppAsset() {
  let icons: [String: IconImage] = ["close": .assetName("brand.close"), "search": "sparkle.magnifyingglass"]
  #expect(Icon.symbol(for: .close, themeIcons: icons) == .assetName("brand.close"))
  #expect(Icon.symbol(for: .search, themeIcons: icons) == .systemName("sparkle.magnifyingglass"))
  let theme = Theme(light: Theme.default.light, dark: Theme.default.dark, icons: icons)
  #expect(AstryxStyle(tokens: theme.light, icons: theme.icons).icon("close") == .assetName("brand.close"))
}

@Test func aStringLiteralIsAnSFSymbolName() {
  let image: IconImage = "xmark"
  #expect(image == .systemName("xmark"))
  #expect(IconImage.systemName("xmark").image != nil)
}

@Test func aShippedAssetIsFoundAndAMissingOneIsNot() {
  // The test bundle stands in for the app's main bundle. IconImage.image stops
  // a development build for a missing asset, so a missing asset is checked
  // through the lookup it relies on instead of by drawing.
  #expect(astryxAppShipsAsset("astryx-test-icon", in: .module))
  #expect(IconImage.assetName("astryx-test-icon").image(in: .module) != nil)
  #expect(astryxAppShipsAsset("astryx.test.no-such-asset", in: .module) == false)
}

@Test func aMissingAssetDrawsNothingAndIsReported() {
  // As a release build sees it: the report does not stop the run, and the
  // image is nil, so the icon draws nothing. A development build's report is
  // assertionFailure, which stops it with the asset's name.
  var reported: [String] = []
  let image = IconImage.assetName("astryx.test.no-such-asset").image(in: .module) { reported.append($0) }
  #expect(image == nil)
  #expect(reported == ["astryx.test.no-such-asset"])
}

@MainActor
@Test func anAssetIconTakesTheTextRelativeSizeASymbolGets() {
  let asset = IconImage.assetName("astryx-test-icon")
  let small = Pixels(asset.sized(14, in: .module).fixedSize())
  let large = Pixels(asset.sized(28, in: .module).fixedSize())
  #expect(small.width > 0)
  #expect(large.width == small.width * 2)
  #expect(large.height == large.width)
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
