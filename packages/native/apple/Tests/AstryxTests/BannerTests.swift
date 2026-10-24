// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

@Test func bannerStatusesUseSharedIconNamesAndCoreTokens() {
  let style = AstryxStyle(tokens: Theme.default.light)
  #expect(AstryxBannerStatus.allCases.map(\.iconName) == ["info", "warning", "error", "success"])
  for status in AstryxBannerStatus.allCases {
    #expect(style.icon(status.iconName) != nil)
    #expect(style.tokens.color.value(named: status.groundToken) != nil)
    #expect(style.tokens.color.value(named: status.iconToken) != nil)
  }
}

@Test func aThemeReplacesASharedIcon() {
  let style = AstryxStyle(tokens: Theme.default.light, icons: ["success": "checkmark.seal.fill"])
  #expect(style.icon("success") == "checkmark.seal.fill")
  #expect(style.icon("error") == "exclamationmark.circle.fill")
}

@MainActor
@Test func aBannerPaintsItsStatusGround() {
  var theme = Theme.default
  theme.light.color.successMuted = Color(astryxRGBA: 0xFDE68AFF)
  let banner = AstryxBanner(status: .success, title: "Saved").frame(width: 240)
  let pixels = Pixels(banner, theme: theme)
  #expect(close(pixels.at(pixels.width - 6, pixels.height / 2), rgba("#FDE68AFF")))
}

@MainActor
@Test func aBannerReadsItsTitleThenItsDescription() {
  #expect(AstryxBanner(status: .error, title: "Upload failed").accessibilityText == "Upload failed")
  #expect(
    AstryxBanner(status: .error, title: "Upload failed", description: "Try again.").accessibilityText
      == "Upload failed, Try again."
  )
}

@MainActor
@Test func aBannerGrowsAtTheLargestTextSize() {
  let banner = AstryxBanner(status: .info, title: "Heads up", description: "Details.").frame(width: 320)
  let large = Pixels(banner)
  let largest = Pixels(banner, typeSize: .accessibility5)
  #expect(largest.height > large.height * 2)
}
