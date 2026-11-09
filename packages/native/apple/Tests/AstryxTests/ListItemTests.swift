// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
import SwiftUI
import Testing
@testable import Astryx

// Swift ListItem spec (component:swift/ListItem): an Item that takes its
// density, marker, dividers, and edge from its list.

private let red = [255, 0, 0, 255]
@MainActor private func swatch() -> some View { Color(red: 1, green: 0, blue: 0).frame(width: 10, height: 10) }

@MainActor
private func inList<V: View>(_ view: V, _ context: ListContext) -> some View {
  view.environment(\.astryxListContext, context).frame(width: 240)
}

@MainActor
@Test func listItemInitializersBuildTheSameProps() {
  let labeled = ListItem("Ada", description: "Mathematician", align: .start, href: "https://example.com", isDisabled: true, isSelected: true).props
  let fromProps = ListItem(ListItemProps(label: "Ada", description: "Mathematician", href: "https://example.com", align: .start, isDisabled: true, isSelected: true)).props
  #expect(labeled.label == fromProps.label)
  #expect(labeled.description == fromProps.description)
  #expect(labeled.align == fromProps.align)
  #expect(labeled.href == fromProps.href)
  #expect(labeled.isDisabled == fromProps.isDisabled)
  #expect(labeled.isSelected == fromProps.isSelected)
  #expect(labeled.base == fromProps.base)
}

@MainActor
@Test func aListItemAloneDrawsAsAnItem() {
  let row = Pixels(ListItem("Ada", description: "Mathematician").frame(width: 240))
  let item = Pixels(Item("Ada", description: "Mathematician").frame(width: 240))
  #expect(row.width == item.width && row.height == item.height)
}

@MainActor
@Test func aListItemTakesItsListsDensity() {
  let compact = Pixels(inList(ListItem("Ada"), ListContext(density: .compact, hasDividers: false, isFlush: false)))
  let spacious = Pixels(inList(ListItem("Ada"), ListContext(density: .spacious, hasDividers: false, isFlush: false)))
  let tokens = Theme.default.light.space
  #expect(spacious.height - compact.height == Int(2 * (tokens.s3 - tokens.s1)))
}

@MainActor
@Test func aFlushListDropsTheRowsInlineInset() {
  let padded = Pixels(inList(ListItem("Ada", startContent: { swatch() }), ListContext(hasDividers: false, isFlush: false)))
  let flush = Pixels(inList(ListItem("Ada", startContent: { swatch() }), ListContext(hasDividers: false, isFlush: true)))
  #expect(!close(padded.at(1, padded.height / 2), red))
  #expect(close(flush.at(1, flush.height / 2), red))
}

@MainActor
@Test func rowsBetweenDividersHaveSquareCorners() {
  let accent = Theme.default.light.color.accentMuted
  let rounded = Pixels(inList(ListItem("Ada", isSelected: true), ListContext(hasDividers: false, isFlush: false)))
  let square = Pixels(inList(ListItem("Ada", isSelected: true), ListContext(hasDividers: true, isFlush: false)))
  #expect(rounded.at(0, 0)[3] < 8)
  #expect(close(square.at(0, 0), plate(accent), within: 6))
}

@MainActor
@Test func aDecimalListNumbersItsRows() {
  #expect(ListItem<EmptyView, EmptyView>.number(ordinal: 3) == "3.")
  let numbers = ListNumbers()
  let first = UUID(), second = UUID()
  numbers.assign([first, second], start: 3)
  #expect(numbers.number(for: first) == 3 && numbers.number(for: second) == 4)
  let numbered = Pixels(inList(ListItem("MMMMMM"), ListContext(hasDividers: false, isFlush: false, marker: .decimal)))
  let plain = Pixels(inList(ListItem("MMMMMM"), ListContext(hasDividers: false, isFlush: false)))
  // The number takes a marker column, so a run of blank columns opens
  // between it and the words; without a marker the words start at once.
  func longestBlankRun(_ p: Pixels) -> Int {
    var longest = 0, run = 0
    for x in 8..<80 {
      let blank = (0..<p.height).allSatisfy { y in p.at(x, y)[3] < 64 }
      run = blank ? run + 1 : 0
      longest = max(longest, run)
    }
    return longest
  }
  #expect(longestBlankRun(numbered) >= 5)
  #expect(longestBlankRun(plain) < 5)
}

