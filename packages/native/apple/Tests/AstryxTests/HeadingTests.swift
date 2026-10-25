// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

@MainActor
@Test func headingLevelsAreClampedAndExposedToVoiceOver() {
  #expect(Astryx.Heading("Title", level: 0).level == 1)
  #expect(Astryx.Heading("Title", level: 9).level == 6)
  #expect(Astryx.Heading("Title", level: 1).headingLevel == .h1)
  #expect(Astryx.Heading("Title", level: 3).headingLevel == .h3)
  #expect(Astryx.Heading("Title", level: 6).headingLevel == .h6)
}

@MainActor
@Test func headingsShrinkByLevel() {
  let h1 = Pixels(Astryx.Heading("Settings", level: 1).fixedSize())
  let h4 = Pixels(Astryx.Heading("Settings", level: 4).fixedSize())
  #expect(h1.width > h4.width)
}

@MainActor
@Test func headingsGrowAtTheLargestTextSizeAndFollowASecondTheme() {
  let large = Pixels(Astryx.Heading("Settings").fixedSize())
  let largest = Pixels(Astryx.Heading("Settings").fixedSize(), typeSize: .accessibility5)
  #expect(largest.width > large.width * 2)

  var theme = Theme.default
  theme.light.font.heading2Size = 48
  theme.light.color.textPrimary = Color(astryxRGBA: 0xFF0000FF)
  let themed = Pixels(Astryx.Heading("Settings").fixedSize(), theme: theme)
  #expect(themed.width > large.width)
  #expect(themed.contains { $0[0] > 200 && $0[1] < 60 && $0[2] < 60 && $0[3] > 200 })
}

@MainActor
@Test func aHeadingIsAHeader() {
  #expect(Astryx.Heading.accessibilityTraits.contains(.isHeader))
}
