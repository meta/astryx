// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
import SwiftUI
import Testing
@testable import Astryx

// Swift Thumbnail spec (component:swift/Thumbnail): core's 64-point preview,
// its placeholder, loading, remove, and open states, and its names.

@MainActor
@Test func thumbnailInitializersBuildTheSameProps() {
  let labeled = Thumbnail(src: "a", alt: "Beach", label: "beach.jpg", isLoading: true, isDisabled: true, showRemoveOn: .always).props
  let fromProps = Thumbnail(ThumbnailProps(src: "a", alt: "Beach", label: "beach.jpg", isLoading: true, isDisabled: true, showRemoveOn: .always)).props
  #expect(labeled.src == fromProps.src)
  #expect(labeled.alt == fromProps.alt)
  #expect(labeled.label == fromProps.label)
  #expect(labeled.isLoading == fromProps.isLoading)
  #expect(labeled.isDisabled == fromProps.isDisabled)
  #expect(labeled.showRemoveOn == fromProps.showRemoveOn)
  #expect(labeled.base == fromProps.base)
}

@MainActor
@Test func aTrailingClosureOpensTheThumbnail() {
  let thumbnail = Thumbnail(src: "a", label: "beach.jpg") {}
  #expect(thumbnail.props.onClick != nil)
  #expect(thumbnail.props.onRemove == nil)
}

@MainActor
@Test func theNameJoinsLabelAndAltElseFallsBack() {
  #expect(Thumbnail(alt: "Beach at sunset", label: "beach.jpg").accessibleName == "beach.jpg — Beach at sunset")
  #expect(Thumbnail(label: "beach.jpg").accessibleName == "beach.jpg")
  #expect(Thumbnail(alt: "Beach at sunset").accessibleName == "Beach at sunset")
  #expect(Thumbnail().accessibleName == "Thumbnail")
  #expect(Thumbnail(label: "beach.jpg").openLabel == "Open beach.jpg")
  #expect(Thumbnail(label: "beach.jpg").removeLabel == "Remove beach.jpg")
}

@MainActor
@Test func loadingShowsASkeletonWithoutAnImageAndTheUploadLookOverOne() {
  #expect(Thumbnail(isLoading: true).showSkeleton)
  #expect(!Thumbnail(isLoading: true).showUploadOverlay)
  #expect(Thumbnail(src: "https://example.com/a.png", isLoading: true).showUploadOverlay)
  #expect(!Thumbnail(src: "https://example.com/a.png", isLoading: true).showSkeleton)
  #expect(!Thumbnail(src: "https://example.com/a.png").showUploadOverlay)
}

@MainActor
@Test func disabledOrLoadingTurnsOffTheTapAndDisabledTurnsOffRemove() {
  #expect(Thumbnail {}.isInteractive)
  #expect(!Thumbnail(isDisabled: true) {}.isInteractive)
  #expect(!Thumbnail(src: "a", isLoading: true) {}.isInteractive)
  #expect(Thumbnail(onRemove: {}).hasRemove)
  #expect(Thumbnail(onRemove: {}).removes)
  // AST-085: while disabled or loading the buttons stay mounted, inert, so
  // focus on them stays put.
  #expect(Thumbnail(isDisabled: true, onRemove: {}).hasRemove)
  #expect(!Thumbnail(isDisabled: true, onRemove: {}).removes)
  #expect(Thumbnail(isDisabled: true) {}.hasOpenButton)
  #expect(Thumbnail(src: "a", isLoading: true) {}.hasOpenButton)
  #expect(!Thumbnail(src: "a").hasOpenButton)
}

@Test func hoverRevealsRemoveUnderAPointerOrKeyboardFocusAndAlwaysOnTouch() {
  typealias T = Thumbnail
  #expect(!T.isRemoveVisible(showRemoveOn: .hover, isTouch: false, isHovering: false, isFocused: false))
  #expect(T.isRemoveVisible(showRemoveOn: .hover, isTouch: false, isHovering: true, isFocused: false))
  #expect(T.isRemoveVisible(showRemoveOn: .hover, isTouch: false, isHovering: false, isFocused: true))
  #expect(T.isRemoveVisible(showRemoveOn: .hover, isTouch: true, isHovering: false, isFocused: false))
  #expect(T.isRemoveVisible(showRemoveOn: .always, isTouch: false, isHovering: false, isFocused: false))
  // Core FR6: a pointer reveals nothing on a disabled thumbnail.
  #expect(!T.isRemoveVisible(showRemoveOn: .hover, isTouch: false, isHovering: true, isFocused: false, isDisabled: true))
}

// Core FR3: keyboard focus on the open or remove button shows the label, as
// focus within core's tooltip wrapper does.
@Test func focusOnAThumbnailButtonShowsItsLabel() {
  typealias P = TooltipPresenter
  #expect(TooltipFocus.inside(true).isInsideFocused)
  #expect(!TooltipFocus.inside(false).isInsideFocused)
  #expect(P.showsBubble(
    hasText: true, isHovering: false, isHoveringBubble: false, isFocused: true, focusIsKeyboard: true,
    focus: .inside(true)))
  // `auto` touch still opens on a tap: the wrapper is not a control.
  #expect(P.resolvedTouch(.auto, focus: .inside(false)) == .tap)
}

@MainActor
@Test func theRemoveButtonShowsAtRestWithAlwaysAndOnTouchDevices() {
  #expect(Thumbnail(showRemoveOn: .always, onRemove: {}).isRemoveVisible)
  #expect(Thumbnail(onRemove: {}).isRemoveVisible == Thumbnail.isTouchDevice)
}

