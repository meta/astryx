// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
import SwiftUI
import Testing
@testable import Astryx

// Swift AvatarStatusDot spec (component:swift/AvatarStatusDot): core's three
// variants and size tiers, placed on the avatar's corner, with the label in
// the avatar's name.

@Test func theDotTakesCoresTierForTheAvatarSize() {
  #expect(AvatarStatusDot.tier(forAvatarSide: 36) == .init(dot: 10, border: 1, stroke: 1))
  #expect(AvatarStatusDot.tier(forAvatarSide: 48) == .init(dot: 20, border: 2, stroke: 1.5))
  #expect(AvatarStatusDot.tier(forAvatarSide: 128) == .init(dot: 32, border: 4, stroke: 2))
  #expect(AvatarStatusDot.tier(forAvatarSide: nil) == .init(dot: 10, border: 1, stroke: 1))
}

@MainActor
@Test func statusDotInitializersBuildTheSameProps() {
  let labeled = AvatarStatusDot(variant: .error, label: "Busy").props
  let fromProps = AvatarStatusDot(AvatarStatusDotProps(variant: .error, label: "Busy")).props
  #expect(labeled.variant == fromProps.variant)
  #expect(labeled.label == fromProps.label)
  #expect(labeled.base == fromProps.base)
  #expect(AvatarStatusDot().variant == .success)
}

@Test func theStatusJoinsTheAvatarsName() {
  #expect(Avatar<EmptyView>.accessibleName(name: "Ada Lovelace", status: "Online") == "Ada Lovelace, Online")
  #expect(Avatar<EmptyView>.accessibleName(name: "Ada Lovelace", status: nil) == "Ada Lovelace")
  #expect(Avatar<EmptyView>.accessibleName(name: nil, status: "Online") == "Online")
  #expect(Avatar<EmptyView>.accessibleName(name: nil, status: nil) == nil)
}

@MainActor
@Test func eachVariantPaintsItsTokensAndShape() {
  let tokens = Theme.default.light.color
  let success = Pixels(AvatarStatusDot(variant: .success).environment(\.astryxAvatarSide, 128).fixedSize())
  let error = Pixels(AvatarStatusDot(variant: .error).environment(\.astryxAvatarSide, 128).fixedSize())
  let neutral = Pixels(AvatarStatusDot(variant: .neutral).environment(\.astryxAvatarSide, 128).fixedSize())
  #expect(success.width == 32 && success.height == 32)
  // The center: filled on success, the bar's surface ink on error, the
  // ring's empty surface plate on neutral.
  #expect(close(success.at(16, 16), rgba(tokens.success)))
  #expect(close(error.at(16, 16), rgba(tokens.onError)))
  #expect(close(error.at(16, 9), rgba(tokens.error)))
  #expect(close(neutral.at(16, 16), rgba(tokens.backgroundSurface)))
  // The neutral ring: its 2-point stroke sits just inside the 4-point border,
  // on the inner field's edge, in secondary text, on all four sides.
  for (x, y) in [(16, 5), (16, 26), (5, 16), (26, 16)] {
    #expect(close(neutral.at(x, y), rgba(tokens.textSecondary), within: 12), "ring at \(x), \(y)")
  }
}

@MainActor
@Test func theDotSitsOnTheAvatarsCornerWithoutChangingItsSize() {
  let plain = Pixels(Avatar("Ada Lovelace", size: .lg).fixedSize())
  let withDot = Pixels(Avatar("Ada Lovelace", size: .lg) { AvatarStatusDot(variant: .success) }.fixedSize())
  #expect(withDot.width == plain.width && withDot.height == plain.height)
  // A 20-point dot on a 48-point avatar: its center on the circle's edge at
  // the bottom trailing 45° point, or a quarter over a square's corner.
  typealias A = Avatar<EmptyView>
  let dot = CGSize(width: 20, height: 20)
  let inset: CGFloat = 48 * A.circleEdgeInset
  let expected: CGFloat = 10 - inset
  #expect(abs(A.statusOffset(content: dot, side: 48, shape: .circle).width - expected) < 0.001)
  #expect(A.statusOffset(content: dot, side: 48, shape: .square) == CGSize(width: 5, height: 5))
}

// Core's FR4 places any status content from its own size, not only a dot.
@Test func otherStatusContentIsPlacedFromItsOwnSize() {
  typealias A = Avatar<EmptyView>
  let icon = CGSize(width: 16, height: 16)
  #expect(A.statusOffset(content: icon, side: 48, shape: .square) == CGSize(width: 4, height: 4))
  let onCircle = A.statusOffset(content: icon, side: 48, shape: .circle)
  let expected: CGFloat = 8 - 48 * A.circleEdgeInset
  #expect(abs(onCircle.width - expected) < 0.001)
}

/// The columns and rows a red square in the status slot covers, around a
/// 48-point avatar placed 20 points in.
@MainActor
private func redExtent(shape: AvatarShape, side content: CGFloat) -> (maxX: Int, maxY: Int) {
  let view = Avatar("Ada Lovelace", size: .lg, shape: shape) { Color.red.frame(width: content, height: content) }
    .padding(20).background(Color.white)
  let pixels = Pixels(view)
  var maxX = -1, maxY = -1
  for y in 0..<pixels.height { for x in 0..<pixels.width where pixels.at(x, y)[0] > 200 && pixels.at(x, y)[1] < 90 {
    maxX = max(maxX, x); maxY = max(maxY, y)
  } }
  return (maxX, maxY)
}

