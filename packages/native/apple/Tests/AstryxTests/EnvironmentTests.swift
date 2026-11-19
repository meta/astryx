// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

// AST-082 FR11: components follow Dark Mode and Dynamic Type even without
// astryxTheme(_:).

@MainActor
@Test func withoutAThemeComponentsFollowDarkMode() {
  let card = Astryx.Card { Color.clear.frame(width: 80, height: 40) }.frame(width: 120)
  let light = Pixels(card, scheme: .light)
  let dark = Pixels(card, scheme: .dark)
  #expect(close(light.at(60, light.height / 2), rgba(Theme.default.light.color.backgroundCard)))
  #expect(close(dark.at(60, dark.height / 2), rgba(Theme.default.dark.color.backgroundCard)))
}

@MainActor
@Test func withoutAThemeTextFollowsDynamicType() {
  let large = Pixels(Astryx.Text("Hello").fixedSize())
  let larger = Pixels(Astryx.Text("Hello").fixedSize(), typeSize: .xxxLarge)
  #expect(larger.width > large.width)
}

@Test func fontStacksPickTheFirstFamilyTheDeviceHas() {
  #expect(astryxFont(families: ["-apple-system", "Helvetica"], size: 14, weight: .regular) == .system(size: 14, weight: .regular))
  #expect(astryxFont(families: ["Not A Real Font", "monospace"], size: 14, weight: .regular) == .system(size: 14, weight: .regular, design: .monospaced))
  #expect(astryxFont(families: ["Helvetica", "sans-serif"], size: 14, weight: .bold) == .custom("Helvetica", fixedSize: 14).weight(.bold))
  #expect(astryxFont(families: [], size: 14, weight: .regular) == .system(size: 14, weight: .regular))
}

@Test func theDefaultThemeCarriesCoresFontFamilies() {
  #expect(Theme.default.light.font.family.body.first == "-apple-system")
  #expect(Theme.default.light.font.family.heading.isEmpty == false)
}

// Theme environment spec, E1: with Bold Text on, a custom face from the
// theme's family list is drawn one weight step heavier; system fonts follow
// Bold Text by themselves.

@Test func boldTextStepsCustomFacesHeavier() {
  let steps: [(Font.Weight, Font.Weight)] = [
    (.ultraLight, .thin), (.thin, .light), (.light, .regular), (.regular, .semibold),
    (.medium, .semibold), (.semibold, .bold), (.bold, .heavy), (.heavy, .black), (.black, .black),
  ]
  for (weight, bolder) in steps {
    #expect(astryxBoldTextWeight(weight) == bolder)
  }
  #expect(
    astryxFont(families: ["Helvetica"], size: 14, weight: .regular, isBoldText: true)
      == .custom("Helvetica", fixedSize: 14).weight(.semibold))
  #expect(
    astryxFont(families: ["Helvetica"], size: 14, weight: .bold, isBoldText: true)
      == .custom("Helvetica", fixedSize: 14).weight(.heavy))
  #expect(
    astryxFont(families: ["-apple-system"], size: 14, weight: .regular, isBoldText: true)
      == .system(size: 14, weight: .regular))
}

@Test func theStyleReadsBoldTextFromTheEnvironment() {
  var environment = EnvironmentValues()
  #expect(environment.astryx.isBoldText == false)
  environment.legibilityWeight = .bold
  #expect(environment.astryx.isBoldText)
}

// Theme generator spec D4 and theme environment spec E1: with Increase
// Contrast on, borders use the emphasized border color.

@Test func increaseContrastEmphasizesBorders() {
  for scheme in [ColorScheme.light, .dark] {
    let mode = scheme == .dark ? Theme.default.dark : Theme.default.light
    let standard = astryxTokens(.default, scheme: scheme, contrast: .standard)
    let increased = astryxTokens(.default, scheme: scheme, contrast: .increased)
    #expect(standard.color.border == mode.color.border)
    #expect(increased.color.border == mode.color.borderEmphasized)
    #expect(increased.color.textPrimary == mode.color.textPrimary)
  }
}

@Test func theStyleCardsDrawWithFollowsContrast() {
  var environment = EnvironmentValues()
  #expect(environment.astryx.color("color-border") == Theme.default.light.color.border)
  environment.astryxTheme = .neutral
  #expect(environment.astryx.color("color-border") == Theme.neutral.light.color.border)
}

// Theme environment spec, E2 and E5: the theme writes SwiftUI's tint only,
// so stock controls carry the brand and keep their own label colors.