@MainActor
@Test func aMarkerSitsOnTheLabelsFirstLineWhateverTheAlignment() {
  func dotCenter(_ p: Pixels) -> Double {
    let rows = (0..<p.height).filter { y in (8..<24).contains { x in p.at(x, y)[3] > 200 } }
    return Double(rows.first! + rows.last!) / 2
  }
  func labelCenter(_ p: Pixels) -> Double {
    let ink = (0..<p.height).map { y in (40..<140).contains { x in p.at(x, y)[3] > 128 } }
    let top = ink.firstIndex(of: true)!
    var bottom = top
    while bottom + 1 < ink.count && ink[bottom + 1] { bottom += 1 }
    return Double(top + bottom) / 2
  }
  let context = ListContext(hasDividers: false, isFlush: false, marker: .disc)
  for align in [ListItemAlign.center, .start, .firstLine] {
    let row = Pixels(inList(ListItem("Ada", description: "Mathematician", align: align), context))
    #expect(abs(dotCenter(row) - labelCenter(row)) <= 1.5, "\(align)")
  }
}

/// A translucent theme color as the renderer stores it, premultiplied.
private func plate(_ color: Color) -> [Int] {
  let c = rgba(color)
  return [c[0] * c[3] / 255, c[1] * c[3] / 255, c[2] * c[3] / 255, c[3]]
}

@MainActor
@Test func aWideNumberKeepsTheListsTextEdge() {
  // The column is space.s4 wide while a number fits it and the row's inset,
  // so labels line up; "10." reaches into a balanced row's 8-point inset.
  let s4 = Int(Theme.default.light.space.s4)
  #expect(Pixels(ListMarkerNumber(text: "1.", inset: 8)).width == s4)
  #expect(Pixels(ListMarkerNumber(text: "10.", inset: 8)).width == s4)
}

@MainActor
@Test func numbersEndAtTheColumnsEndSoPeriodsLineUp() {
  // Core's numbered markers end where the marker ends, with tabular figures,
  // so "1." and "10." put their periods at the same place.
  func rightmostInk(_ p: Pixels) -> Int {
    (0..<p.width).last { x in (0..<p.height).contains { y in p.at(x, y)[3] > 64 } } ?? -1
  }
  let one = Pixels(ListMarkerNumber(text: "1.", inset: 8))
  let ten = Pixels(ListMarkerNumber(text: "10.", inset: 8))
  #expect(rightmostInk(one) >= 0)
  #expect(abs(rightmostInk(one) - rightmostInk(ten)) <= 1)
  // The number sits at the column's end, not its start.
  #expect(rightmostInk(one) >= one.width - 3)
}

@Test func aNumberWiderThanTheColumnAndInsetWidensTheSharedColumn() {
  typealias Row = ListItem<EmptyView, EmptyView>
  #expect(Row.numberColumn(base: 16, widest: 20, inset: 8) == 16)
  #expect(Row.numberColumn(base: 16, widest: 40, inset: 8) == 32)
  #expect(Row.numberColumn(base: 16, widest: 30, inset: 0) == 30)
}

@MainActor
@Test func aListSharesItsWidestNumber() {
  let numbers = ListNumbers()
  let first = UUID(), second = UUID()
  numbers.assign([first, second], start: 1)
  numbers.report(first, width: 20)
  numbers.report(second, width: 30)
  #expect(numbers.widest == 30)
  // A row that leaves the list no longer widens it.
  numbers.assign([first], start: 1)
  #expect(numbers.widest == 20)
}

@Test func onlyANumberMarkerIsRead() {
  #expect(ListItem<EmptyView, EmptyView>.markerIsRead(.decimal))
  #expect(!ListItem<EmptyView, EmptyView>.markerIsRead(.disc))
  #expect(!ListItem<EmptyView, EmptyView>.markerIsRead(.circle))
}

