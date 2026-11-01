// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
import SwiftUI

/// A row of a `List` (core `ListItem`): an `Item` that takes its density,
/// marker, dividers, and edge from the list that holds it. Outside a list it
/// draws as a plain `Item`.
///
/// ```swift
/// ListItem("Preheat the oven", description: "To 180 degrees")
/// ListItem("Wi-Fi", description: "Home") {
///   Icon(.check)
/// } onClick: { openWiFi() }
/// ```
public struct ListItem<StartContent: View, EndContent: View>: View {
  /// The contract the view draws, the same for both initializers.
  public let props: ListItemProps
  let startContent: StartContent
  let endContent: EndContent
  @Environment(\.astryx) private var astryx
  @Environment(\.astryxListContext) private var list
  @Environment(\.astryxListNumbers) private var numbers
  /// This row's identity among its list's rows, for its number.
  @State private var rowID = UUID()

  /// A list row from its labeled props. A single trailing closure is the start
  /// content; set `onClick` by label or as a trailing `onClick:` closure.
  /// - Parameters:
  ///   - label: The row's main words (core `label`).
  ///   - description: Supporting words under the label (core `description`).
  ///   - align: How the start and end content line up with the words; `nil` is `center` (core `align`).
  ///   - href: A URL the system opens when the row is tapped; the row becomes a link (core `href`).
  ///   - isDisabled: Dims the row; a button or link row stays reachable and does nothing (core `isDisabled`).
  ///   - isSelected: Draws the row as selected and reads it as selected (core `isSelected`).
  ///   - startContent: Content before the words, such as an `Icon` or an `Avatar` (core `startContent`).
  ///   - endContent: Content after the words (core `endContent`).
  ///   - onClick: Runs when the row is tapped; the row becomes a button when it has no `href` (core `onClick`).
  public init(
    _ label: String,
    description: String? = nil,
    align: ListItemAlign? = nil,
    href: String? = nil,
    isDisabled: Bool? = nil,
    isSelected: Bool? = nil,
    @ViewBuilder startContent: () -> StartContent = { EmptyView() },
    @ViewBuilder endContent: () -> EndContent = { EmptyView() },
    onClick: (() -> Void)? = nil
  ) {
    self.init(
      ListItemProps(
        label: label, description: description, onClick: onClick, href: href, align: align,
        isDisabled: isDisabled, isSelected: isSelected),
      startContent: startContent, endContent: endContent)
  }

  /// A list row from its generated contract, for generated and wire-driven callers.
  public init(
    _ props: ListItemProps,
    @ViewBuilder startContent: () -> StartContent = { EmptyView() },
    @ViewBuilder endContent: () -> EndContent = { EmptyView() }
  ) {
    self.props = props
    self.startContent = startContent()
    self.endContent = endContent()
  }

  public var body: some View {
    Item(itemProps, startContent: { startContent }, endContent: { endContent }, marker: { marker })
      .environment(\.astryxItemListTreatment, treatment)
      // A row in a list announces itself so the list can number its rows in
      // order, as core's CSS counter counts list items.
      .preference(key: ListRowsKey.self, value: list == nil ? [] : [rowID])
  }

  /// The `Item` this row draws: its own props, with the list's density.
  var itemProps: ItemProps {
    ItemProps(
      label: props.label, description: props.description,
      align: props.align.flatMap { ItemAlign(rawValue: $0.rawValue) },
      density: list?.density, onClick: props.onClick, href: props.href, isSelected: props.isSelected,
      isDisabled: props.isDisabled, base: props.base)
  }

  /// How the list draws this row: the marker on the first line, no inline
  /// inset in a flush list, and square corners between dividers.
  var treatment: ItemListTreatment? {
    guard let list else { return nil }
    return ItemListTreatment(
      markerOnFirstLine: list.marker != nil,
      inlineInset: list.isFlush ? 0 : nil,
      squareCorners: list.hasDividers)
  }

  /// The list's marker for this row: a dot, a ring, or its number.
  @ViewBuilder var marker: some View {
    switch list?.marker {
    case .disc:
      Circle()
        .fill(astryx.tokens.color.textPrimary)
        .frame(width: ListItem.markerDot, height: ListItem.markerDot)
        .frame(width: ListItem.markerColumn(astryx))
        .accessibilityHidden(!ListItem.markerIsRead(.disc))
    case .circle:
      Circle()
        .strokeBorder(astryx.tokens.color.textPrimary, lineWidth: 1)
        .frame(width: ListItem.markerDot, height: ListItem.markerDot)
        .frame(width: ListItem.markerColumn(astryx))
        .accessibilityHidden(!ListItem.markerIsRead(.circle))
    case .decimal:
      ListMarkerNumber(
        text: ListItem.number(ordinal: numbers?.number(for: rowID) ?? 1), row: rowID, numbers: numbers,
        inset: rowInset)
    case nil:
      EmptyView()
    }
  }

