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
  #expect(Theme.default.light.font.familyBody.first == "-apple-system")
  #expect(Theme.default.light.font.familyHeading.isEmpty == false)
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