@MainActor
@Test func aThumbnailIs64PointsOnTheNeutralPlate() {
  let drawn = Pixels(Thumbnail().background(Color.white))
  #expect(drawn.width == 64 && drawn.height == 64)
  #expect(close(drawn.at(8, 32), onWhite(rgba(Theme.default.light.color.neutral)), within: 3))
  // The placeholder silhouette sits in the middle in the secondary icon color.
  let icon = onWhite(rgba(Theme.default.light.color.neutral))
  #expect(drawn.contains { !close($0, icon, within: 12) })
}

@MainActor
@Test func aThumbnailRendersFromTwoThemesWithNoColorOfItsOwn() {
  let view = Thumbnail().background(Color.white)
  #expect(close(Pixels(view, theme: .neutral).at(8, 32), onWhite(rgba(Theme.neutral.light.color.neutral)), within: 3))
  #expect(close(Pixels(view, theme: .butter).at(8, 32), onWhite(rgba(Theme.butter.light.color.neutral)), within: 3))
}

@MainActor
@Test func aThumbnailKeepsItsSizeAtTheLargestTextSize() {
  let large = Pixels(Thumbnail(src: "https://example.com/a.png", isLoading: true, onRemove: {}))
  let largest = Pixels(Thumbnail(src: "https://example.com/a.png", isLoading: true, onRemove: {}), typeSize: .accessibility5)
  #expect(largest.width == 64 && largest.height == 64)
  #expect(large.width == largest.width && large.height == largest.height)
}

@MainActor
@Test func theSkeletonUsesCoresSkeletonColor() {
  let tokens = Theme.default.light
  #expect(Thumbnail.skeletonColor(tokens, increasedContrast: false) == tokens.color.skeleton)
  #expect(Thumbnail.skeletonColor(tokens, increasedContrast: true) != tokens.color.skeleton)
  // At rest, under Reduce Motion: core's 25% opacity.
  let still = Pixels(ThumbnailSkeleton(color: Color(red: 1, green: 0, blue: 0), isStill: true).frame(width: 8, height: 8))
  #expect(abs(still.at(4, 4)[3] - 64) <= 2)
  #expect(ThumbnailSkeleton.restingOpacity == 0.25)
  #expect(ThumbnailSkeleton.brightestOpacity == 0.925)
}

@Test func theSkeletonWaitsASecondThenStepsUpAndBackAsCoresDoes() {
  let opacity = ThumbnailSkeleton.opacity(elapsed:)
  let d = ThumbnailSkeleton.pulseDuration
  #expect(opacity(0) == 0.25)
  #expect(opacity(0.99) == 0.25)
  // Ten held steps of 0.075 on the way up…
  #expect(abs(opacity(1 + d * 0.05) - 0.25) < 1e-9)
  #expect(abs(opacity(1 + d * 0.15) - 0.325) < 1e-9)
  #expect(abs(opacity(1 + d * 0.55) - 0.625) < 1e-9)
  #expect(abs(opacity(1 + d * 0.95) - 0.925) < 1e-9)
  // …and back down.
  #expect(abs(opacity(1 + d * 1.05) - 0.925) < 1e-9)
  #expect(abs(opacity(1 + d * 1.95) - 0.25) < 1e-9)
}

@MainActor
@Test func theRemoveButtonDrawsTheSharedCloseIconTheThemeMaps() {
  // `always` shows the button on every platform. A theme that maps `close`
  // to a filled circle fills far more of the button than the default glyph.
  func onDarkPixels(_ theme: Theme) -> Int {
    let drawn = Pixels(Thumbnail(showRemoveOn: .always, onRemove: {}), theme: theme)
    let onDark = rgba(theme.light.color.onDark)
    var count = 0
    for y in 4..<24 { for x in 40..<60 where close(drawn.at(x, y), onDark, within: 40) { count += 1 } }
    return count
  }
  var filled = Theme.default
  filled.icons["close"] = "circle.fill"
  #expect(onDarkPixels(filled) > onDarkPixels(.default) * 2)
}

@Test func increaseContrastMovesTheSkeletonTowardText() {
  let black = Color(red: 0, green: 0, blue: 0), white = Color(red: 1, green: 1, blue: 1)
  #expect(close(rgba(Thumbnail.mix(white, black, by: 0.3)), [179, 179, 179, 255], within: 1))
}

@MainActor
@Test func aDisabledThumbnailIsDimmed() {
  let plain = Pixels(Thumbnail()).at(8, 32)
  let dimmed = Pixels(Thumbnail(isDisabled: true)).at(8, 32)
  #expect(dimmed[3] < plain[3])
}

@MainActor
@Test func aHiddenThumbnailDrawsNothing() {
  let hidden = Pixels(
    HStack(spacing: 0) {
      Color.clear.frame(width: 1, height: 1)
      Thumbnail(ThumbnailProps(base: AstryxBaseProps(isHidden: true)))
    }.fixedSize()
  )
  #expect(hidden.width == 1)
}

/// A theme color drawn over white.
private func onWhite(_ c: [Int]) -> [Int] {
  (0..<3).map { (c[$0] * c[3] + 255 * (255 - c[3])) / 255 } + [255]
}

// AST-082 FR19: a Thumbnail node from a logic core draws as Thumbnail.
@MainActor
@Test func aThumbnailNodeDrawsAsAThumbnail() {
  let json = #"{"component":"Thumbnail","key":"t","props":{"label":"beach.jpg"}}"#
  guard let node = try? JSONDecoder().decode(AstryxNode.self, from: Data(json.utf8)) else {
    Issue.record("the thumbnail did not decode")
    return
  }
  #expect(AstryxNodeView.componentName(node) == "Thumbnail")
  let wired = Pixels(AstryxNodeView(node) { _ in })
  #expect(wired.width == 64 && wired.height == 64)
}