  /// The row's inline inset, which a wide number may reach into: none in a
  /// flush list, else core's padding for the list's density.
  var rowInset: CGFloat {
    guard let list else { return 0 }
    return list.isFlush ? 0 : Item<EmptyView, EmptyView, EmptyView>.inlinePadding(density: list.density, tokens: astryx.tokens)
  }

  /// Whether VoiceOver reads a marker: a number is read as part of the row;
  /// a dot or ring is decoration and hidden.
  nonisolated static func markerIsRead(_ marker: ListContext.Marker) -> Bool { marker == .decimal }

  /// The marker column: core's `space.s4`, grown with Dynamic Type as the
  /// number in it grows, and the same width on every row.
  static func markerColumn(_ astryx: AstryxStyle) -> CGFloat {
    (astryx.tokens.space.s4 * max(astryx.textScale, 1)).rounded()
  }

  /// A number marker's column: the marker column, or wider when the list's
  /// widest number does not fit it and the row's inline inset together, so
  /// every row of the list widens alike and no number moves its own row's
  /// words (core's numbered markers; `spec:AST-061` FR11).
  nonisolated static func numberColumn(base: CGFloat, widest: CGFloat, inset: CGFloat) -> CGFloat {
    max(base, widest - inset)
  }

  /// Core's marker dot: 6 points.
  nonisolated static var markerDot: CGFloat { 6 }

  /// A decimal marker's words: the row's number and a period, as core's
  /// `counter(…) "."`.
  nonisolated static func number(ordinal: Int) -> String { "\(ordinal)." }
}

/// A decimal marker: the number and its period in the body type with tabular
/// figures, ending at the column's end so every period in the list lines up,
/// as core's numbered markers do. A number wider than the column reaches into
/// the row's inline inset; past that, the list's shared column widens.
struct ListMarkerNumber: View {
  let text: String
  var row: UUID? = nil
  var numbers: ListNumbers? = nil
  var inset: CGFloat = 0
  @Environment(\.astryx) private var astryx
  @State private var natural: CGFloat = 0

  var body: some View {
    let column = ListItem<EmptyView, EmptyView>.numberColumn(
      base: ListItem<EmptyView, EmptyView>.markerColumn(astryx), widest: numbers?.widest ?? natural, inset: inset)
    SwiftUI.Text(text)
      .font(astryx.font(size: "text-body-size", 14, weight: "text-body-weight"))
      .monospacedDigit()
      .foregroundStyle(astryx.tokens.color.textPrimary)
      .fixedSize()
      .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
        natural = width
        if let row { numbers?.report(row, width: width) }
      }
      .frame(width: column, alignment: .trailing)
  }
}

/// The list a `ListItem` sits in, as `List` describes it to its rows.
struct ListContext: Equatable {
  /// The kind of marker each row draws.
  enum Marker: Equatable { case disc, circle, decimal }

  var density: ItemDensity?
  var hasDividers: Bool
  var isFlush: Bool
  var marker: Marker?
}

private struct ListContextKey: EnvironmentKey {
  static let defaultValue: ListContext? = nil
}

/// The numbers a list gives its rows, by row, in the order the rows appear.
@MainActor @Observable
final class ListNumbers {
  private(set) var numbers: [UUID: Int] = [:]

  nonisolated init() {}

  /// The widest number any row of the list draws, for the shared column.
  private(set) var widest: CGFloat = 0
  private var widths: [UUID: CGFloat] = [:]

  /// Numbers the rows in order, the first one `start`, and forgets the widths
  /// of rows that left the list.
  func assign(_ rows: [UUID], start: Int) {
    let numbered = Dictionary(rows.enumerated().map { ($0.element, start + $0.offset) }, uniquingKeysWith: { first, _ in first })
    if numbered != numbers { numbers = numbered }
    let kept = widths.filter { numbered[$0.key] != nil }
    if kept.count != widths.count {
      widths = kept
      updateWidest()
    }
  }

  /// Records the width a row's number draws at.
  func report(_ row: UUID, width: CGFloat) {
    guard widths[row] != width else { return }
    widths[row] = width
    updateWidest()
  }

  private func updateWidest() {
    let next = widths.values.max() ?? 0
    if next != widest { widest = next }
  }

  func number(for row: UUID) -> Int? { numbers[row] }
}

/// The rows of a list, in order: each `ListItem` adds its own identity.
struct ListRowsKey: PreferenceKey {
  static let defaultValue: [UUID] = []
  static func reduce(value: inout [UUID], nextValue: () -> [UUID]) { value.append(contentsOf: nextValue()) }
}

private struct ListNumbersKey: EnvironmentKey {
  static let defaultValue: ListNumbers? = nil
}

extension EnvironmentValues {
  /// The list around a row; `nil` outside a list.
  var astryxListContext: ListContext? {
    get { self[ListContextKey.self] }
    set { self[ListContextKey.self] = newValue }
  }

  /// The numbers of the rows of the list around a row.
  var astryxListNumbers: ListNumbers? {
    get { self[ListNumbersKey.self] }
    set { self[ListNumbersKey.self] = newValue }
  }
}
