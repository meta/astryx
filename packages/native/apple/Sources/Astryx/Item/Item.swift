// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
import SwiftUI

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// A row: optional marker and leading content, a label with an optional
/// description, and optional trailing content (core `Item`). With `onClick`
/// it is a button and with `href` a link; either way it draws the same row.
///
/// ```swift
/// Item("Ada Lovelace", description: "Mathematician") {
///   Icon(.check)
/// } endContent: {
///   Icon(.chevronRight, color: .secondary)
/// }
/// Item("Notifications", onClick: openNotifications)
/// Item("Archive") { Icon(.upload) } onClick: { archive() }
/// ```
public struct Item<Marker: View, StartContent: View, EndContent: View>: View {
  /// The contract the view draws, the same for every initializer.
  public let props: ItemProps
  let marker: Marker
  let startContent: StartContent
  let endContent: EndContent
  @Environment(\.astryx) private var astryx
  @Environment(\.astryxItemListTreatment) private var listTreatment
  @State private var wordsHeight: CGFloat = 0

  /// A row from its labeled props. A single trailing closure is the start
  /// content; set `onClick` by label or as a trailing `onClick:` closure.
  /// - Parameters:
  ///   - label: The row's main words (core `label`).
  ///   - description: Supporting words under or beside the label (core `description`).
  ///   - align: How the start and end content line up with the words: `center`, `start`, or `firstLine`; `nil` is `center` (core `align`).
  ///   - density: `compact`, `balanced`, or `spacious` padding; `nil` is `balanced` (core `density`).
  ///   - labelLines: Lines the label may take before it truncates; `nil` is one (core `labelLines`).
  ///   - descriptionLines: Lines the description may take before it truncates; `nil` is one (core `descriptionLines`).
  ///   - layout: `stacked` puts the description under the label, `inline` beside it; `nil` is `stacked` (core `layout`).
  ///   - href: A URL the system opens when the row is tapped; the row becomes a link and `onClick` does not run (core `href`).
  ///   - isHighlighted: Draws the row's highlighted background (core `isHighlighted`).
  ///   - isSelected: Draws the row as selected and reads it as selected (core `isSelected`).
  ///   - isDisabled: Dims the row; a button or link row stays reachable and does nothing (core `isDisabled`).
  ///   - startContent: Content before the words: an `Icon`, an `Avatar`, or a checkbox (core `startContent`).
  ///   - endContent: Content after the words, such as a badge, a value, or an icon (core `endContent`).
  ///   - marker: A list marker before the start content; pass every slot by label when you set it (core `marker`).
  ///   - onClick: Runs when the row is tapped; the row becomes a button when it has no `href` (core `onClick`).
  public init(
    _ label: String,
    description: String? = nil,
    align: ItemAlign? = nil,
    density: ItemDensity? = nil,
    labelLines: Double? = nil,
    descriptionLines: Double? = nil,
    layout: ItemLayout? = nil,
    href: String? = nil,
    isHighlighted: Bool? = nil,
    isSelected: Bool? = nil,
    isDisabled: Bool? = nil,
    @ViewBuilder startContent: () -> StartContent = { EmptyView() },
    @ViewBuilder endContent: () -> EndContent = { EmptyView() },
    @ViewBuilder marker: () -> Marker = { EmptyView() },
    onClick: (() -> Void)? = nil
  ) {
    self.init(
      ItemProps(
        label: label, description: description, align: align, density: density, labelLines: labelLines,
        descriptionLines: descriptionLines, layout: layout, onClick: onClick, href: href,
        isHighlighted: isHighlighted, isSelected: isSelected, isDisabled: isDisabled
      ),
      startContent: startContent, endContent: endContent, marker: marker
    )
  }

  /// A row from its generated contract, for generated and wire-driven callers.
  public init(
    _ props: ItemProps,
    @ViewBuilder startContent: () -> StartContent = { EmptyView() },
    @ViewBuilder endContent: () -> EndContent = { EmptyView() },
    @ViewBuilder marker: () -> Marker = { EmptyView() }
  ) {
    self.props = props
    self.marker = marker()
    self.startContent = startContent()
    self.endContent = endContent()
  }

  public var body: some View {
    control
      .onAppear(perform: checkInDevelopment)
      .astryxBase(props.base)
  }

