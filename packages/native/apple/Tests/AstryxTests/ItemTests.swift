// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
import SwiftUI
import Testing
@testable import Astryx

// Swift Item spec (component:swift/Item): core's row, its slots in reading
// order, density, alignment, and states, drawn the same static, as a button,
// or as a link.

@MainActor
@Test func trailingClosuresFillTheSlotsTheyName() {
  let start = Item("Ada") { Color.red }
  let both = Item("Ada") { Color.red } endContent: { Color.blue }
  let end = Item("Ada", endContent: { Color.blue })
  let pressable = Item("Settings", onClick: {})
  let trailingPress = Item("Archive") { Color.red } onClick: {}
  #expect(type(of: start) == Item<EmptyView, Color, EmptyView>.self)
  #expect(type(of: both) == Item<EmptyView, Color, Color>.self)
  #expect(type(of: end) == Item<EmptyView, EmptyView, Color>.self)
  #expect(type(of: pressable) == Item<EmptyView, EmptyView, EmptyView>.self)
  #expect(pressable.props.onClick != nil)
  #expect(type(of: trailingPress) == Item<EmptyView, Color, EmptyView>.self)
  #expect(trailingPress.props.onClick != nil)
}

@MainActor
@Test func itemInitializersBuildTheSameProps() {
  let labeled = Item(
    "Ada", description: "Mathematician", align: .firstLine, density: .spacious, labelLines: 2,
    descriptionLines: 3, layout: .inline, href: "https://example.com", isHighlighted: true, isSelected: true,
    isDisabled: true
  ).props
  let fromProps = Item(
    ItemProps(
      label: "Ada", description: "Mathematician", align: .firstLine, density: .spacious, labelLines: 2,
      descriptionLines: 3, layout: .inline, href: "https://example.com", isHighlighted: true, isSelected: true,
      isDisabled: true)
  ).props
  #expect(labeled.label == fromProps.label)
  #expect(labeled.description == fromProps.description)
  #expect(labeled.align == fromProps.align)
  #expect(labeled.density == fromProps.density)
  #expect(labeled.labelLines == fromProps.labelLines)
  #expect(labeled.descriptionLines == fromProps.descriptionLines)
  #expect(labeled.layout == fromProps.layout)
  #expect(labeled.href == fromProps.href)
  #expect(labeled.isHighlighted == fromProps.isHighlighted)
  #expect(labeled.isSelected == fromProps.isSelected)
  #expect(labeled.isDisabled == fromProps.isDisabled)
  #expect(labeled.base == fromProps.base)
}

@MainActor
@Test func densityAddsCoresBlockPadding() {
  let tokens = Theme.default.light.space
  let compact = Pixels(Item("Ada", density: .compact).frame(width: 240))
  let balanced = Pixels(Item("Ada").frame(width: 240))
  let spacious = Pixels(Item("Ada", density: .spacious).frame(width: 240))
  #expect(balanced.height - compact.height == Int(2 * (tokens.s2 - tokens.s1)))
  #expect(spacious.height - balanced.height == Int(2 * (tokens.s3 - tokens.s2)))
}

@MainActor
@Test func aTappableRowIsAtLeast44PointsTallAndAStaticOneKeepsCoresHeight() {
  let still = Pixels(Item("Ada", density: .compact).frame(width: 240))
  let button = Pixels(Item("Ada", density: .compact, onClick: {}).frame(width: 240))
  let link = Pixels(Item("Ada", density: .compact, href: "https://example.com").frame(width: 240))
  #expect(still.height < 44)
  #expect(button.height == 44)
  #expect(link.height == 44)
}

