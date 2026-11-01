// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

// A Swift Button meets the system's Liquid Glass in a bar or a floating
// container on iOS and iPadOS 26, keeps its variant's meaning there, and draws
// a solid token fill under Reduce Transparency or Increase Contrast
// (component:swift/Button FR7–FR10, ORD2).

private func surface(
  _ variant: ButtonVariant?, _ placement: ButtonPlacement, solid: Bool = false, glass: Bool = true
) -> ButtonSurface {
  ButtonSurface.resolve(variant: variant, placement: placement, glassAvailable: glass, prefersSolid: solid)
}

@Test func everyVariantMapsToItsGlassInABarAndFloating() {
  // FR8's table: a set variant keeps its meaning; only secondary and ghost
  // share the bar's glass.
  #expect(surface(.primary, .bar) == .glass(.prominent(.accent)))
  #expect(surface(.primary, .floating) == .glass(.prominent(.accent)))
  #expect(surface(.destructive, .bar) == .glass(.prominent(.error)))
  #expect(surface(.destructive, .floating) == .glass(.prominent(.error)))
  #expect(surface(.secondary, .bar) == .glass(.barItem))
  #expect(surface(.secondary, .floating) == .glass(.regular))
  #expect(surface(.ghost, .bar) == .glass(.barItem))
  #expect(surface(.ghost, .floating) == .glass(.clear))
}

@Test func anUnsetVariantIsSecondaryEverywhere() {
  for placement in [ButtonPlacement.content, .bar, .floating] {
    #expect(surface(nil, placement) == surface(.secondary, placement))
    #expect(surface(nil, placement, solid: true) == surface(.secondary, placement, solid: true))
  }
}

@Test func contentAndPlatformsWithoutGlassKeepTheTokenLook() {
  for variant in ButtonVariant.allCases {
    #expect(surface(variant, .content) == .token)
    #expect(surface(variant, .bar, glass: false) == .token)
    #expect(surface(variant, .floating, glass: false) == .token)
    #expect(surface(variant, .bar, solid: true, glass: false) == .token)
  }
}

@Test func reduceTransparencyOrIncreaseContrastDrawsTheVariantsSolidFill() {
  // FR10: no glass, the variant's token fill, in a bar and floating.
  let roles: [ButtonVariant: ButtonColorRole] = [
    .primary: .accent, .destructive: .error, .secondary: .neutral, .ghost: .surface,
  ]
  for (variant, role) in roles {
    #expect(surface(variant, .bar, solid: true) == .solid(role, inBar: true))
    #expect(surface(variant, .floating, solid: true) == .solid(role, inBar: false))
  }
}

@MainActor
@Test func astryxFloatingOnlyMarksTheContainer() {
  // FR9: the modifier changes no ButtonProps, only the environment.
  var seen: [Bool] = []
  let probe = EnvironmentReader { seen.append($0.astryxFloating) }
  _ = Pixels(probe.frame(width: 4, height: 4))
  _ = Pixels(probe.astryxFloating().frame(width: 4, height: 4))
  #expect(seen.first == false)
  #expect(seen.last == true)

  let button = Astryx.Button(label: "New", variant: .primary) {}
  let floating = Astryx.Button(label: "New", variant: .primary) {}
  _ = floating.astryxFloating()
  #expect(button.props.label == floating.props.label)
  #expect(button.props.variant == floating.props.variant)
}

@MainActor
@Test func aBarButtonDrawsNoFillOrPadding() {
  // FR7, FR11: the bar's glass is the only chrome, and no Astryx padding
  // can cut the label short.
  let barItem = Pixels(barStyled(.secondary, surface: .glass(.barItem)))
  let token = Pixels(barStyled(.secondary, surface: .token))
  let neutral = rgba(Theme.default.light.color.neutral)
  #expect(!close(barItem.at(1, barItem.height / 2), neutral))
  #expect(barItem.at(1, barItem.height / 2)[3] == 0)
  #expect(close(token.at(8, token.height / 2), neutral))
  #expect(barItem.width < token.width)
}

@MainActor
@Test func aSolidFallbackDrawsTheFillWithAnEmphasizedEdge() {
  let tokens = Theme.default.light
  let solid = Pixels(barStyled(.ghost, surface: .solid(.surface, inBar: false)))
  #expect(close(solid.at(0, solid.height / 2), rgba(tokens.color.borderEmphasized)))
  #expect(close(solid.at(8, solid.height / 2), rgba(tokens.color.backgroundSurface)))
}

/// A Button's style drawn alone at a given surface.
@MainActor
private func barStyled(_ variant: ButtonVariant, surface: ButtonSurface) -> some View {
  let astryx = EnvironmentValues().astryx
  return SwiftUI.Button("Share") {}
    .buttonStyle(
      AstryxButtonStyle(
        astryx: astryx, height: astryx.tokens.size.elementMd, fillsWidth: false,
        foreground: astryx.tokens.color.textPrimary,
        background: astryx.tokens.color.neutral, shadow: [], surface: surface
      )
    )
    .fixedSize()
}

/// Reports the environment it is drawn in.
private struct EnvironmentReader: View {
  let read: (EnvironmentValues) -> Void
  @Environment(\.self) private var environment
  var body: some View {
    read(environment)
    return Color.clear
  }
}