  /// An `href` an app cannot open, such as a web path, stops a development
  /// build with its value; a release build draws the row without a link.
  private func checkInDevelopment() {
    astryxCheckHref(props.href.map(astryxNormalizedHref), in: "Item")
  }

  /// A non-empty `href` that is not an absolute URL, read as the row's link
  /// reads it (trimmed, control characters removed).
  nonisolated static func isUnusableHref(_ href: String?) -> Bool {
    astryxIsUnusableHref(href.map(astryxNormalizedHref))
  }

  /// The row as a link with `href`, a button with only `onClick`, or static
  /// (Swift component API, A4). All three draw the same row.
  @ViewBuilder private var control: some View {
    if let url = linkURL {
      SwiftUI.Link(destination: url) { row(minHeight: Item.minimumTarget, paintsFill: false) }
        .buttonStyle(pressStyle)
        .disabled(isDisabled)
        .modifier(ItemAccessibility(isSelected: isSelected))
    } else if let onClick = props.onClick {
      SwiftUI.Button(action: onClick) { row(minHeight: Item.minimumTarget, paintsFill: false) }
        .buttonStyle(pressStyle)
        .disabled(isDisabled)
        .modifier(ItemAccessibility(isSelected: isSelected))
    } else {
      row(minHeight: nil, paintsFill: true)
        .accessibilityElement(children: .combine)
        // A disabled row reads as dimmed, as core marks it aria-disabled.
        .disabled(isDisabled)
        .modifier(ItemAccessibility(isSelected: isSelected))
    }
  }

  /// A link or button row's fill and its press, painted by the button style
  /// so the press sits above a selected or highlighted fill, as core's does.
  private var pressStyle: ItemPressStyle {
    ItemPressStyle(radius: cornerRadius, fill: background, pressed: astryx.tokens.color.overlayPressed)
  }

  /// The row's drawing; a tappable row is at least `minHeight` tall. A static
  /// row paints its own fill; a link or button row's style paints it.
  private func row(minHeight: CGFloat?, paintsFill: Bool) -> some View {
    HStack(alignment: rowAlignment, spacing: astryx.tokens.space.s2) {
      markerSlot
      // A list's treatment is for this row only, not for rows nested in its slots.
      slot(startContent.modifier(ItemSlotOutsideList()))
      // A disabled row dims its words and end content, as core does; the
      // marker and start content keep their own look (a checkbox shows its
      // own disabled state).
      words
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(ItemWordsHeight(isMeasured: measuresWords, height: $wordsHeight))
        .opacity(isDisabled ? 0.5 : 1)
      slot(endContent.modifier(ItemSlotOutsideList()))
        .opacity(isDisabled ? 0.5 : 1)
    }
    .padding(.horizontal, inlinePadding)
    .padding(.vertical, blockPadding)
    .frame(maxWidth: .infinity, minHeight: minHeight, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        .fill(paintsFill ? background ?? .clear : .clear)
    )
    .contentShape(Rectangle())
  }

  /// A slot's content. For `firstLine`, its center sits on the center of
  /// the label's first line box, however tall the slot is.
  @ViewBuilder private func slot<Content: View>(_ content: Content) -> some View {
    if resolvedAlign == .firstLine {
      let lineCenterAboveBaseline = firstLineCenterAboveBaseline
      content.alignmentGuide(.firstTextBaseline) { d in d.height / 2 + lineCenterAboveBaseline }
    } else {
      content
    }
  }

  /// The marker. Inside a list it centers on the label's first line,
  /// whatever the row's alignment, as core's list markers do.
  @ViewBuilder private var markerSlot: some View {
    if listTreatment?.markerOnFirstLine == true {
      let center = firstLineBoxHeight / 2
      switch resolvedAlign {
      case .firstLine:
        slot(marker)
      case .start:
        marker.alignmentGuide(.top) { d in d.height / 2 - center }
      case .center:
        let words = wordsHeight
        marker.alignmentGuide(VerticalAlignment.center) { d in words / 2 - center + d.height / 2 }
      }
    } else {
      slot(marker)
    }
  }

  /// Whether the row measures its words: only a centre-aligned row in a list
  /// with markers, which places its marker from the words' height.
  private var measuresWords: Bool {
    listTreatment?.markerOnFirstLine == true && resolvedAlign == .center
  }

  /// The height of the label's first line box: the theme's leading at the
  /// current text size.
  private var firstLineBoxHeight: CGFloat {
    astryx.tokens.font.body.leading * astryx.tokens.font.body.size * astryx.textScale
  }