@MainActor
@Test func selectedWinsOverHighlightedAndBothUseTheTheme() {
  let accentMuted = rgba(Theme.default.light.color.accentMuted)
  let overlay = rgba(Theme.default.light.color.overlayHover)
  let selected = Pixels(Item("Ada", isHighlighted: true, isSelected: true).frame(width: 240).background(Color.white))
  let highlighted = Pixels(Item("Ada", isHighlighted: true).frame(width: 240).background(Color.white))
  let plain = Pixels(Item("Ada").frame(width: 240).background(Color.white))
  let x = 230, y = 10
  #expect(close(selected.at(x, y), onWhite(accentMuted), within: 3))
  #expect(close(highlighted.at(x, y), onWhite(overlay), within: 3))
  #expect(close(plain.at(x, y), [255, 255, 255, 255], within: 1))
}

@MainActor
@Test func anItemRendersFromTwoThemesWithNoColorOfItsOwn() {
  let view = Item("Ada", isSelected: true).frame(width: 240).background(Color.white)
  let neutral = Pixels(view, theme: .neutral).at(230, 10)
  let butter = Pixels(view, theme: .butter).at(230, 10)
  #expect(close(neutral, onWhite(rgba(Theme.neutral.light.color.accentMuted)), within: 3))
  #expect(close(butter, onWhite(rgba(Theme.butter.light.color.accentMuted)), within: 3))
}

@MainActor
@Test func aDisabledRowDimsItsWordsAndEndContentNotItsStartContent() {
  let red = [255, 0, 0, 255]
  let swatch = { Color(red: 1, green: 0, blue: 0).frame(width: 12, height: 12) }
  let start = Pixels(Item("Ada", isDisabled: true, startContent: swatch).frame(width: 240))
  let end = Pixels(Item("Ada", isDisabled: true, endContent: swatch).frame(width: 240))
  let enabledEnd = Pixels(Item("Ada", endContent: swatch).frame(width: 240))
  #expect(start.contains { close($0, red) })
  #expect(!end.contains { close($0, red) })
  #expect(enabledEnd.contains { close($0, red) })
}

@MainActor
@Test func alignPlacesTheSlotsOnTheWords() {
  let tokens = Theme.default.light
  let marker = { Color(red: 1, green: 0, blue: 0).frame(width: 8, height: 8) }
  let start = Pixels(Item("Ada", description: "Mathematician", align: .start, startContent: marker).frame(width: 240))
  let centered = Pixels(Item("Ada", description: "Mathematician", startContent: marker).frame(width: 240))
  let red = [255, 0, 0, 255]
  let x = Int(tokens.space.s2) + 4
  // `start`: the slot's top is on the row's top padding.
  #expect(close(start.at(x, Int(tokens.space.s2) + 1), red))
  #expect(!close(start.at(x, start.height / 2 + 6), red))
  // `center`: the slot sits in the middle of the row.
  #expect(close(centered.at(x, centered.height / 2), red))
}

@MainActor
@Test func aLineTakesTheThemesLeading() {
  let tokens = Theme.default.light
  let row = Pixels(Item("Ada", density: .compact).frame(width: 240))
  #expect(abs(row.height - Int((2 * tokens.space.s1 + tokens.font.body.leading * tokens.font.body.size).rounded())) <= 1)
}

@MainActor
@Test func firstLineCentersATallSlotOnTheLabelsFirstLine() {
  let red = [255, 0, 0, 255]
  let tall = { Color(red: 1, green: 0, blue: 0).frame(width: 10, height: 40) }
  func slotCenter(_ p: Pixels) -> Double {
    let rows = (0..<p.height).filter { y in close(p.at(14, y), red) }
    return Double(rows.first! + rows.last!) / 2
  }
  /// The middle of the label's ink: the first run of drawn rows in the words.
  func labelCenter(_ p: Pixels) -> Double {
    let ink = (0..<p.height).map { y in (30..<120).contains { x in p.at(x, y)[3] > 128 } }
    let top = ink.firstIndex(of: true)!
    var bottom = top
    while bottom + 1 < ink.count && ink[bottom + 1] { bottom += 1 }
    return Double(top + bottom) / 2
  }
  let first = Pixels(Item("Ada", description: "Mathematician", align: .firstLine, startContent: tall).frame(width: 240))
  let center = Pixels(Item("Ada", description: "Mathematician", startContent: tall).frame(width: 240))
  #expect(abs(slotCenter(first) - labelCenter(first)) <= 1.5)
  // `center` puts the same slot on the middle of the words instead.
  #expect(abs(slotCenter(center) - labelCenter(center)) > 4)
}

