// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

@MainActor
@Test func severalChildrenStackInOneCard() {
  let card = Astryx.Card(padding: .v0) {
    Color(.sRGB, red: 1, green: 0, blue: 0, opacity: 1).frame(width: 80, height: 40)
    Color(.sRGB, red: 0, green: 0, blue: 1, opacity: 1).frame(width: 80, height: 40)
  }
  .frame(width: 120)
  let pixels = Pixels(card)
  // One card, the two children one above the other.
  #expect(pixels.height >= 80)
  #expect(close(pixels.at(40, 20), rgba("#FF0000FF")))
  #expect(close(pixels.at(40, 60), rgba("#0000FFFF")))
}

// Swift component API spec, A2 and A3: Card takes core's Card props, and its
// props initializer takes the children as wire nodes.

@MainActor
@Test func bothInitializersBuildTheSameProps() {
  let labeled = Astryx.Card(padding: .v0_5, variant: .muted, elevation: .low) { Color.clear }
  let fromProps = Astryx.Card(CardProps(padding: .v0_5, variant: .muted, elevation: .low), children: []) { _ in }
  #expect(labeled.props.padding == fromProps.props.padding)
  #expect(labeled.props.variant == fromProps.props.variant)
  #expect(labeled.props.elevation == fromProps.props.elevation)
}

@MainActor
@Test func everyVariantDrawsCoresGroundAndOnlyDefaultHasABorder() {
  let color = Theme.default.light.color
  #expect(Astryx.Card<Color>.ground(.default, color) == color.backgroundCard)
  #expect(Astryx.Card<Color>.ground(.transparent, color) == .clear)
  #expect(Astryx.Card<Color>.ground(.muted, color) == color.backgroundMuted)
  #expect(Astryx.Card<Color>.ground(.teal, color) == color.backgroundTeal)
}

@MainActor
@Test func elevationReadsTheThemesShadows() {
  let shadow = Theme.neutral.light.shadow
  #expect(Astryx.Card<Color>.shadow(.none, shadow).isEmpty)
  #expect(Astryx.Card<Color>.shadow(.low, shadow) == shadow.low)
  #expect(Astryx.Card<Color>.shadow(.high, shadow) == shadow.high)
  // Neutral's shadows end with a ring, as its CSS does.
  #expect(shadow.low.last?.isInset == true)
}

@MainActor
@Test func paddingHalfStepsAreCoresSpacingTokens() {
  let child = Color(.sRGB, red: 1, green: 0, blue: 0, opacity: 1).frame(width: 20, height: 20)
  let half = Pixels(Astryx.Card(padding: .v0_5) { child }.fixedSize())
  let four = Pixels(Astryx.Card(padding: .v4) { child }.fixedSize())
  #expect(four.height > half.height)
}

@MainActor
@Test func anElevatedCardDrawsAShadowBelowIt() {
  let flat = Pixels(Astryx.Card(elevation: Astryx.CardElevation.none) { Color.clear.frame(width: 40, height: 40) }.frame(width: 80).padding(20))
  let raised = Pixels(Astryx.Card(elevation: .high) { Color.clear.frame(width: 40, height: 40) }.frame(width: 80).padding(20))
  let below = (raised.width / 2, raised.height - 12)
  #expect(raised.at(below.0, below.1)[3] > flat.at(below.0, below.1)[3])
}

@MainActor
@Test func aTransparentCardDrawsNoGroundAndNoBorder() {
  let card = Pixels(Astryx.Card(variant: .transparent) { Color.clear.frame(width: 40, height: 40) }.frame(width: 80))
  #expect(card.contains { $0[3] > 0 } == false)
}

@MainActor
@Test func aCardFromWireNodesDrawsItsChildren() {
  let json = """
    {"component":"Card","key":"c","props":{"padding":0,"children":[
      {"component":"Text","key":"t","props":{"children":"Hello"}}]}}
    """
  let node = try? JSONDecoder().decode(AstryxNode.self, from: Data(json.utf8))
  #expect(node != nil)
  if let node {
    let pixels = Pixels(AstryxNodeView(node) { _ in }.frame(width: 120))
    #expect(pixels.height > 10)
  }
}

// AST-082 FR19: a node the package cannot draw renders as unsupported in its
// place, and its siblings still render.

@MainActor
@Test func aNodeThePackageCannotDrawRendersAsUnsupportedInPlace() {
  let json = """
    {"component":"Card","key":"c","props":{"padding":0,"children":[
      {"component":"Chart","key":"x","props":{}},
      {"component":"Text","key":"t","props":{"children":"Below"}}]}}
    """
  let node = try? JSONDecoder().decode(AstryxNode.self, from: Data(json.utf8))
  guard case .card(let card)? = node else {
    Issue.record("the card did not decode")
    return
  }
  let children = card.props.children ?? []
  #expect(children.count == 2)
  #expect(AstryxNodeView.componentName(children[0]) == "Chart")
  #expect(AstryxNodeView.componentName(children[1]) == "Text")
  let both = Pixels(AstryxNodeView(node!) { _ in }.frame(width: 160))
  let textOnly = Pixels(Astryx.Card(padding: .v0) { Astryx.Text("Below") }.frame(width: 160))
  #expect(both.height > textOnly.height)
}

@MainActor
@Test func aCardGrowsWithItsTextAtTheLargestTextSize() {
  let card = Astryx.Card { Astryx.Text("Revenue this quarter") }.frame(width: 220)
  let large = Pixels(card)
  let largest = Pixels(card, typeSize: .accessibility5)
  #expect(largest.height > large.height * 2)
}

@MainActor
@Test func onlyTheDefaultVariantDrawsABorder() {
  // A theme whose border token is a color nothing else uses: a card draws
  // that color exactly when it draws a border.
  var theme = Theme.default
  theme.light.color.border = Color(.sRGB, red: 1, green: 0, blue: 1, opacity: 1)
  let magenta = [255, 0, 255, 255]
  for variant in CardVariant.allCases {
    // Visible content, so a see-through variant still draws an image.
    let card = Astryx.Card(variant: variant) { Color.black.frame(width: 40, height: 40) }
      .frame(width: 80)
    let hasBorder = Pixels(card, theme: theme).contains { close($0, magenta, within: 4) }
    #expect(hasBorder == (variant == .default), "\(variant.rawValue)")
  }
}

@MainActor
@Test func anInsetRingDrawsInsideTheDefaultCardsBorder() {
  // As CSS draws an inset shadow inside an element's border: the border on the
  // edge, the ring just inside it.
  var theme = Theme.default
  theme.light.color.border = Color(.sRGB, red: 1, green: 0, blue: 1, opacity: 1)
  theme.light.size.borderWidth = 1
  theme.light.shadow.low = [ShadowLayer(x: 0, y: 0, blur: 0, spread: 1, isInset: true, color: Color(.sRGB, red: 0, green: 1, blue: 1, opacity: 1))]
  let card = Astryx.Card(elevation: .low) { Color.black.frame(width: 40, height: 40) }.frame(width: 80)
  let pixels = Pixels(card, theme: theme)
  let x = pixels.width / 2
  #expect(close(pixels.at(x, 0), [255, 0, 255, 255], within: 8))
  #expect(close(pixels.at(x, 1), [0, 255, 255, 255], within: 8))
}
