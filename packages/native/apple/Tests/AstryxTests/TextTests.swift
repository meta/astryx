// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

// Swift component API spec, A2 and A3: Text takes core's Text props, and both
// initializers build it from the same TextProps.

@MainActor
@Test func textInitializersBuildTheSameProps() {
  let labeled = Astryx.Text("Total", type: .large, size: .xl, color: .accent, maxLines: 2, hasTabularNumbers: true)
  let fromProps = Astryx.Text(
    TextProps(type: .large, children: "Total", size: .xl, color: .accent, maxLines: 2, hasTabularNumbers: true))
  #expect(labeled.props.children == fromProps.props.children)
  #expect(labeled.props.type == fromProps.props.type)
  #expect(labeled.props.size == fromProps.props.size)
  #expect(labeled.props.color == fromProps.props.color)
  #expect(labeled.props.maxLines == fromProps.props.maxLines)
  #expect(labeled.props.hasTabularNumbers == fromProps.props.hasTabularNumbers)
}

@MainActor
@Test func textColorDefaultsByTypeAsCoreDoes() {
  #expect(Astryx.Text.defaultColor(.supporting) == .secondary)
  #expect(Astryx.Text.defaultColor(.inherit) == .inherit)
  for type in [TextType.body, .large, .label, .code, .display1] {
    #expect(Astryx.Text.defaultColor(type) == .primary)
  }
  let color = Theme.default.light.color
  #expect(color.text(named: "placeholder") == color.textSecondary)
  #expect(color.text(named: "accent") == color.textAccent)
  #expect(color.text(named: "inherit") == nil)
}

@MainActor
@Test func everyTypeReadsItsOwnTokens() {
  let font = Theme.default.light.font
  #expect(font.style(.body) == TypeStyle(font.body, families: font.family.body))
  #expect(font.style(.code)?.families == font.family.code)
  #expect(font.style(.code)?.size == font.code.size)
  #expect(font.style(.display1)?.size == font.display1.size)
  #expect(font.style(.display2)?.families == font.family.heading)
  #expect(font.style(.display3)?.weight == font.display3.weight)
  #expect(font.style(.inherit) == nil)
}

@MainActor
@Test func extraSmallIsSpelledAsCoreSpellsIt() {
  let font = Theme.default.light.font
  #expect(TextSize(rawValue: "xsm") == .xsm)
  #expect(font.size.value(for: .xsm) == font.size.xs)
  #expect(font.size.value(for: .v4xl) == font.size.s4xl)
}

@MainActor
@Test func maxLinesClampsOnlyAPositiveCount() {
  #expect(astryxLineLimit(nil) == nil)
  #expect(astryxLineLimit(0) == nil)
  #expect(astryxLineLimit(2) == 2)
  #expect(astryxLineLimit(2.7) == 2)
  #expect(astryxLineLimit(.infinity) == nil)
  #expect(astryxLineLimit(1e30) == nil)
  #expect(astryxLineLimit(.nan) == nil)
}

@MainActor
@Test func textGrowsAtTheLargestDynamicTypeSize() {
  let large = Pixels(Astryx.Text("Hello").fixedSize())
  let largest = Pixels(Astryx.Text("Hello").fixedSize(), typeSize: .accessibility5)
  #expect(largest.width > large.width * 2)
}

@MainActor
@Test func displayTextIsLargerThanBodyText() {
  let body = Pixels(Astryx.Text("Revenue").fixedSize())
  let display = Pixels(Astryx.Text("Revenue", type: .display1).fixedSize())
  #expect(display.width > body.width * 2)
}

@MainActor
@Test func maxLinesStopsTheTextGrowing() {
  let words = String(repeating: "word ", count: 40)
  let open = Pixels(Astryx.Text(words).frame(width: 120).fixedSize(horizontal: false, vertical: true))
  let clamped = Pixels(Astryx.Text(words, maxLines: 1).frame(width: 120).fixedSize(horizontal: false, vertical: true))
  #expect(clamped.height * 3 < open.height)
}

@MainActor
@Test func aHiddenTextTakesNoSpace() {
  let alone = Pixels(SwiftUI.HStack(spacing: 0) { Rectangle().frame(width: 20, height: 20) }.fixedSize())
  let withHidden = Pixels(
    SwiftUI.HStack(spacing: 0) {
      Rectangle().frame(width: 20, height: 20)
      Astryx.Text("Gone", base: AstryxBaseProps(isHidden: true))
    }.fixedSize())
  #expect(withHidden.width == alone.width)
}

@MainActor
@Test func withoutMaxLinesACallersLineLimitStillApplies() {
  let words = String(repeating: "word ", count: 40)
  let open = Pixels(Astryx.Text(words).frame(width: 120).fixedSize(horizontal: false, vertical: true))
  let callerLimited = Pixels(Astryx.Text(words).lineLimit(1).frame(width: 120).fixedSize(horizontal: false, vertical: true))
  #expect(callerLimited.height * 3 < open.height)
  let heading = Pixels(Astryx.Heading(words, level: .v4).lineLimit(1).frame(width: 120).fixedSize(horizontal: false, vertical: true))
  let openHeading = Pixels(Astryx.Heading(words, level: .v4).frame(width: 120).fixedSize(horizontal: false, vertical: true))
  #expect(heading.height * 3 < openHeading.height)
}