@MainActor
@Test func rowsReadTheirTapAndState() {
  #expect(Item("Ada").tap == .none)
  #expect(Item("Ada", onClick: {}).tap == .button)
  #expect(Item("Ada", href: "https://example.com", onClick: {}).tap == .link)
  #expect(Item<EmptyView, EmptyView, EmptyView>.addedTraits(isSelected: true) == .isSelected)
  #expect(Item<EmptyView, EmptyView, EmptyView>.addedTraits(isSelected: false) == [])
}

@MainActor
@Test func rowsGrowWithTheLargestTextSize() {
  let large = Pixels(Item("Ada", description: "Mathematician").frame(width: 320))
  let largest = Pixels(Item("Ada", description: "Mathematician").frame(width: 320), typeSize: .accessibility5)
  #expect(largest.height > large.height * 2)
  let tappable = Pixels(Item("Ada", onClick: {}).frame(width: 320), typeSize: .accessibility5)
  #expect(tappable.height > 44)
}

@MainActor
@Test func aWebPathIsAnItemHrefTheAppCannotOpen() {
  #expect(Item<EmptyView, EmptyView, EmptyView>.isUnusableHref("/calendar"))
  #expect(!Item<EmptyView, EmptyView, EmptyView>.isUnusableHref("https://example.com/calendar"))
  #expect(!Item<EmptyView, EmptyView, EmptyView>.isUnusableHref(nil))
  // The check reads the href as the link does: a padded absolute URL opens
  // as a link and is not flagged.
  #expect(!Item<EmptyView, EmptyView, EmptyView>.isUnusableHref(" https://example.com "))
  #expect(Item("Ada", href: " https://example.com ").linkURL == URL(string: "https://example.com"))
}

@MainActor
@Test func anInlineLabelWithoutADescriptionStillTruncates() {
  let words = "A label long enough to need more than the row's width at one line"
  let stacked = Pixels(Item(words).frame(width: 160))
  let inline = Pixels(Item(words, layout: .inline).frame(width: 160))
  #expect(inline.width == 160)
  #expect(inline.height == stacked.height)
  // The end content stays inside the row instead of being pushed past it.
  let withEnd = Pixels(Item(words, layout: .inline, endContent: { Color(red: 1, green: 0, blue: 0).frame(width: 10, height: 10) }).frame(width: 160))
  #expect(withEnd.contains { close($0, [255, 0, 0, 255]) })
}

@MainActor
@Test func aPressShowsAboveASelectedFill() {
  let tokens = Theme.neutral.light.color
  let rest = Pixels(ItemPressBackground(radius: 0, fill: tokens.accentMuted, pressed: tokens.overlayPressed, isPressed: false).frame(width: 8, height: 8))
  let pressed = Pixels(ItemPressBackground(radius: 0, fill: tokens.accentMuted, pressed: tokens.overlayPressed, isPressed: true).frame(width: 8, height: 8))
  #expect(!close(rest.at(4, 4), pressed.at(4, 4), within: 3))
}

@Test func lineCountsComeFromTheContract() {
  // Unset is one line; otherwise core's shared count: zero, a fraction, or a
  // count too large to reach shows every line, as core's unclamped row does.
  #expect(Item<EmptyView, EmptyView, EmptyView>.lines(nil) == 1)
  #expect(Item<EmptyView, EmptyView, EmptyView>.lines(0) == nil)
  #expect(Item<EmptyView, EmptyView, EmptyView>.lines(3) == 3)
  #expect(Item<EmptyView, EmptyView, EmptyView>.lines(.infinity) == nil)
  #expect(Item<EmptyView, EmptyView, EmptyView>.lines(1e300) == nil)
}

