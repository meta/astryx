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
    tokens.color.accent = Color(.sRGB, red: 194 / 255, green: 65 / 255, blue: 12 / 255, opacity: 1)
    tokens.color.backgroundCard = Color(.sRGB, red: 253 / 255, green: 230 / 255, blue: 138 / 255, opacity: 1)
    tokens.color.textPrimary = Color(.sRGB, red: 1, green: 0, blue: 0, opacity: 1)
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

@MainActor
@Test func textInputFollowsTheThemesTextColorAndTypeSize() {
  // Read-only draws its value as text, which an image renderer can read; an
  // editable field is a platform text field it does not draw.
  let field = Astryx.TextInput(label: "Name", value: "Ada", isLabelHidden: true, isReadOnly: true).frame(width: 240)
  let standard = Pixels(field, theme: .default)
  let second = Pixels(field, theme: secondTheme)
  #expect(second.contains { close($0, rgba("#FF0000FF"), within: 24) })
  #expect(!standard.contains { close($0, rgba("#FF0000FF"), within: 24) })
  // A body size past the 44-point minimum makes the field taller.
  var large = secondTheme
  large.light.font.body.size = 60
  #expect(Pixels(field, theme: large).height > standard.height)
}

// Theme tokens INV11: a status uses its border, icon, and on-muted roles, so a
// theme that sets them draws them, and Core's defaults stay legible.

@MainActor
@Test func textInputStatusDrawsTheThemesStatusRoles() {
  var theme = Theme.default
  theme.light.color.borderWarning = Color(.sRGB, red: 1, green: 0, blue: 1, opacity: 1)
  theme.light.color.onWarningMuted = Color(.sRGB, red: 0, green: 1, blue: 1, opacity: 1)
  let field = Astryx.TextInput(
    label: "Domain", value: "example.org", isReadOnly: true,
    status: TextInputStatus(type: .warning, message: "Not your company domain")
  ).frame(width: 260)
  let pixels = Pixels(field, theme: theme)
  #expect(pixels.contains { close($0, [255, 0, 255, 255], within: 6) })
  #expect(pixels.contains { close($0, [0, 255, 255, 255], within: 40) })
}

@MainActor
@Test func statusMessagesMeetTheirContrastFloorInEveryTheme() {
  for theme in [Theme.default, .butter, .chocolate, .matcha, .neutral, .stone, .y2k, .gothic] {
    for tokens in [theme.light, theme.dark] {
      let c = tokens.color
      for (content, ground) in [(c.onErrorMuted, c.errorMuted), (c.onWarningMuted, c.warningMuted), (c.onSuccessMuted, c.successMuted)] {
        // Muted grounds are translucent; compose them over the card ground.
        let composed = astryxComposite(ground, over: c.backgroundCard)
        #expect(astryxContrast(content, composed) >= 4.5)
      }
      for border in [c.borderError, c.borderWarning, c.borderSuccess] {
        #expect(astryxContrast(border, c.backgroundCard) >= 3)
      }
    }
  }
}

/// A translucent color drawn over an opaque one, in sRGB.
private func astryxComposite(_ top: Color, over under: Color) -> Color {
  let t = top.resolve(in: EnvironmentValues())
  let u = under.resolve(in: EnvironmentValues())
  let a = Double(t.opacity)
  func mix(_ x: Float, _ y: Float) -> Double { Double(x) * a + Double(y) * (1 - a) }
  return Color(.sRGB, red: mix(t.red, u.red), green: mix(t.green, u.green), blue: mix(t.blue, u.blue), opacity: 1)
}

@MainActor
@Test func bannerFollowsTheThemesTextColorAndTypeSize() {
  let banner = Astryx.Banner(status: .info, title: "Saved").frame(width: 240)
  let standard = Pixels(banner, theme: .default)
  let second = Pixels(banner, theme: secondTheme)
  #expect(second.contains { close($0, rgba("#FF0000FF"), within: 24) })
  #expect(!standard.contains { close($0, rgba("#FF0000FF"), within: 24) })
  // A larger body size makes the banner taller.
  #expect(second.height > standard.height)
}
