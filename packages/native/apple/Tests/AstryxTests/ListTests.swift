// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
import SwiftUI
import Testing
@testable import Astryx

// Swift List spec (component:swift/List): a stack of rows that sets their
// density, marker, dividers, and edge, and numbers them.

/// A 10-point-tall row that takes a number as a `ListItem` does and paints
/// it into its red channel (40 per step), and the list's flush flag into its
/// green one.
private struct RowProbe: View {
  @Environment(\.astryxListNumbers) private var numbers
  @Environment(\.astryxListContext) private var context
  @State private var id = UUID()

  var body: some View {
    Color(red: Double((numbers?.number(for: id) ?? 0) * 40) / 255, green: context?.isFlush == true ? 1 : 0, blue: 0)
      .frame(width: 20, height: 10)
      .preference(key: ListRowsKey.self, value: [id])
  }
}

/// The number a probe row painted.
private func number(_ pixel: [Int]) -> Int { Int((Double(pixel[0]) / 40).rounded()) }

@MainActor
@Test func listInitializersBuildTheSameProps() {
  let labeled = Astryx.List(density: .compact, hasDividers: true, edge: .flush, listStyle: .decimal, start: 3) { RowProbe() }.props
  let fromProps = Astryx.List(ListProps(density: .compact, hasDividers: true, edge: .flush, listStyle: .decimal, start: 3)) { RowProbe() }.props
  #expect(labeled.density == fromProps.density)
  #expect(labeled.hasDividers == fromProps.hasDividers)
  #expect(labeled.edge == fromProps.edge)
  #expect(labeled.listStyle == fromProps.listStyle)
  #expect(labeled.start == fromProps.start)
  #expect(labeled.base == fromProps.base)
}

@MainActor
@Test func aListNumbersItsRowsFromStart() {
  let drawn = Pixels(Astryx.List(listStyle: .decimal, start: 3) { RowProbe(); RowProbe(); RowProbe() }.frame(width: 20))
  let gap = Int(Theme.default.light.space.s0_5)
  #expect(number(drawn.at(5, 5)) == 3)
  #expect(number(drawn.at(5, 15 + gap)) == 4)
  #expect(number(drawn.at(5, 25 + 2 * gap)) == 5)
  let fromOne = Pixels(Astryx.List { RowProbe() }.frame(width: 20))
  #expect(number(fromOne.at(5, 5)) == 1)
}

@MainActor
@Test func rowsInsideAForEachAreNumberedOneByOne() {
  let drawn = Pixels(Astryx.List(listStyle: .decimal) { ForEach(0..<3, id: \.self) { _ in RowProbe() } }.frame(width: 20))
  let gap = Int(Theme.default.light.space.s0_5)
  #expect(number(drawn.at(5, 25 + 2 * gap)) == 3)
}

@MainActor
@Test func rowsAreSpacedOrDividedAsCoresAre() {
  let gap = Int(Theme.default.light.space.s0_5)
  let spaced = Pixels(Astryx.List { RowProbe(); RowProbe() }.frame(width: 20))
  let divided = Pixels(Astryx.List(hasDividers: true) { RowProbe(); RowProbe() }.frame(width: 20))
  let borderWidth = Int(Theme.default.light.size.borderWidth)
  #expect(spaced.height == 20 + gap)
  // One divider of the theme's border width between the rows, none after the last.
  #expect(divided.height == 20 + borderWidth)
  // The renderer stores the translucent border premultiplied.
  let border = rgba(Theme.default.light.color.border)
  let stored = [border[0] * border[3] / 255, border[1] * border[3] / 255, border[2] * border[3] / 255, border[3]]
  #expect(close(divided.at(5, 10), stored, within: 3))
}

@MainActor
@Test func theFirstIOSPathLaysRowsOutTheSameWay() {
  // iOS 17 and macOS 14 reach the rows through `_VariadicView`.
  let rows = ListRows(gap: 0, divider: .black, dividerWidth: 1)
  let drawn = Pixels(_VariadicView.Tree(rows) { RowProbe(); RowProbe() }.frame(width: 20))
  #expect(drawn.height == 21)
  #expect(drawn.at(5, 10) == [0, 0, 0, 255])
}

@MainActor
@Test func aListCountsOnlyItsOwnRows() {
  // An inner list's rows are numbered by the inner list only.
  let gap = Int(Theme.default.light.space.s0_5)
  let drawn = Pixels(
    Astryx.List(listStyle: .decimal) {
      RowProbe()
      Astryx.List(listStyle: .decimal, start: 5) { RowProbe() }
      RowProbe()
    }.frame(width: 20))
  #expect(number(drawn.at(5, 5)) == 1)
  #expect(number(drawn.at(5, 15 + gap)) == 5)
  #expect(number(drawn.at(5, 25 + 2 * gap)) == 2)
}

@MainActor
@Test func aListTellsItsRowsItsDensityMarkerDividersAndEdge() {
  let context = Astryx.List(density: .spacious, hasDividers: true, edge: .flush, listStyle: .circle) { RowProbe() }.context
  #expect(context == ListContext(density: .spacious, hasDividers: true, isFlush: true, marker: .circle))
  let plain = Astryx.List { RowProbe() }.context
  #expect(plain == ListContext(density: nil, hasDividers: false, isFlush: false, marker: nil))
  #expect(Astryx.List<RowProbe, EmptyView>.marker(for: .disc) == .disc)
  #expect(Astryx.List<RowProbe, EmptyView>.marker(for: .decimal) == .decimal)
  let flush = Pixels(Astryx.List(edge: .flush) { RowProbe() }.frame(width: 20))
  #expect(flush.at(5, 5)[1] == 255)
}

