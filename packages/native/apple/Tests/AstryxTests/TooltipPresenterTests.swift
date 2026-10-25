// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
import SwiftUI
import Testing
@testable import Astryx

// The Astryx tooltip (library/tooltip.spec.md), one cell at a time.

@Test func tooltipsWaitCoresDelayAndBridge() {
  #expect(TooltipPresenter.delay == .milliseconds(200))
  #expect(TooltipPresenter.bridge == .milliseconds(100))
}

@Test func blankWordsAndADisabledViewShowNothing() {
  #expect(TooltipPresenter.shownText("Ada", isDisabled: false) == "Ada")
  #expect(TooltipPresenter.shownText("Ada", isDisabled: true) == nil)
  #expect(TooltipPresenter.shownText(" \n", isDisabled: false) == nil)
  #expect(TooltipPresenter.shownText(nil, isDisabled: false) == nil)
}

@Test func aPointerOnTheViewOrTheBubbleKeepsItUp() {
  typealias P = TooltipPresenter
  #expect(P.wantsBubble(hasText: true, isHovering: true, isHoveringBubble: false, isFocused: false, focus: .none))
  #expect(P.wantsBubble(hasText: true, isHovering: false, isHoveringBubble: true, isFocused: false, focus: .none))
  #expect(!P.wantsBubble(hasText: true, isHovering: false, isHoveringBubble: false, isFocused: false, focus: .none))
  #expect(!P.wantsBubble(hasText: false, isHovering: true, isHoveringBubble: false, isFocused: false, focus: .none))
}

@Test func focusShowsItOnlyWhereFocusReachesTheTooltip() {
  typealias P = TooltipPresenter
  #expect(P.wantsBubble(hasText: true, isHovering: false, isHoveringBubble: false, isFocused: true, focus: .control))
  #expect(P.wantsBubble(hasText: true, isHovering: false, isHoveringBubble: false, isFocused: true, focus: .tabStop))
  #expect(!P.wantsBubble(hasText: true, isHovering: false, isHoveringBubble: false, isFocused: true, focus: .none))
}

@Test func onlyADirectTouchOnATapTriggerOpensTheBubble() {
  typealias P = TooltipPresenter
  #expect(P.tapOpens(touch: .tap, hasText: true, isHovering: false, voiceOver: false))
  // A trackpad or mouse hovers before it clicks.
  #expect(!P.tapOpens(touch: .tap, hasText: true, isHovering: true, voiceOver: false))
  #expect(!P.tapOpens(touch: .tap, hasText: true, isHovering: false, voiceOver: true))
  #expect(!P.tapOpens(touch: .none, hasText: true, isHovering: false, voiceOver: false))
  #expect(!P.tapOpens(touch: .tap, hasText: false, isHovering: false, voiceOver: false))
}

@MainActor
@Test func theBubbleDrawsInCoresTooltipColorsAndPadding() {
  for theme in [Theme.default, Theme.butter] {
    let bubble = Pixels(TooltipBubble(text: "Ada Lovelace"), theme: theme)
    #expect(close(bubble.at(bubble.width / 2, 2), rgba(theme.light.color.textPrimary), within: 6))
    // Padded on every side: the corners of the padding hold no ink.
    let space = theme.light.space
    #expect(bubble.height > Int(2 * space.s1) + 10)
    #expect(bubble.width > Int(2 * space.s2) + 40)
  }
}

@MainActor
@Test func aViewWithATooltipDrawsAsItDidWithout() {
  // The tooltip adds nothing to the view's own drawing until it shows.
  let plain = Pixels(Color.red.frame(width: 20, height: 20))
  let decorated = Pixels(Color.red.frame(width: 20, height: 20).astryxTooltip("Ada", touch: .tap))
  #expect(plain.width == decorated.width && plain.height == decorated.height)
  #expect(plain.at(10, 10) == decorated.at(10, 10))
}

@Test func theBubbleSitsAboveUnlessThereIsNoRoom() {
  typealias P = TooltipPresenter
  #expect(P.placesAbove(viewTop: 200, bubbleHeight: 25, gap: 4))
  #expect(P.placesAbove(viewTop: 29, bubbleHeight: 25, gap: 4))
  #expect(!P.placesAbove(viewTop: 20, bubbleHeight: 25, gap: 4))
}

@Test func aPointerWaitsFocusShowsAtOnceAndHidingWaitsTheBridge() {
  typealias P = TooltipPresenter
  #expect(P.wait(showing: true, byFocus: false) == .milliseconds(200))
  #expect(P.wait(showing: true, byFocus: true) == .zero)
  #expect(P.wait(showing: false, byFocus: false) == .milliseconds(100))
  #expect(P.wait(showing: false, byFocus: true) == .milliseconds(100))
}

@MainActor
@Test func longWordsWrapAtCoresWidth() {
  #expect(TooltipPresenter.maximumWidth == 300)
  let short = Pixels(TooltipBubble(text: "beach.jpg"))
  let long = Pixels(TooltipBubble(text: String(repeating: "a-very-long-file-name ", count: 8)))
  #expect(short.width < 300)
  #expect(long.width <= 300)
  #expect(long.height > short.height * 2)
}

