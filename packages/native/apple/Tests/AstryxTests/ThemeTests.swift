// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

@Test func defaultThemeCarriesCoreTokensInBothModes() {
  for tokens in [Theme.default.light, Theme.default.dark] {
    #expect(tokens.size.elementMd == 32)
    #expect(tokens.radius.element == 8)
    #expect(tokens.font.familyBody.isEmpty == false)
  }
  #expect(Theme.default.light.color.textPrimary != Theme.default.dark.color.textPrimary)
}

@Test func everyPublishedThemeIsGenerated() {
  let themes: [Theme] = [.default, .butter, .chocolate, .gothic, .matcha, .neutral, .stone, .y2k]
  #expect(Set(themes.map(\.light.color.accent.description)).count > 1)
  #expect(Theme.neutral.native == NativeIntent())
}

@Test func styleReadsTokensByNameAndFallsBackOnlyForSizes() {
  let style = AstryxStyle(tokens: Theme.default.light, textScale: 1.5)
  #expect(style.space(4) == Theme.default.light.space.s4)
  #expect(style.size("radius-element", 0) == 8)
  #expect(style.size("size-missing", 7) == 7)
  #expect(style.fontSize("text-body-size", 0) == Theme.default.light.font.bodySize * 1.5)
  #expect(style.color("color-accent") == Theme.default.light.color.accent)
  #expect(style.color("color-missing") == .clear)
}

@Test func rgbaColorsRead() {
  #expect(Color(astryxRGBA: 0x0064E0FF) == Color(.sRGB, red: 0, green: 100 / 255, blue: 224 / 255, opacity: 1))
}

@Test func hexColorsRead() {
  #expect(Color(astryxHex: "#0064E0FF") == Color(.sRGB, red: 0, green: 100 / 255, blue: 224 / 255, opacity: 1))
  #expect(Color(astryxHex: "#FFF") == Color(.sRGB, red: 1, green: 1, blue: 1, opacity: 1))
  #expect(Color(astryxHex: "not a color") == .clear)
}

@Test func textScaleFollowsDynamicType() {
  #expect(astryxTextScale(for: .large) == 1)
  #expect(astryxTextScale(for: .accessibility5) > astryxTextScale(for: .xxxLarge))
}
