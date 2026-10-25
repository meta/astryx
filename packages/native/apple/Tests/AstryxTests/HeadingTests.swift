// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

@MainActor
@Test func headingLevelsAreExposedToVoiceOver() {
  #expect(Astryx.Heading("Title", level: .v1).headingLevel == .h1)
  #expect(Astryx.Heading("Title", level: .v3).headingLevel == .h3)
  #expect(Astryx.Heading("Title", level: .v6).headingLevel == .h6)
  #expect(Astryx.Heading("Sidebar", level: .v2, accessibilityLevel: .v3).headingLevel == .h3)
}

@MainActor
@Test func headingInitializersBuildTheSameProps() {
  let labeled = Astryx.Heading("Revenue", level: .v2, type: .display2, color: .secondary)
  let fromProps = Astryx.Heading(HeadingProps(level: .v2, type: .display2, children: "Revenue", color: .secondary))
  #expect(labeled.props.level == fromProps.props.level)
  #expect(labeled.props.type == fromProps.props.type)
  #expect(labeled.props.children == fromProps.props.children)
  #expect(labeled.props.color == fromProps.props.color)
}

@MainActor
@Test func headingsShrinkByLevel() {
  let h1 = Pixels(Astryx.Heading("Settings", level: .v1).fixedSize())
  let h4 = Pixels(Astryx.Heading("Settings", level: .v4).fixedSize())
  #expect(h1.width > h4.width)
}

@MainActor
@Test func aDisplayTypeReplacesTheLevelsLook() {
  let h2 = Pixels(Astryx.Heading("Settings", level: .v2).fixedSize())
  let display = Pixels(Astryx.Heading("Settings", level: .v2, type: .display1).fixedSize())
  #expect(display.width > h2.width)
}

@MainActor
@Test func headingsGrowAtTheLargestTextSizeAndFollowASecondTheme() {
  let large = Pixels(Astryx.Heading("Settings", level: .v2).fixedSize())
  let largest = Pixels(Astryx.Heading("Settings", level: .v2).fixedSize(), typeSize: .accessibility5)
  #expect(largest.width > large.width * 2)

  var theme = Theme.default
  theme.light.font.heading2.size = 48
  theme.light.color.textPrimary = Color(astryxRGBA: 0xFF0000FF)
  let themed = Pixels(Astryx.Heading("Settings", level: .v2).fixedSize(), theme: theme)
  #expect(themed.width > large.width)
  #expect(themed.contains { $0[0] > 200 && $0[1] < 60 && $0[2] < 60 && $0[3] > 200 })
}

@MainActor
@Test func aHeadingIsAHeader() {
  #expect(Astryx.Heading.accessibilityTraits.contains(.isHeader))
}

@MainActor
@Test func justifyAlignsAOneLineHeadingAcrossItsContainer() {
  // A fixed frame centers whatever it holds, so start and end are measured
  // against each other, both justified.
  let start = Pixels(Astryx.Heading("Hi", level: .v4, justify: .start).frame(width: 300))
  let end = Pixels(Astryx.Heading("Hi", level: .v4, justify: .end).frame(width: 300))
  let firstInk = { (p: Pixels) in (0..<p.width).first { x in (0..<p.height).contains { y in p.at(x, y)[3] > 0 } } ?? 0 }
  #expect(firstInk(start) < end.width / 4)
  #expect(firstInk(end) > end.width * 3 / 4)
  #expect(HeadingJustify.end.frameAlignment == .trailing)
}
