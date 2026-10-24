// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

// Core's Button keeps a loading button undimmed and focusable, announces
// Loading, and ignores presses until it finishes.

@MainActor
@Test func aLoadingButtonIgnoresPressesAndSaysLoading() {
  var presses = 0
  let loading = AstryxButton(label: "Save", isLoading: true) { presses += 1 }
  loading.activate()
  #expect(presses == 0)
  #expect(loading.loadingValue == "Loading")

  let ready = AstryxButton(label: "Save") { presses += 1 }
  ready.activate()
  #expect(presses == 1)
  #expect(ready.loadingValue == nil)
}

@MainActor
@Test func aLoadingButtonIsNotDimmedAndKeepsItsWidth() {
  let accent = rgba(Theme.default.light.color.accent)
  let loading = Pixels(AstryxButton(label: "Continue", variant: .primary, isLoading: true) {}.fixedSize())
  let ready = Pixels(AstryxButton(label: "Continue", variant: .primary) {}.fixedSize())
  #expect(close(loading.at(8, loading.height / 2), accent))
  #expect(loading.width == ready.width)
}

@MainActor
@Test func aDisabledButtonIsDimmed() {
  let accent = rgba(Theme.default.light.color.accent)
  let disabled = Pixels(AstryxButton(label: "Continue", variant: .primary, isDisabled: true) {}.fixedSize())
  #expect(!close(disabled.at(8, disabled.height / 2), accent))
}

@MainActor
@Test func theTapAreaIsAtLeast44PointsEvenForSmallButtons() {
  let small = Pixels(AstryxButton(label: "OK", size: .sm) {}.fixedSize())
  #expect(small.width >= 44)
  #expect(small.height >= 44)
}

@MainActor
@Test func buttonLabelsGrowAtTheLargestTextSizeWithoutClipping() {
  let large = Pixels(AstryxButton(label: "Continue") {}.fixedSize())
  let largest = Pixels(AstryxButton(label: "Continue") {}.fixedSize(), typeSize: .accessibility5)
  #expect(largest.width > large.width)
  #expect(largest.height > large.height)
}

@MainActor
@Test func aButtonIsNamedByItsLabelAndIsAButton() {
  #expect(AstryxButton(label: "Save") {}.accessibilityText == "Save")
  #expect(AstryxButton(label: "Save", isLoading: true) {}.accessibilityText == "Save")
  #expect(AstryxButton.accessibilityTraits.contains(.isButton))
}

@Test func buttonIconsUseSharedNamesAndTheTheme() {
  #expect(AstryxStyle(tokens: Theme.default.light).icon("search") == "magnifyingglass")
  #expect(AstryxStyle(tokens: Theme.default.light, icons: ["search": "sparkle.magnifyingglass"]).icon("search") == "sparkle.magnifyingglass")
}

@MainActor
@Test func aButtonDrawsItsSharedIcon() {
  let plain = Pixels(AstryxButton(label: "Find") {}.fixedSize())
  let withIcon = Pixels(AstryxButton(label: "Find", icon: "search") {}.fixedSize())
  #expect(withIcon.width > plain.width)
}