  /// The row's corner radius: the theme's element radius, or square inside a
  /// list with dividers.
  private var cornerRadius: CGFloat {
    listTreatment?.squareCorners == true ? 0 : astryx.tokens.radius.element
  }

  @ViewBuilder private var words: some View {
    let label = SwiftUI.Text(props.label)
      .font(astryx.font(size: "text-body-size", 14, weight: "text-body-weight"))
      .foregroundStyle(astryx.tokens.color.textPrimary)
      .lineLimit(Item.lines(props.labelLines))
      .modifier(ItemLeading(extra: extraLeading(astryx.tokens.font.body.leading, size: astryx.tokens.font.body.size)))
    let description = props.description.map { words in
      SwiftUI.Text(words)
        .font(astryx.font(size: "text-supporting-size", 12, weight: "text-supporting-weight"))
        .foregroundStyle(astryx.tokens.color.textSecondary)
        .lineLimit(Item.lines(props.descriptionLines))
        .modifier(
          ItemLeading(extra: extraLeading(astryx.tokens.font.supporting.leading, size: astryx.tokens.font.supporting.size)))
    }
    // Inline only with a description, as core's: a label alone keeps its
    // width limit and truncates.
    if (props.layout ?? .stacked) == .inline, description != nil {
      HStack(alignment: .firstTextBaseline, spacing: astryx.tokens.space.s1) {
        label.fixedSize(horizontal: true, vertical: false)
        description
      }
    } else {
      VStack(alignment: .leading, spacing: 0) {
        label
        description
      }
    }
  }

  var resolvedAlign: ItemAlign { props.align ?? .center }

  private var rowAlignment: VerticalAlignment {
    switch resolvedAlign {
    case .center: .center
    case .start: .top
    case .firstLine: .firstTextBaseline
    }
  }

  /// How far the center of the label's first line sits above its baseline:
  /// half the font's line height above the line's bottom, less the descent,
  /// in the font's own metrics at the current text size. The theme's extra
  /// leading is split evenly above and below, so it does not move the center.
  var firstLineCenterAboveBaseline: CGFloat {
    let metrics = astryxSystemFontMetrics(astryx.tokens.font.body.size)
    return (metrics.ascender - metrics.lineHeight / 2) * astryx.textScale
  }

  var isDisabled: Bool { props.isDisabled == true }
  var isSelected: Bool { props.isSelected == true }

  /// Selected wins over highlighted, as core's styles order them.
  var background: Color? {
    if isSelected { return astryx.tokens.color.accentMuted }
    if props.isHighlighted == true { return astryx.tokens.color.overlayHover }
    return nil
  }

  /// Block padding per density: spacing 1, 2, or 3.
  var blockPadding: CGFloat {
    switch props.density ?? .balanced {
    case .compact: astryx.tokens.space.s1
    case .balanced: astryx.tokens.space.s2
    case .spacious: astryx.tokens.space.s3
    }
  }

  /// Inline padding: the list's own inset when a list sets one, else core's
  /// for the density.
  var inlinePadding: CGFloat {
    listTreatment?.inlineInset ?? Item.inlinePadding(density: props.density, tokens: astryx.tokens)
  }

  /// Core's inline padding for a density: spacing 2, or 3 when spacious.
  static func inlinePadding(density: ItemDensity?, tokens: Tokens) -> CGFloat {
    (density ?? .balanced) == .spacious ? tokens.space.s3 : tokens.space.s2
  }

  /// The space core's line height adds to the font's own line, grown with
  /// Dynamic Type, so a line takes the theme's leading as on the web. The
  /// leading tokens are unitless line heights, as in CSS.
  private func extraLeading(_ leading: CGFloat, size: CGFloat) -> CGFloat {
    max(0, leading * size - astryxSystemLineHeight(size)) * astryx.textScale
  }

  /// The URL the row opens, or `nil` when it has no usable `href`.
  var linkURL: URL? {
    // Only an absolute URL the system can open, and never one core's
    // navigation destinations refuse (a script URL or an HTML `data:` URL);
    // a malformed, relative, or refused `href` leaves the row static or a
    // button.
    guard let href = props.href, let safe = astryxSafeDestination(href), !safe.isEmpty,
      let url = URL(string: safe), url.scheme != nil
    else { return nil }
    return url
  }