@MainActor
@Test func aHeaderSitsAboveTheRows() {
  let s2 = Int(Theme.default.light.space.s2)
  let drawn = Pixels(Astryx.List { RowProbe() } header: { Color.black.frame(width: 20, height: 10) }.frame(width: 20))
  #expect(drawn.height == 10 + s2 + 10)
  #expect(drawn.at(5, 5) == [0, 0, 0, 255])
  #expect(number(drawn.at(5, 15 + s2)) == 1)
}

@MainActor
@Test func aListKeepsItsRowsAtTheLargestTextSize() {
  // Rows grow with their words; the list adds nothing that scales.
  let large = Pixels(Astryx.List(hasDividers: true) { ListItem("Wi-Fi"); ListItem("Bluetooth") }.frame(width: 240))
  let largest = Pixels(
    Astryx.List(hasDividers: true) { ListItem("Wi-Fi"); ListItem("Bluetooth") }.frame(width: 240),
    typeSize: .accessibility5)
  #expect(largest.height > large.height)
  #expect(largest.width == 240)
}

@Test func startsThatAreNotWholeOrFiniteNeverTrap() {
  typealias L = Astryx.List<EmptyView, EmptyView>
  #expect(L.firstNumber(nil) == 1)
  #expect(L.firstNumber(3) == 3)
  #expect(L.firstNumber(2.9) == 2)
  #expect(L.firstNumber(.nan) == 1)
  #expect(L.firstNumber(.infinity) == L.limit)
  #expect(L.firstNumber(-.infinity) == -L.limit)
  #expect(L.firstNumber(1e300) == L.limit)
}

@MainActor
@Test func changingStartRenumbersTheSameRows() {
  // The list keeps its rows' identities and hands them to its numbers again
  // when `start` changes; the numbers follow the new start.
  let numbers = ListNumbers()
  let a = UUID(), b = UUID()
  numbers.assign([a, b], start: 1)
  numbers.assign([a, b], start: 7)
  #expect(numbers.number(for: a) == 7 && numbers.number(for: b) == 8)
}

@MainActor
@Test func dividersTakeEachThemesBorderAndStayOutOfVoiceOver() {
  #expect(ListRows.dividersAreHidden)
  for theme in [Theme.neutral, Theme.butter] {
    let border = rgba(theme.light.color.border)
    let stored = [border[0] * border[3] / 255, border[1] * border[3] / 255, border[2] * border[3] / 255, border[3]]
    let divided = Pixels(Astryx.List(hasDividers: true) { RowProbe(); RowProbe() }.frame(width: 20), theme: theme)
    #expect(close(divided.at(5, 10), stored, within: 3))
  }
}

@MainActor
@Test func theDividerIsTheThemesBorderWidth() {
  var thick = Theme.default
  thick.light.size.borderWidth = 3
  let divided = Pixels(Astryx.List(hasDividers: true) { RowProbe(); RowProbe() }.frame(width: 20), theme: thick)
  #expect(divided.height == 23)
}

// AST-082 FR19: a List node draws its children as rows and its header above
// them, as the closures do.
@MainActor
@Test func aListNodeDrawsItsRowsAndHeader() {
  let json = """
    {"component":"List","key":"l","props":{"hasDividers":true,
      "header":[{"component":"Text","key":"h","props":{"children":"Steps"}}],
      "children":[
        {"component":"ListItem","key":"a","props":{"label":"Mix"}},
        {"component":"ListItem","key":"b","props":{"label":"Bake"}}]}}
    """
  guard let node = try? JSONDecoder().decode(AstryxNode.self, from: Data(json.utf8)) else {
    Issue.record("the list did not decode")
    return
  }
  #expect(AstryxNodeView.componentName(node) == "List")
  let wired = Pixels(AstryxNodeView(node) { _ in }.frame(width: 240))
  let direct = Pixels(
    Astryx.List(hasDividers: true) {
      ListItem("Mix")
      ListItem("Bake")
    } header: {
      Astryx.Text("Steps")
    }.frame(width: 240))
  #expect(wired.width == direct.width && wired.height == direct.height)
  // Without a header node, no header space opens above the rows.
  let headless = #"{"component":"List","key":"l","props":{"children":[{"component":"ListItem","key":"a","props":{"label":"Mix"}}]}}"#
  guard let bare = try? JSONDecoder().decode(AstryxNode.self, from: Data(headless.utf8)) else {
    Issue.record("the list did not decode")
    return
  }
  #expect(Pixels(AstryxNodeView(bare) { _ in }.frame(width: 240)).height == Pixels(Astryx.List { ListItem("Mix") }.frame(width: 240)).height)
}

// FR6: base props come through the shared mapping; a hidden list draws
// nothing and takes no space.
@MainActor
@Test func aHiddenListDrawsNothing() {
  let hidden = Pixels(
    VStack(spacing: 0) {
      Astryx.List(ListProps(base: AstryxBaseProps(isHidden: true))) { ListItem("Mix") }
      Color.black.frame(width: 20, height: 10)
    }.frame(width: 20))
  #expect(hidden.height == 10)
}

// AR1: a list with a header pairs it as the label of its rows' container, as
// core's aria-labelledby names the list; one without a header pairs nothing.
// This checks what the view sets, not the name VoiceOver announces (AR2).
@Test func theHeaderNamesTheList() {
  #expect(Astryx.List<EmptyView, Astryx.Text>.namesRowsFromHeader)
  #expect(Astryx.List<EmptyView, Heading>.namesRowsFromHeader)
  #expect(!Astryx.List<EmptyView, EmptyView>.namesRowsFromHeader)
}
