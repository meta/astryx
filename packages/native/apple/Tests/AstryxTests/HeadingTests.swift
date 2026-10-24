// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

@MainActor
@Test func headingLevelsAreClampedAndExposedToVoiceOver() {
  #expect(AstryxHeading("Title", level: 0).level == 1)
  #expect(AstryxHeading("Title", level: 9).level == 6)
  #expect(AstryxHeading("Title", level: 1).headingLevel == .h1)
  #expect(AstryxHeading("Title", level: 3).headingLevel == .h3)
  #expect(AstryxHeading("Title", level: 6).headingLevel == .h6)
}

@MainActor
@Test func headingsShrinkByLevel() {
  let h1 = Pixels(AstryxHeading("Settings", level: 1).fixedSize())
  let h4 = Pixels(AstryxHeading("Settings", level: 4).fixedSize())
  #expect(h1.width > h4.width)
}

@MainActor
@Test func headingsGrowAtTheLargestTextSizeAndFollowASecondTheme() {
  let large = Pixels(AstryxHeading("Settings").fixedSize())
  let largest = Pixels(AstryxHeading("Settings").fixedSize(), typeSize: .accessibility5)
  #expect(largest.width > large.width * 2)

  var theme = Theme.default
  theme.light.font.heading2Size = 48
  theme.light.color.textPrimary = Color(astryxRGBA: 0xFF0000FF)
  let themed = Pixels(AstryxHeading("Settings").fixedSize(), theme: theme)
  #expect(themed.width > large.width)
  #expect(themed.contains { $0[0] > 200 && $0[1] < 60 && $0[2] < 60 && $0[3] > 200 })
}

@MainActor
@Test func aHeadingIsAHeader() {
  #expect(AstryxHeading.accessibilityTraits.contains(.isHeader))
}