  /// How the row takes a tap: a link with a usable `href`, else a button
  /// with `onClick`, else none.
  enum Tap: Equatable { case link, button, none }

  var tap: Tap {
    if linkURL != nil { return .link }
    if props.onClick != nil { return .button }
    return .none
  }

  /// The traits the row adds to what its control already carries: selected
  /// when selected. A link or button keeps its own trait (X1).
  nonisolated static func addedTraits(isSelected: Bool) -> AccessibilityTraits {
    isSelected ? .isSelected : []
  }

  /// A tappable row is at least 44 points tall (Swift accessibility, X7).
  static var minimumTarget: CGFloat { 44 }

  /// The line limit for `labelLines` or `descriptionLines`: one when unset,
  /// as core's row truncates a label to one line by default, and otherwise
  /// core's shared count (`astryxLineLimit`), so zero shows every line.
  nonisolated static func lines(_ value: Double?) -> Int? { astryxLineLimit(value ?? 1) }
}

/// Paints a link or button row's fill and, while pressed, the pressed
/// overlay above it, as core's interactive rows do.
struct ItemPressStyle: ButtonStyle {
  let radius: CGFloat
  /// The selected or highlighted fill, if any.
  let fill: Color?
  let pressed: Color

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(ItemPressBackground(radius: radius, fill: fill, pressed: pressed, isPressed: configuration.isPressed))
  }
}

/// The fill with the press above it.
struct ItemPressBackground: View {
  let radius: CGFloat
  let fill: Color?
  let pressed: Color
  let isPressed: Bool

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
    ZStack {
      shape.fill(fill ?? .clear)
      shape.fill(isPressed ? pressed : .clear)
    }
  }
}

/// Spreads the extra leading between lines and half above and below, as a
/// CSS line height does.
private struct ItemLeading: ViewModifier {
  let extra: CGFloat

  func body(content: Content) -> some View {
    content.lineSpacing(extra).padding(.vertical, extra / 2)
  }
}

/// The system font's own line height at a size.
func astryxSystemLineHeight(_ size: CGFloat) -> CGFloat {
  astryxSystemFontMetrics(size).lineHeight
}

/// The system font's ascender and line height at a size.
func astryxSystemFontMetrics(_ size: CGFloat) -> (ascender: CGFloat, lineHeight: CGFloat) {
  #if canImport(UIKit)
  let font = UIFont.systemFont(ofSize: size)
  return (font.ascender, font.lineHeight)
  #elseif canImport(AppKit)
  let font = NSFont.systemFont(ofSize: size)
  return (font.ascender, font.ascender - font.descender + font.leading)
  #else
  return (size * 0.95, size * 1.2)
  #endif
}

/// A selected row reads as selected (Swift accessibility, X1).
private struct ItemAccessibility: ViewModifier {
  let isSelected: Bool

  func body(content: Content) -> some View {
    content.accessibilityAddTraits(Item<EmptyView, EmptyView, EmptyView>.addedTraits(isSelected: isSelected))
  }
}

/// Measures the words' height only when the row needs it.
private struct ItemWordsHeight: ViewModifier {
  let isMeasured: Bool
  @Binding var height: CGFloat

  func body(content: Content) -> some View {
    if isMeasured {
      content.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
    } else {
      content
    }
  }
}

/// A row's slots sit outside its list: a row nested in a slot takes neither
/// the list's treatment, its look, nor a number from it.
private struct ItemSlotOutsideList: ViewModifier {
  func body(content: Content) -> some View {
    content
      .environment(\.astryxItemListTreatment, nil)
      .environment(\.astryxListContext, nil)
      .environment(\.astryxListNumbers, nil)
  }
}

/// How a list draws the rows it holds: the marker on the first line, its own
/// inline inset (zero for a flush list), and square corners between dividers.
struct ItemListTreatment: Equatable {
  var markerOnFirstLine: Bool
  var inlineInset: CGFloat?
  var squareCorners: Bool
}

private struct ItemListTreatmentKey: EnvironmentKey {
  static let defaultValue: ItemListTreatment? = nil
}

extension EnvironmentValues {
  /// Set by `ListItem` on the `Item` it draws; `nil` for an `Item` alone.
  var astryxItemListTreatment: ItemListTreatment? {
    get { self[ItemListTreatmentKey.self] }
    set { self[ItemListTreatmentKey.self] = newValue }
  }
}
