// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI
import Testing
@testable import Astryx

// Core's Button keeps a loading button undimmed and focusable, announces
// Loading, and ignores presses until it finishes.

@MainActor
@Test func aLoadingButtonIgnoresPressesAndSaysLoading() {
  var presses = 0
  let loading = Astryx.Button(label: "Save", isLoading: true) { presses += 1 }
  loading.activate()
  #expect(presses == 0)
  #expect(loading.loadingValue == "Loading")

  let ready = Astryx.Button(label: "Save") { presses += 1 }
  ready.activate()
  #expect(presses == 1)
  #expect(ready.loadingValue == nil)
}

@MainActor
@Test func aLoadingButtonIsNotDimmedAndKeepsItsWidth() {
  let accent = rgba(Theme.default.light.color.accent)
  let loading = Pixels(Astryx.Button(label: "Continue", variant: .primary, isLoading: true) {}.fixedSize())
  let ready = Pixels(Astryx.Button(label: "Continue", variant: .primary) {}.fixedSize())
  #expect(close(loading.at(8, loading.height / 2), accent))
  #expect(loading.width == ready.width)
}

@MainActor
@Test func aDisabledButtonIsDimmed() {
  let accent = rgba(Theme.default.light.color.accent)
  let disabled = Pixels(Astryx.Button(label: "Continue", variant: .primary, isDisabled: true) {}.fixedSize())
  #expect(!close(disabled.at(8, disabled.height / 2), accent))
}

@MainActor
@Test func theTapAreaIsAtLeast44PointsEvenForSmallButtons() {
  let small = Pixels(Astryx.Button(label: "OK", size: .sm) {}.fixedSize())
  #expect(small.width >= 44)
  #expect(small.height >= 44)
}

@MainActor
@Test func buttonLabelsGrowAtTheLargestTextSizeWithoutClipping() {
  let large = Pixels(Astryx.Button(label: "Continue") {}.fixedSize())
  let largest = Pixels(Astryx.Button(label: "Continue") {}.fixedSize(), typeSize: .accessibility5)
  #expect(largest.width > large.width)
  #expect(largest.height > large.height)
}

@MainActor
@Test func aButtonIsNamedByItsLabelAndIsAButton() {
  #expect(Astryx.Button(label: "Save") {}.accessibilityText == "Save")
  #expect(Astryx.Button(label: "Save", isLoading: true) {}.accessibilityText == "Save")
  #expect(Astryx.Button.accessibilityTraits.contains(.isButton))
}

@MainActor
@Test func buttonIconsUseSharedNamesAndTheTheme() {
  #expect(AstryxStyle(tokens: Theme.default.light).icon("search") == "magnifyingglass")
  #expect(AstryxStyle(tokens: Theme.default.light, icons: ["search": "sparkle.magnifyingglass"]).icon("search") == "sparkle.magnifyingglass")
}

// Swift component API spec, A2, A3, A4: Button takes core's Button props.

@MainActor
@Test func buttonInitializersBuildTheSameProps() {
  let labeled = Astryx.Button(label: "Save", variant: .primary, size: .lg, elevation: .low, width: .fill, tooltip: "Saves", href: "https://example.com")
  let fromProps = Astryx.Button(
    ButtonProps(label: "Save", variant: .primary, size: .lg, elevation: .low, width: .fill, tooltip: "Saves", href: "https://example.com"))
  #expect(labeled.props.label == fromProps.props.label)
  #expect(labeled.props.variant == fromProps.props.variant)
  #expect(labeled.props.size == fromProps.props.size)
  #expect(labeled.props.elevation == fromProps.props.elevation)
  #expect(labeled.props.width == fromProps.props.width)
  #expect(labeled.props.tooltip == fromProps.props.tooltip)
  #expect(labeled.props.href == fromProps.props.href)
}

@MainActor
@Test func anInterruptibleLoadingButtonStillTakesPresses() {
  var presses = 0
  Astryx.Button(label: "Stop", isLoading: true, isInterruptible: true) { presses += 1 }.activate()
  #expect(presses == 1)
}