@MainActor
@Test func theThemeSetsSwiftUIsTint() {
  let swatch = Rectangle().fill(.tint).frame(width: 20, height: 20)
  let light = Pixels(swatch, theme: .default)
  #expect(close(light.at(10, 10), rgba(Theme.default.light.color.accent)))
  let dark = Pixels(swatch, theme: .default, scheme: .dark)
  #expect(close(dark.at(10, 10), rgba(astryxStockTint(Theme.default.dark.color.accent))))
}

@MainActor
@Test func theThemeLeavesThePrimaryForegroundToTheSystem() {
  let swatch = Rectangle().fill(.primary).frame(width: 20, height: 20)
  #expect(Pixels(swatch, theme: .butter).at(10, 10) == Pixels(swatch).at(10, 10))
}

#if os(iOS)
// On macOS, stock buttons and links are AppKit controls, which SwiftUI's image
// renderer does not draw; the iOS Simulator lane checks them.
@MainActor
@Test func aStockLinkAndBorderlessButtonTakeTheTint() {
  let accent = rgba(Theme.default.light.color.accent)
  let link = SwiftUI.Link("Link", destination: URL(string: "https://example.com")!)
    .font(.system(size: 48, weight: .black))
  let borderless = SwiftUI.Button("Go") {}.buttonStyle(.borderless)
    .font(.system(size: 48, weight: .black))
  #expect(Pixels(link.fixedSize(), theme: .default).contains { close($0, accent) })
  #expect(Pixels(borderless.fixedSize(), theme: .default).contains { close($0, accent) })
}

@MainActor
@Test func aProminentButtonKeepsItsWhiteLabelOnTheTint() {
  let button = SwiftUI.Button("Go") {}.buttonStyle(.borderedProminent)
    .font(.system(size: 48, weight: .black))
  let pixels = Pixels(button.fixedSize(), theme: .default)
  #expect(pixels.contains { close($0, rgba(Theme.default.light.color.accent)) })
  #expect(pixels.contains { $0[0] > 245 && $0[1] > 245 && $0[2] > 245 && $0[3] > 245 })
}

#endif

// Theme environment spec, E2: stock controls draw white on their tint, so a
// pale accent is not their tint; a single-mode theme sets its subtree's mode.

@Test func aPaleAccentLeavesStockControlsTheSystemTint() {
  for theme in [Theme.butter, .chocolate, .matcha, .neutral, .stone, .y2k, .gothic] {
    let accent = theme.dark.color.accent
    #expect(astryxContrast(.white, accent) < 3)
    #expect(astryxStockTint(accent) == .accentColor)
  }
  for accent in [Theme.default.light.color.accent, Theme.default.dark.color.accent, Theme.butter.light.color.accent] {
    #expect(astryxContrast(.white, accent) >= 3)
    #expect(astryxStockTint(accent) == accent)
  }
}

@Test func onlyASingleModeThemeSetsItsSubtreesMode() {
  #expect(Theme.gothic.singleMode == .dark)
  for theme in [Theme.default, .butter, .neutral, .stone, .y2k] {
    #expect(theme.singleMode == nil)
  }
}

@MainActor
@Test func gothicInALightAppearanceDrawsStockSurfacesDark() {
  let surface = Rectangle().fill(.background).frame(width: 20, height: 20)
  let plain = Pixels(surface, scheme: .light)
  let gothic = Pixels(surface, theme: .gothic, scheme: .light)
  let brightness = { (p: [Int]) in p[0] + p[1] + p[2] }
  #expect(brightness(gothic.at(10, 10)) < brightness(plain.at(10, 10)) / 2)
}

@MainActor
@Test func aDarkSectionInALightThemeGetsDarkColors() {
  // Core's default dark accent keeps its tint (3.11:1 against white), so the
  // swatch shows the dark-mode decision rather than the system fallback.
  let swatch = Rectangle().fill(.tint).frame(width: 20, height: 20)
  let pixels = Pixels(swatch.environment(\.colorScheme, .dark), theme: .default, scheme: .light)
  #expect(close(pixels.at(10, 10), rgba(Theme.default.dark.color.accent)))
}

@MainActor
@Test func anInnerThemeReplacesTheOuterTint() {
  let swatch = Rectangle().fill(.tint).frame(width: 20, height: 20).astryxTheme(.neutral)
  let pixels = Pixels(swatch, theme: .butter)
  #expect(close(pixels.at(10, 10), rgba(Theme.neutral.light.color.accent)))
}
