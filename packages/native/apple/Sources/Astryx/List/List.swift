// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
import SwiftUI

/// A vertical list of `ListItem` rows (core `List`). It sets the rows'
/// density, marker, dividers, and edge, and numbers the rows of a decimal
/// list. It is a plain stack, not `SwiftUI.List`: put it in a `ScrollView`, a
/// `Card`, or any container, as core's list sits in any container.
///
/// ```swift
/// List(hasDividers: true) {
///   ListItem("Wi-Fi", description: "Home")
///   ListItem("Bluetooth", description: "On")
/// }
/// List(listStyle: .decimal, start: 3) {
///   ListItem("Mix the batter")
///   ListItem("Bake for 30 minutes")
/// } header: {
///   Heading("Steps", level: .v3)
/// }
/// ```
public struct List<Content: View, Header: View>: View {
  /// The contract the view draws, the same for both initializers.
  public let props: ListProps
  let content: Content
  let header: Header
  @Environment(\.astryx) private var astryx
  @State private var numbers = ListNumbers()
  /// The rows as they last reported, to renumber them when `start` changes.
  @State private var rowIDs: [UUID] = []
  /// Pairs the header with the rows' container, so VoiceOver names the list
  /// by its header, as core's `aria-labelledby` does.
  @Namespace private var headerPair

  /// A list from its labeled props. The trailing closure holds the rows; a
  /// `header:` closure adds content above them.
  /// - Parameters:
  ///   - density: The rows' padding; `nil` is `balanced` (core `density`).
  ///   - hasDividers: Draws a line between rows and squares their corners (core `hasDividers`).
  ///   - edge: `padded` rows keep their inline inset; `flush` rows reach the list's edges; `nil` is `padded` (core `edge`).
  ///   - listStyle: Each row's marker: `none`, `disc`, `decimal`, or `circle`; `nil` is `none` (core `listStyle`).
  ///   - start: The first number of a `decimal` list; `nil` is 1 (core `start`).
  ///   - content: The rows, usually `ListItem`s (core `children`).
  ///   - header: Content above the rows, such as a `Heading` (core `header`).
  public init(
    density: ListDensity? = nil,
    hasDividers: Bool? = nil,
    edge: ListEdge? = nil,
    listStyle: ListListStyle? = nil,
    start: Double? = nil,
    @ViewBuilder content: () -> Content,
    @ViewBuilder header: () -> Header = { EmptyView() }
  ) {
    self.init(
      ListProps(density: density, hasDividers: hasDividers, edge: edge, listStyle: listStyle, start: start),
      content: content, header: header)
  }

  /// A list from its generated contract, for generated and wire-driven callers.
  public init(
    _ props: ListProps,
    @ViewBuilder content: () -> Content,
    @ViewBuilder header: () -> Header = { EmptyView() }
  ) {
    self.props = props
    self.content = content()
    self.header = header()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if List.namesRowsFromHeader {
        header
          .padding(.bottom, astryx.tokens.space.s2)
          .accessibilityLabeledPair(role: .label, id: List.headerPairID, in: headerPair)
      }
      rows
        .accessibilityElement(children: .contain)
        .modifier(ListRowsLabel(isLabeled: List.namesRowsFromHeader, id: List.headerPairID, namespace: headerPair))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .environment(\.astryxListContext, context)
    .environment(\.astryxListNumbers, numbers)
    .onPreferenceChange(ListRowsKey.self) { rows in
      MainActor.assumeIsolated {
        rowIDs = rows
        numbers.assign(rows, start: firstNumber)
      }
    }
    .onChange(of: firstNumber) { numbers.assign(rowIDs, start: firstNumber) }
    // A list counts only its own rows, not those of a list around it.
    .transformPreference(ListRowsKey.self) { $0 = [] }
    // The rows stay separate elements; the header is read before them.
    .accessibilityElement(children: .contain)
    .astryxBase(props.base)
  }