// Core's FR4 places any status element from its own size: a 40-point square
// overhangs a square avatar's corner by 10 points, not a dot's 5.
@MainActor
@Test func otherStatusContentRendersAtItsMeasuredPlace() {
  let square = redExtent(shape: .square, side: 40)
  // The avatar spans 20..<68; the content's corner lands 10 points past it.
  #expect(square.maxX == 77 && square.maxY == 77)
  // On a circle its center sits on the 45° point, whatever its size.
  let small = redExtent(shape: .circle, side: 10)
  let large = redExtent(shape: .circle, side: 30)
  #expect(abs((large.maxX - small.maxX) - 10) <= 1)
}

// Core's FR5: a dot's label wins over other labeled content in the slot,
// whichever comes first.
@Test func aDotsLabelWinsOverAnIcons() {
  let icon = AvatarStatusLabel(text: "Verified", isDot: false)
  let dot = AvatarStatusLabel(text: "Online", isDot: true)
  #expect(AvatarStatusLabelKey.winner(icon, dot) == dot)
  #expect(AvatarStatusLabelKey.winner(dot, icon) == dot)
  #expect(AvatarStatusLabelKey.winner(icon, nil) == icon)
  #expect(AvatarStatusLabelKey.winner(nil, nil) == nil)
}

@MainActor
@Test func aDotAloneIsAnImageNamedByItsLabel() {
  #expect(AvatarStatusDot(label: "Busy").label == "Busy")
  #expect(AvatarStatusDot.traits(label: "Busy") == .isImage)
  #expect(AvatarStatusDot(label: " ").label == nil)
  #expect(AvatarStatusDot.traits(label: nil) == [])
}

@MainActor
@Test func aDotRendersFromTwoThemesWithNoColorOfItsOwn() {
  let view = AvatarStatusDot(variant: .success).environment(\.astryxAvatarSide, 128).fixedSize()
  #expect(close(Pixels(view, theme: .neutral).at(16, 16), rgba(Theme.neutral.light.color.success)))
  #expect(close(Pixels(view, theme: .butter).at(16, 16), rgba(Theme.butter.light.color.success)))
  #expect(close(Pixels(view, scheme: .dark).at(16, 16), rgba(Theme.default.dark.color.success)))
}

@MainActor
@Test func aDotTakesTheTierOfItsGrownAvatarAtTheLargestTextSize() {
  // At the largest text size an lg avatar grows past 72 points, so its dot
  // moves up to the 32-point tier.
  let grown = Avatar<EmptyView>.side(for: .lg, textScale: 3)
  #expect(grown == (48 * Avatar<EmptyView>.maximumTextScale).rounded())
  #expect(AvatarStatusDot.tier(forAvatarSide: grown).dot == 32)
  #expect(AvatarStatusDot.tier(forAvatarSide: 48).dot == 20)
  let large = Pixels(Avatar("Ada Lovelace", size: .lg) { AvatarStatusDot(variant: .success) }.fixedSize())
  let largest = Pixels(
    Avatar("Ada Lovelace", size: .lg) { AvatarStatusDot(variant: .success) }.fixedSize(),
    typeSize: .accessibility5)
  #expect(largest.width == Int(grown) && large.width == 48)
}

@MainActor
@Test func aHiddenDotDrawsNothingAndNamesNothing() {
  let hidden = AvatarStatusDot(AvatarStatusDotProps(variant: .success, label: "Online", base: AstryxBaseProps(isHidden: true)))
  let withHidden = Pixels(Avatar("Ada Lovelace", size: .lg) { hidden }.fixedSize())
  let without = Pixels(Avatar("Ada Lovelace", size: .lg).fixedSize())
  let shown = Pixels(Avatar("Ada Lovelace", size: .lg) { AvatarStatusDot(variant: .success) }.fixedSize())
  // Where a shown dot overlaps the avatar, a hidden one leaves the avatar as is.
  #expect(withHidden.at(42, 42) == without.at(42, 42))
  #expect(shown.at(42, 42) != without.at(42, 42))
}

// AST-082 FR19: an Avatar node's status children draw as its dot.
@MainActor
@Test func anAvatarNodeDrawsItsStatusDot() {
  let json = """
    {"component":"Avatar","key":"a","props":{"name":"Ada Lovelace","size":"lg","status":[
      {"component":"AvatarStatusDot","key":"d","props":{"variant":"success","label":"Online"}}]}}
    """
  guard let node = try? JSONDecoder().decode(AstryxNode.self, from: Data(json.utf8)) else {
    Issue.record("the avatar did not decode")
    return
  }
  let wired = Pixels(AstryxNodeView(node) { _ in }.fixedSize())
  let direct = Pixels(Avatar("Ada Lovelace", size: .lg) { AvatarStatusDot(variant: .success, label: "Online") }.fixedSize())
  let bare = Pixels(Avatar("Ada Lovelace", size: .lg).fixedSize())
  // The dot overlaps the avatar's lower trailing edge.
  #expect(wired.at(42, 42) == direct.at(42, 42))
  #expect(wired.at(42, 42) != bare.at(42, 42))
}

