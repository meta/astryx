// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

// AST-093 FR4 and FR5: a component renders from two different themes with no
// value of its own in between. Each test draws a component under core's
// default theme and under a second theme with a different color, type size,
// and corner shape, and reads the pixels.

/// Core's default tokens with a different accent, card, text color, type
/// size, and corner shape, in both modes.
private let secondTheme: Theme = {
  func restyle(_ base: Tokens) -> Tokens {
    var tokens = base
    tokens.color.accent = Color(astryxRGBA: 0xC2410CFF)
    tokens.color.backgroundCard = Color(astryxRGBA: 0xFDE68AFF)
    tokens.color.textPrimary = Color(astryxRGBA: 0xFF0000FF)
    tokens.font.label.size = 28
    tokens.font.body.size = 30
    tokens.radius.container = 0
    tokens.radius.element = 0
    return tokens
  }
  return Theme(light: restyle(Theme.default.light), dark: restyle(Theme.default.dark))
}()

@MainActor
@Test func cardFollowsTheThemesGroundAndShape() {
  let card = Astryx.Card { Color.clear.frame(width: 80, height: 40) }.frame(width: 120)
  let standard = Pixels(card, theme: .default)
  let second = Pixels(card, theme: secondTheme)

  let center = (second.width / 2, second.height / 2)
  #expect(close(standard.at(center.0, center.1), rgba(Theme.default.light.color.backgroundCard)))
  #expect(close(second.at(center.0, center.1), rgba("#FDE68AFF")))
  // Corner shape: the default container radius leaves the corner empty;
  // a radius of 0 fills it.
  #expect(standard.at(2, 2)[3] == 0)
  #expect(close(second.at(2, 2), rgba("#FDE68AFF")))
}

@MainActor
@Test func buttonFollowsTheThemesAccentTypeAndShape() {
  let button = Astryx.Button(label: "Continue", variant: .primary) {}.fixedSize()
  let standard = Pixels(button, theme: .default)
  let second = Pixels(button, theme: secondTheme)

  #expect(close(standard.at(8, standard.height / 2), rgba(Theme.default.light.color.accent)))
  #expect(close(second.at(8, second.height / 2), rgba("#C2410CFF")))
  // A larger label size makes the same label wider.
  #expect(second.width > standard.width)
}

@MainActor
@Test func textFollowsTheThemesColorAndTypeSize() {
  let text = Astryx.Text("Hello").fixedSize()
  let standard = Pixels(text, theme: .default)
  let second = Pixels(text, theme: secondTheme)

  #expect(second.width > standard.width)
  #expect(second.contains { $0[0] > 200 && $0[1] < 60 && $0[2] < 60 && $0[3] > 200 })
  #expect(!standard.contains { $0[0] > 200 && $0[1] < 60 && $0[2] < 60 && $0[3] > 200 })
}