@Test func theBubbleSlidesToStayInsideTheWindow() {
  typealias P = TooltipPresenter
  // Centered on a view in the middle: no slide.
  #expect(P.slide(viewMinX: 180, viewWidth: 40, bubbleWidth: 100, windowWidth: 400, margin: 4) == 0)
  // Near the left edge: slides right to the margin.
  #expect(P.slide(viewMinX: 0, viewWidth: 40, bubbleWidth: 100, windowWidth: 400, margin: 4) == 34)
  // Near the right edge: slides left.
  #expect(P.slide(viewMinX: 360, viewWidth: 40, bubbleWidth: 100, windowWidth: 400, margin: 4) == -34)
  // An unknown window: no slide.
  #expect(P.slide(viewMinX: 0, viewWidth: 40, bubbleWidth: 100, windowWidth: nil, margin: 4) == 0)
}

@Test func aGestureElsewhereClosesATapOpenedBubbleButNotOnTheBubble() {
  let view = CGRect(x: 100, y: 100, width: 40, height: 40)
  let bubble = CGRect(x: 80, y: 60, width: 80, height: 30)
  typealias P = TooltipPresenter
  #expect(P.closesTapBubble(point: CGPoint(x: 10, y: 10), isTap: true, viewFrame: view, bubbleFrame: bubble))
  // A tap on the view toggles it instead; a scroll or pinch on the view closes it.
  #expect(!P.closesTapBubble(point: CGPoint(x: 120, y: 120), isTap: true, viewFrame: view, bubbleFrame: bubble))
  #expect(P.closesTapBubble(point: CGPoint(x: 120, y: 120), isTap: false, viewFrame: view, bubbleFrame: bubble))
  // A gesture on the bubble is left alone.
  #expect(!P.closesTapBubble(point: CGPoint(x: 90, y: 70), isTap: true, viewFrame: view, bubbleFrame: bubble))
  #expect(!P.closesTapBubble(point: CGPoint(x: 90, y: 70), isTap: false, viewFrame: view, bubbleFrame: bubble))
}

@Test func onlyKeyboardFocusShowsTheBubble() {
  #expect(TooltipPresenter.isKeyboardFocus(isHovering: false, sincePress: 10))
  // Focus a pointer brings: while it rests on the view, or right after a press.
  #expect(!TooltipPresenter.isKeyboardFocus(isHovering: true, sincePress: 10))
  #expect(!TooltipPresenter.isKeyboardFocus(isHovering: false, sincePress: 0.1))
}

@Test func autoTouchOpensUnlessTheViewIsAControl() {
  typealias P = TooltipPresenter
  #expect(P.resolvedTouch(.auto, focus: .none) == .tap)
  #expect(P.resolvedTouch(.auto, focus: .tabStop) == .tap)
  #expect(P.resolvedTouch(.auto, focus: .control) == .none)
  // Explicit choices override, as core's `tap` and `none`.
  #expect(P.resolvedTouch(.tap, focus: .control) == .tap)
  #expect(P.resolvedTouch(.none, focus: .none) == .none)
}

@Test func noSwiftViewUsesHelpForTooltips() throws {
  // `.help` is also the VoiceOver hint and never shows on focus or a tap, so
  // every tooltip goes through `astryxTooltip` (library/tooltip.spec.md).
  let sources = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .appendingPathComponent("Sources")
  let files = FileManager.default.enumerator(at: sources, includingPropertiesForKeys: nil)?
    .compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" } ?? []
  #expect(!files.isEmpty)
  for file in files {
    let text = try String(contentsOf: file, encoding: .utf8)
    #expect(!text.contains(".help("), "\(file.lastPathComponent) uses .help")
  }
}

@Test func theBubbleStaysInsideTheSafeAreaWithCoresFloor() {
  typealias P = TooltipPresenter
  // Under a 59-point status bar with a 16-point floor, a 25-point bubble needs
  // the view at least 59 + 16 + 25 + 4 points down to go above.
  #expect(P.placesAbove(viewTop: 104, bubbleHeight: 25, gap: 4, topEdge: 75))
  #expect(!P.placesAbove(viewTop: 90, bubbleHeight: 25, gap: 4, topEdge: 75))
  // A 44-point sensor inset on the leading side with the floor.
  #expect(P.slide(viewMinX: 0, viewWidth: 40, bubbleWidth: 100, windowWidth: 800, margin: 60, trailing: 16) == 90)
  #expect(P.slide(viewMinX: 760, viewWidth: 40, bubbleWidth: 100, windowWidth: 800, margin: 60, trailing: 16) == -46)
}

@Test func aClickedViewsBubbleHidesWhenThePointerLeaves() {
  typealias P = TooltipPresenter
  // Hovered: up, whatever brought focus.
  #expect(P.showsBubble(hasText: true, isHovering: true, isHoveringBubble: false, isFocused: true, focusIsKeyboard: false, focus: .tabStop))
  // The pointer leaves a view a click focused: down.
  #expect(!P.showsBubble(hasText: true, isHovering: false, isHoveringBubble: false, isFocused: true, focusIsKeyboard: false, focus: .tabStop))
  // Keyboard focus holds it.
  #expect(P.showsBubble(hasText: true, isHovering: false, isHoveringBubble: false, isFocused: true, focusIsKeyboard: true, focus: .tabStop))
}