@MainActor
@Test func hrefMakesAnEnabledButtonALinkAndADisabledOneAButton() {
  #expect(Astryx.Button(label: "Docs", href: "https://example.com").link == URL(string: "https://example.com"))
  #expect(Astryx.Button(label: "Docs", isDisabled: true, href: "https://example.com").link == nil)
  #expect(Astryx.Button(label: "Docs").link == nil)
  // A loading link stays a link; it opens nothing until loading ends.
  let loading = Astryx.Button(label: "Docs", isLoading: true, href: "https://example.com")
  #expect(loading.link != nil)
  #expect(loading.acceptsPress == false)
  // An interruptible loading link opens on each activation.
  let interruptible = Astryx.Button(label: "Docs", isLoading: true, isInterruptible: true, href: "https://example.com")
  #expect(interruptible.link != nil)
  #expect(interruptible.acceptsPress)
}

@MainActor
@Test func aFillWidthButtonTakesTheWholeWidth() {
  let content = Pixels(Astryx.Button(label: "OK", variant: .primary).frame(width: 240))
  let fill = Pixels(Astryx.Button(label: "OK", variant: .primary, width: .fill).frame(width: 240))
  let accent = rgba(Theme.default.light.color.accent)
  #expect(close(fill.at(4, fill.height / 2), accent))
  #expect(!close(content.at(4, content.height / 2), accent))
}

@MainActor
@Test func buttonElevationReadsTheThemesShadows() {
  #expect(Astryx.Button(label: "OK").shadow.isEmpty)
  #expect(Astryx.Button(label: "OK", elevation: .med).shadow == Theme.default.light.shadow.med)
}

@MainActor
@Test func aButtonNeverOpensAScriptOrHTMLDocumentDestination() {
  for href in [
    "javascript:alert(1)", "JavaScript:void(0)", "vbscript:msgbox", "data:text/html,<p>hi</p>",
    "  javascript:alert(1)", "java\u{09}script:alert(1)", "\u{01}javascript:alert(1)",
    "data: text/html,<p>hi</p>", "DATA:  TEXT/HTML,<p>hi</p>", "javascript:\n alert(1)",
  ] {
    let button = Astryx.Button(label: "Go", href: href)
    #expect(button.link == nil, "\(href)")
    // It stays an enabled button, not a disabled one.
    #expect(button.acceptsPress)
    #expect(!button.isDisabled)
  }
  #expect(Astryx.Button(label: "Go", href: "data:image/png;base64,AAAA").link != nil)
  #expect(Astryx.Button(label: "Go", href: "mailto:a@b.co").link != nil)
}

@MainActor
@Test func aDisabledButtonKeepsItsFocusStopAndTakesNoPress() {
  var presses = 0
  let withTip = Astryx.Button(label: "Save", isDisabled: true, tooltip: "Fill in a name first") { presses += 1 }
  #expect(withTip.keepsFocusWhileDisabled)
  withTip.activate()
  #expect(presses == 0)
  #expect(Astryx.Button(label: "Save", isDisabled: true) {}.keepsFocusWhileDisabled)
  #expect(!Astryx.Button(label: "Save") {}.keepsFocusWhileDisabled)
}

@Test func aSafeDestinationIsNormalizedAsCoresRule() {
  // Accepted destinations come back trimmed and without control characters.
  #expect(Astryx.Button.safeDestination("  https://example.com/a \n") == "https://example.com/a")
  #expect(Astryx.Button.safeDestination("https://exa\u{0}mple.com") == "https://example.com")
  #expect(Astryx.Button.safeDestination("/settings") == "/settings")
  #expect(Astryx.Button.safeDestination("data:image/png;base64,AAAA") != nil)
  #expect(Astryx.Button.safeDestination(" data: text/html,x") == nil)
}

@MainActor
@Test func aDisabledButtonWithHrefKeepsItsDestinationForOneStructure() {
  // The link and the disabled button stay in one structure, so the
  // destination is known while disabled even though nothing opens.
  let disabled = Astryx.Button(label: "Docs", isDisabled: true, href: "https://example.com")
  #expect(disabled.destination == URL(string: "https://example.com"))
  #expect(disabled.link == nil)
  #expect(!disabled.acceptsPress)
  let enabled = Astryx.Button(label: "Docs", href: "https://example.com")
  #expect(enabled.link == enabled.destination)
}