  /// The rows, each told its number, with a divider between rows when asked.
  @ViewBuilder private var rows: some View {
    let layout = ListRows(
      gap: gap, divider: props.hasDividers == true ? astryx.tokens.color.border : nil,
      dividerWidth: astryx.tokens.size.borderWidth)
    if #available(iOS 18, macOS 15, *) {
      Group(subviews: content) { subviews in
        layout.stack(subviews.map { AnyView($0) }, ids: subviews.map(\.id))
      }
    } else {
      _VariadicView.Tree(layout) { content }
    }
  }

  /// Whether the header names the list: whenever there is a header.
  nonisolated static var namesRowsFromHeader: Bool { Header.self != EmptyView.self }

  /// The pairing that makes the header the rows' label.
  nonisolated static var headerPairID: String { "astryx-list-header" }

  /// What the rows read from their list.
  var context: ListContext {
    ListContext(
      density: props.density.flatMap { ItemDensity(rawValue: $0.rawValue) },
      hasDividers: props.hasDividers == true,
      isFlush: props.edge == .flush,
      marker: List.marker(for: props.listStyle ?? ListListStyle.none))
  }

  /// The space between rows: `space.s0_5`, or none between dividers.
  var gap: CGFloat { props.hasDividers == true ? 0 : astryx.tokens.space.s0_5 }

  /// The number of the first row: `start`, or 1.
  var firstNumber: Int { List.firstNumber(props.start) }

  /// A first number from the contract's `start`: rounded down, 1 when it is
  /// missing or not a number, and kept within a billion either way so no
  /// value can overflow.
  nonisolated static func firstNumber(_ start: Double?) -> Int {
    guard let start, !start.isNaN else { return 1 }
    return Int(min(max(start.rounded(.down), Double(-limit)), Double(limit)))
  }

  nonisolated static var limit: Int { 1_000_000_000 }

  /// The marker each row draws for a list style.
  nonisolated static func marker(for style: ListListStyle) -> ListContext.Marker? {
    switch style {
    case .none: nil
    case .disc: .disc
    case .decimal: .decimal
    case .circle: .circle
    }
  }
}

/// Lays out a list's rows top to bottom and draws dividers between them.
/// iOS 18 and macOS 15 reach the rows through the public `Group(subviews:)`,
/// which calls `stack` directly. iOS 17 and macOS 14, which the package still
/// supports, have no public API for a container's children, so they use
/// SwiftUI's `_VariadicView`, which `Group(subviews:)` replaced; drop it when
/// the package's minimum moves to iOS 18 and macOS 15.
struct ListRows: _VariadicView_MultiViewRoot {
  /// Dividers are decoration; VoiceOver moves from row to row.
  nonisolated static var dividersAreHidden: Bool { true }

  let gap: CGFloat
  /// The divider color, or `nil` for no dividers.
  let divider: Color?
  /// The divider's thickness: the theme's `size.borderWidth`.
  let dividerWidth: CGFloat

  func body(children: _VariadicView.Children) -> some View {
    stack(children.map { AnyView($0) }, ids: children.map(\.id))
  }

  func stack<ID: Hashable>(_ rows: [AnyView], ids: [ID]) -> some View {
    VStack(alignment: .leading, spacing: gap) {
      ForEach(Array(zip(ids, rows.indices)), id: \.0) { _, index in
        rows[index]
        if let divider, index < rows.count - 1 {
          Rectangle()
            .fill(divider)
            .frame(height: dividerWidth)
            .accessibilityHidden(ListRows.dividersAreHidden)
        }
      }
    }
  }
}

/// Makes the rows' container the content the header labels.
private struct ListRowsLabel: ViewModifier {
  let isLabeled: Bool
  let id: String
  let namespace: Namespace.ID

  func body(content: Content) -> some View {
    if isLabeled {
      content.accessibilityLabeledPair(role: .content, id: id, in: namespace)
    } else {
      content
    }
  }
}