@MainActor
@Test func aLongLabelTruncatesToItsLines() {
  let words = "A label long enough to wrap onto more than one line in a narrow row"
  let one = Pixels(Item(words).frame(width: 160))
  let three = Pixels(Item(words, labelLines: 3).frame(width: 160))
  #expect(three.height > one.height)
}

@MainActor
@Test func hrefMakesALinkAndStatesReadFromTheContract() {
  #expect(Item("Ada", href: "https://example.com/ada").linkURL == URL(string: "https://example.com/ada"))
  #expect(Item("Ada", href: "").linkURL == nil)
  #expect(Item("Ada", href: "not a url").linkURL == nil)
  #expect(Item("Ada", href: "/calendar").linkURL == nil)
  // A script URL or an HTML document in a data URL stays inert, as core's
  // navigation destinations refuse them; the row is static or a button.
  for refused in ["javascript:alert(1)", " JavaScript: alert(1)", "vbscript:msgbox", "data:text/html,<p>", "data: text/html,<p>"] {
    #expect(Item("Ada", href: refused).linkURL == nil, "\(refused)")
    #expect(Item("Ada", href: refused).tap == .none, "\(refused)")
  }
  #expect(Item("Ada", href: "javascript:alert(1)", onClick: {}).tap == .button)
  #expect(Item("Ada", isSelected: true).isSelected)
  #expect(!Item("Ada").isSelected)
  #expect(Item("Ada", isDisabled: true).isDisabled)
}

@MainActor
@Test func aHiddenItemDrawsNothing() {
  let hidden = Pixels(
    HStack(spacing: 0) {
      Color.clear.frame(width: 1, height: 1)
      Item(ItemProps(label: "Ada", base: AstryxBaseProps(isHidden: true)))
    }.fixedSize()
  )
  #expect(hidden.width == 1)
}

/// A theme color drawn over white.
private func onWhite(_ c: [Int]) -> [Int] {
  (0..<3).map { (c[$0] * c[3] + 255 * (255 - c[3])) / 255 } + [255]
}

// AST-082 FR19: an Item node from a logic core draws as Item.
@MainActor
@Test func anItemNodeDrawsAsAnItem() {
  let json = #"{"component":"Item","key":"i","props":{"label":"Ada Lovelace"}}"#
  guard let node = try? JSONDecoder().decode(AstryxNode.self, from: Data(json.utf8)) else {
    Issue.record("the item did not decode")
    return
  }
  #expect(AstryxNodeView.componentName(node) == "Item")
  let wired = Pixels(AstryxNodeView(node) { _ in }.frame(width: 200))
  let direct = Pixels(Item("Ada Lovelace").frame(width: 200))
  #expect(wired.height == direct.height)
}

// AST-082 FR19: an Item node's content slots draw their nodes, as a direct
// Item draws its slots.
@MainActor
@Test func anItemNodeDrawsItsContentSlots() {
  let json = """
    {"component":"Item","key":"i","props":{"label":"Ada Lovelace",
      "startContent":[{"component":"Avatar","key":"a","props":{"name":"Ada Lovelace","size":"sm"}}],
      "endContent":[{"component":"Text","key":"t","props":{"children":"Admin"}}]}}
    """
  guard let node = try? JSONDecoder().decode(AstryxNode.self, from: Data(json.utf8)) else {
    Issue.record("the item did not decode")
    return
  }
  let wired = Pixels(AstryxNodeView(node) { _ in }.frame(width: 240))
  let direct = Pixels(
    Item("Ada Lovelace") { Avatar("Ada Lovelace", size: .sm) } endContent: { Astryx.Text("Admin") }.frame(width: 240))
  let bare = Pixels(Item("Ada Lovelace").frame(width: 240))
  #expect(wired.width == direct.width && wired.height == direct.height)
  // The slots draw: the wired row is not the bare row. The leading 40
  // points hold the avatar, which a bare row leaves empty.
  var leadingDiffers = false
  for y in 0..<min(wired.height, bare.height) {
    for x in 0..<40 where wired.at(x, y) != bare.at(x, y) { leadingDiffers = true }
  }
  #expect(leadingDiffers)
}