@MainActor
@Test func anAvatarHoldingALabelledDotDrawsTheDotAndComposesItsName() {
  let held = Pixels(Avatar("Ada Lovelace", size: .lg) { AvatarStatusDot(variant: .success, label: "Online") }.fixedSize())
  let bare = Pixels(Avatar("Ada Lovelace", size: .lg).fixedSize())
  #expect(close(held.at(42, 42), rgba(Theme.default.light.color.success), within: 8))
  #expect(held.at(42, 42) != bare.at(42, 42))
  // The name the avatar composes from the dot's label; the rendered
  // accessibility tree that carries it is not measured (AR3, AR6).
  #expect(Avatar<EmptyView>.accessibleName(name: "Ada Lovelace", status: "Online") == "Ada Lovelace, Online")
}

/// The leftmost and rightmost columns the success fill covers in an avatar
/// with a dot, 20 points in from each side of the render.
@MainActor
private func dotColumns(_ direction: LayoutDirection, shape: AvatarShape) -> (min: Int, max: Int, width: Int) {
  let view = Avatar("Ada Lovelace", size: .lg, shape: shape) { AvatarStatusDot(variant: .success, label: "Online") }
    .padding(20).background(Color.white).environment(\.layoutDirection, direction)
  let pixels = Pixels(view.astryxTheme())
  let green = rgba(Theme.default.light.color.success)
  var columns: [Int] = []
  for y in 0..<pixels.height { for x in 0..<pixels.width where close(pixels.at(x, y), green, within: 10) { columns.append(x) } }
  return (columns.min() ?? -1, columns.max() ?? -1, pixels.width)
}

// FR7: right to left, the dot overhangs the bottom leading corner, the mirror
// of its left-to-right place, never inside the avatar.
@MainActor
@Test func rightToLeftTheDotMirrorsOutsideTheLeadingCorner() {
  for shape in [AvatarShape.square, .circle] {
    let ltr = dotColumns(.leftToRight, shape: shape)
    let rtl = dotColumns(.rightToLeft, shape: shape)
    #expect(abs(rtl.min - (ltr.width - 1 - ltr.max)) <= 1, "\(shape)")
    #expect(abs(rtl.max - (ltr.width - 1 - ltr.min)) <= 1, "\(shape)")
  }
  // On a square the dot passes the avatar's leading edge at x = 20.
  #expect(dotColumns(.rightToLeft, shape: .square).min < 20)
}

// FR2: the busy bar draws in on-error, as core pairs the error plate with
// its ink, in a theme where on-error and the surface differ.
@MainActor
@Test func theBusyBarDrawsInOnError() {
  let y2k = Theme.y2k.light.color
  #expect(!close(rgba(y2k.onError), rgba(y2k.backgroundSurface), within: 24))
  let error = Pixels(
    AvatarStatusDot(variant: .error).environment(\.astryxAvatarSide, 128).fixedSize().astryxTheme(.y2k)
      .environment(\.colorScheme, .light))
  #expect(close(error.at(16, 16), rgba(y2k.onError), within: 12))
  #expect(close(error.at(16, 9), rgba(y2k.error), within: 12))
}

// Slots S4: status content grows with text no faster than the avatar. At the
// largest text size a medium Icon stays at the avatar's 1.6 times growth.
@MainActor
@Test func statusContentGrowsNoFasterThanTheAvatarAtAX5() {
  #expect(Avatar<EmptyView>.statusTypeSizeCap == .accessibility1)
  let view = Avatar("Ada Lovelace", size: .lg, shape: .square) { Icon(.success, color: .success, size: .md) }
    .padding(40).background(Color.white)
  let pixels = Pixels(view, typeSize: .accessibility5)
  let green = rgba(Theme.default.light.color.iconSuccess)
  var columns: [Int] = []
  for y in 0..<pixels.height { for x in 0..<pixels.width where close(pixels.at(x, y), green, within: 24) { columns.append(x) } }
  let width = (columns.max() ?? 0) - (columns.min() ?? 0) + 1
  // 20 points at 1.6 times is 32; growing with text would give 62.
  #expect(width > 0 && width <= 33, "status icon \(width) points wide")
}

// Core fills its message in one pass: a name that contains a placeholder is
// read as written, never filled again.
@Test func aNameContainingAPlaceholderIsReadAsWritten() {
  #expect(Avatar<EmptyView>.accessibleName(name: "Fan of {status}", status: "Online") == "Fan of {status}, Online")
  #expect(AstryxStrings.fill("{name}, {status}", ["name": "{status}", "status": "{name}"]) == "{status}, {name}")
  #expect(AstryxStrings.fill("{name} {unknown}", ["name": "Ada"]) == "Ada {unknown}")
  #expect(AstryxStrings.fill("{name", ["name": "Ada"]) == "{name")
}