@MainActor
@Test func aMarkerStaysOnTheFirstLineAtTheLargestTextSize() {
  let context = ListContext(hasDividers: false, isFlush: false, marker: .disc)
  let large = Pixels(inList(ListItem("Ada", description: "Mathematician"), context))
  let largest = Pixels(inList(ListItem("Ada", description: "Mathematician"), context), typeSize: .accessibility5)
  #expect(largest.height > large.height)
  // The dot sits in the top part of the row, by the first line, not its middle.
  // The marker column grows with text, so look across it.
  let rows = (0..<largest.height).filter { y in (8..<60).contains { x in largest.at(x, y)[3] > 200 } }
  #expect(!rows.isEmpty && rows.last! < largest.height / 2)
}

@MainActor
@Test func markersDrawInEachThemesPrimaryText() {
  for theme in [Theme.neutral, Theme.butter] {
    let drawn = Pixels(inList(ListItem("Ada"), ListContext(hasDividers: false, isFlush: false, marker: .disc)), theme: theme)
    let ink = (0..<drawn.height).flatMap { y in (8..<24).map { x in drawn.at(x, y) } }.filter { $0[3] == 255 }
    #expect(ink.contains { close($0, rgba(theme.light.color.textPrimary), within: 8) })
  }
}

@MainActor
@Test func aRowNestedInASlotTakesNoListLook() {
  // A nested row has no marker column, so its words start at its own inset.
  let context = ListContext(hasDividers: false, isFlush: true, marker: .disc)
  let nested = Pixels(inList(ListItem("Outer", endContent: { ListItem("MMMM").frame(width: 100) }), context))
  let alone = Pixels(ListItem("MMMM").frame(width: 100))
  let start = { (p: Pixels, from: Int) in (from..<p.width).first { x in (0..<p.height).contains { y in p.at(x, y)[3] > 128 } } ?? -1 }
  #expect(start(nested, 140) - 140 == start(alone, 0))
}

@MainActor
@Test func aNumberFitsItsColumnAtTheLargestTextSize() {
  // The column grows with the number, so a one-digit number never runs into
  // its label at the largest text size.
  let column = Pixels(ListMarkerNumber(text: "9."), typeSize: .accessibility5).width
  let drawn = Pixels(
    ZStack(alignment: .leading) {
      Color.clear.frame(width: 200, height: 80)
      ListMarkerNumber(text: "9.")
    },
    typeSize: .accessibility5)
  let rightmostInk = (0..<200).last { x in (0..<drawn.height).contains { y in drawn.at(x, y)[3] > 64 } } ?? 0
  #expect(column > Int(Theme.default.light.space.s4))
  #expect(rightmostInk < column)
}

// AST-082 FR19: a ListItem node draws as a ListItem, with its content slots.
@MainActor
@Test func aListItemNodeDrawsItsContentSlots() {
  let json = """
    {"component":"ListItem","key":"r","props":{"label":"Ada Lovelace",
      "startContent":[{"component":"Avatar","key":"a","props":{"name":"Ada Lovelace","size":"sm"}}]}}
    """
  guard let node = try? JSONDecoder().decode(AstryxNode.self, from: Data(json.utf8)) else {
    Issue.record("the row did not decode")
    return
  }
  #expect(AstryxNodeView.componentName(node) == "ListItem")
  let wired = Pixels(AstryxNodeView(node) { _ in }.frame(width: 240))
  let direct = Pixels(ListItem("Ada Lovelace") { Avatar("Ada Lovelace", size: .sm) }.frame(width: 240))
  let bare = Pixels(ListItem("Ada Lovelace").frame(width: 240))
  #expect(wired.width == direct.width && wired.height == direct.height)
  // The slot draws: the leading 40 points hold the avatar, which a bare row
  // leaves empty.
  var leadingDiffers = false
  for y in 0..<min(wired.height, bare.height) {
    for x in 0..<40 where wired.at(x, y) != bare.at(x, y) { leadingDiffers = true }
  }
  #expect(leadingDiffers)
}
