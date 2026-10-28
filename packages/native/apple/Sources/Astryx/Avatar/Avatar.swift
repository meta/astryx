// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
import SwiftUI
import os

/// A person's or an entity's picture: the image at `src`, else `fallbackSrc`,
/// else initials from `name`, else a person symbol (core `Avatar`).
///
/// ```swift
/// Avatar("Ada Lovelace", src: "https://example.com/ada.jpg")
/// Avatar("Ada Lovelace", size: .lg, shape: .rounded)
/// Avatar("Ada Lovelace", href: "https://example.com/ada")
/// Avatar("Ada Lovelace") { AvatarStatusDot(variant: .success, label: "Online") }
/// Avatar("Ada Lovelace", onClick: showProfile)
/// ```
public struct Avatar<Status: View>: View {
  /// The contract the view draws, the same for both initializers.
  public let props: AvatarProps
  let status: Status
  @Environment(\.astryx) private var astryx
  @State private var statusLabel: String?

  /// An avatar from its labeled props.
  /// - Parameters:
  ///   - name: The person's or entity's name, for initials and the accessible name (core `name`).
  ///   - src: The image URL (core `src`).
  ///   - fallbackSrc: The image URL to try when `src` fails (core `fallbackSrc`).
  ///   - alt: The accessible name, when it differs from `name` (core `alt`).
  ///   - size: `xsm` 20, `sm` 24, `md` 36, `lg` 48, or `xl` 128 points; `nil` is `md` (core `size`).
  ///   - shape: `circle`, `rounded`, or `square`; `nil` is `circle` (core `shape`).
  ///   - tooltip: Words shown where there is a pointer: `nil` or `true` the name, a string those words, `false` none (core `tooltip`).
  ///   - href: A URL the system opens when the avatar is tapped; the avatar becomes a link (core `href`).
  ///   - status: An `AvatarStatusDot` in the bottom trailing corner; a single trailing closure is this (core `status`).
  ///   - onClick: Runs when the avatar is tapped; without `href` the avatar becomes a button (core `onClick`).
  public init(
    _ name: String? = nil,
    src: String? = nil,
    fallbackSrc: String? = nil,
    alt: String? = nil,
    size: AvatarSize? = nil,
    shape: AvatarShape? = nil,
    tooltip: AvatarTooltip? = nil,
    href: String? = nil,
    @ViewBuilder status: () -> Status = { EmptyView() },
    onClick: (() -> Void)? = nil
  ) {
    self.init(
      AvatarProps(
        src: src, fallbackSrc: fallbackSrc, name: name, alt: alt, size: size, shape: shape, tooltip: tooltip, href: href,
        onClick: onClick
      ),
      status: status)
  }

  /// An avatar from its generated contract, for generated and wire-driven callers.
  public init(_ props: AvatarProps, @ViewBuilder status: () -> Status = { EmptyView() }) {
    self.props = props
    self.status = status()
  }

  public var body: some View {
    if props.base.isHidden != true {
      control
        // The Astryx tooltip (library/tooltip.spec.md), as core's Avatar uses
        // core's tooltip: a static avatar is a tab stop and opens on a tap;
        // a link or button keeps its focus and its tap.
        // Touch is core's `auto`: a static avatar opens on a tap; a control's
        // tap belongs to its action.
        .astryxTooltip(tooltipText, hint: tooltipHint, focus: Avatar.tooltipFocus(tap))
        .modifier(AvatarIdentifier(id: props.base.id))
        .onAppear(perform: checkInDevelopment)
    }
  }

  /// Development checks core makes too: an `href` an app cannot open stops
  /// the build with its value, and an unnamed link or button is flagged.
  private func checkInDevelopment() {
    #if DEBUG
    if Avatar.isUnusableHref(props.href) {
      assertionFailure(
        "Avatar href \"\(props.href ?? "")\" is not an absolute URL an app can open; it draws without a link.")
    }
    // The avatar's own name: a status label alone does not name a person.
    let ownName = Avatar.meaningful(props.alt) ?? Avatar.meaningful(props.name)
    if Avatar.needsNameWarning(tap: tap, isNamed: ownName != nil) {
      Logger(subsystem: "Astryx", category: "Avatar").warning(
        "An Avatar with href or onClick has no alt or name, so VoiceOver reads it without a name.")
    }
    #endif
  }

  /// The tooltip's words: the name for `nil` or `true`, the given words, or
  /// none for `false` or blank words, as core resolves it.
  var tooltipText: String? {
    switch props.tooltip ?? .on {
    case .on: Avatar.meaningful(props.name).map(Avatar.trimmed)
    case .off: nil
    case .text(let words): Avatar.meaningful(words).map(Avatar.trimmed)
    }
  }

  /// The VoiceOver hint: given tooltip words, as core puts them in the
  /// description; the default name is the avatar's own name, not repeated.
  var tooltipHint: String? {
    guard case .text = props.tooltip else { return nil }
    return tooltipText
  }

  /// A non-empty `href` that is not an absolute URL, such as a web path.
  nonisolated static func isUnusableHref(_ href: String?) -> Bool {
    guard let href, !href.isEmpty else { return false }
    guard let url = URL(string: href) else { return true }
    return url.scheme == nil
  }

  /// The picture as a link with `href`, a button with only `onClick`, or a
  /// static image (Swift component API, A4). All three draw the same.
  @ViewBuilder private var control: some View {
    if let url = linkURL {
      SwiftUI.Link(destination: url) { picture }
        .buttonStyle(.plain)
        .modifier(AvatarRunsBeforeOpening(onClick: props.onClick))
        .modifier(AvatarTarget(side: side))
        .modifier(AvatarName(label: accessibilityLabel, tap: .link))
    } else if let onClick = props.onClick {
      SwiftUI.Button(action: onClick) { picture }
        .buttonStyle(.plain)
        .modifier(AvatarTarget(side: side))
        .modifier(AvatarName(label: accessibilityLabel, tap: .button))
    } else {
      picture
        // A static avatar whose tap opens its tooltip answers taps across
        // 44 points too.
        .modifier(AvatarTarget(side: Avatar.tapTargetSide(side, takesTaps: tooltipText != nil)))
        .modifier(AvatarName(label: accessibilityLabel, tap: .none))
    }
  }

  /// How the avatar takes a tap: a link with a usable `href`, else a button
  /// with `onClick`, else none.
  enum Tap: Equatable { case link, button, none }

  /// How far a tappable avatar's tap area reaches past its side: to 44
  /// points (Swift accessibility, X7).
  nonisolated static func tapOutset(side: CGFloat) -> CGFloat { max(0, (44 - side) / 2) }

  /// The side a static avatar's tap area grows from: its own when a tap
  /// opens its tooltip, and 44, which adds nothing, when it takes no taps.
  nonisolated static func tapTargetSide(_ side: CGFloat, takesTaps: Bool) -> CGFloat { takesTaps ? side : 44 }

  /// How keyboard focus reaches the tooltip: a static avatar is made a tab
  /// stop, as core gives it one; a link or button takes focus already.
  nonisolated static func tooltipFocus(_ tap: Tap) -> TooltipFocus { tap == .none ? .tabStop : .control }


  var tap: Tap {
    if linkURL != nil { return .link }
    if props.onClick != nil { return .button }
    return .none
  }

  /// The traits the avatar adds: a named static avatar is an image; a link or
  /// button keeps its own trait and adds none (Swift accessibility, X1).
  nonisolated static func addedTraits(tap: Tap, isNamed: Bool) -> AccessibilityTraits {
    guard isNamed else { return [] }
    switch tap {
    case .none: return .isImage
    case .link: return .isLink
    case .button: return []
    }
  }

  /// Traits a named avatar drops: a link avatar is a link, not the button
  /// SwiftUI reports for `Link`.
  nonisolated static func removedTraits(tap: Tap, isNamed: Bool) -> AccessibilityTraits {
    isNamed && tap == .link ? .isButton : []
  }

  /// A link or button avatar needs a name, as core warns in development.
  nonisolated static func needsNameWarning(tap: Tap, isNamed: Bool) -> Bool {
    tap != .none && !isNamed
  }

  /// The photo; the fallback photo only after it fails or when there is
  /// none, as core does; initials or the symbol while either loads and
  /// after both fail.
  private var picture: some View {
    AvatarImage(url: url(props.src)) {
      plate
    } failure: {
      AvatarImage(url: url(props.fallbackSrc)) { plate } failure: { plate }
    }
    .frame(width: side, height: side)
    .clipShape(AvatarShapeOutline(shape: resolvedShape, radius: cornerRadius))
    .overlay {
      // Outside the clip, so the status is never cut off. The layout places
      // it from its own size; SwiftUI mirrors the placement in right-to-left
      // layouts, so it sits on the bottom leading corner there.
      AvatarStatusPlacement(side: side, shape: resolvedShape) {
        status
          .environment(\.astryxAvatarSide, side)
          // The owner sizes what it holds (slots S4): status content never
          // grows with text faster than the avatar does.
          .dynamicTypeSize(...Avatar<EmptyView>.statusTypeSizeCap)
      }
    }
    .onPreferenceChange(AvatarStatusLabelKey.self) { label in
      statusLabel = label?.text
    }
  }

  /// How far the status content's bottom trailing corner moves out from the
  /// avatar's, sized from the content itself, as core places any status: on a
  /// circle its center sits on the edge at the bottom trailing 45° point; on a
  /// rounded or square avatar it overhangs the corner by a quarter of its size.
  nonisolated static func statusOffset(content: CGSize, side: CGFloat, shape: AvatarShape) -> CGSize {
    switch shape {
    case .circle:
      return CGSize(width: content.width / 2 - side * circleEdgeInset, height: content.height / 2 - side * circleEdgeInset)
    case .rounded, .square:
      return CGSize(width: content.width / 4, height: content.height / 4)
    }
  }

  /// Where a 45-degree line meets a circle, as a fraction of its side from
  /// the square's corner: (1 − 1/√2) / 2.
  nonisolated static var circleEdgeInset: CGFloat { (1 - 1 / 2.squareRoot()) / 2 }

  /// The fallback: initials on the neutral plate, else a person symbol.
  private var plate: some View {
    ZStack {
      astryx.tokens.color.neutral
      if let initials {
        // Drawn, not laid out as a Text view, so the initials are never an
        // accessibility element of their own; the name names the avatar.
        let font = initialsFont
        let color = astryx.tokens.color.textSecondary
        Canvas { context, size in
          let text = context.resolve(SwiftUI.Text(initials).font(font).foregroundColor(color))
          context.draw(text, at: CGPoint(x: size.width / 2, y: size.height / 2), anchor: .center)
        }
        .accessibilityHidden(true)
      } else {
        Image(systemName: "person.fill")
          .resizable()
          .scaledToFit()
          .frame(width: side * 0.6, height: side * 0.6)
          .foregroundStyle(astryx.tokens.color.textSecondary)
          .accessibilityHidden(true)
      }
    }
  }

  /// The side of the avatar in points.
  /// The side of the avatar in points: core's size grown with Dynamic Type,
  /// as the name beside it grows, up to 1.6 times so it never swallows a row.
  var side: CGFloat { Avatar.side(for: props.size ?? .md, textScale: astryx.textScale) }

  /// The most an avatar grows with Dynamic Type.
  nonisolated static var maximumTextScale: CGFloat { 1.6 }

  /// The largest text size status content grows to: the largest whose text
  /// scale stays within the avatar's own growth (`maximumTextScale`).
  nonisolated static var statusTypeSizeCap: DynamicTypeSize {
    DynamicTypeSize.allCases.last { astryxTextScale(for: $0) <= maximumTextScale } ?? .large
  }

  nonisolated static func side(for size: AvatarSize, textScale: CGFloat) -> CGFloat {
    (points(for: size) * min(max(textScale, 1), maximumTextScale)).rounded()
  }

  var resolvedShape: AvatarShape { props.shape ?? .circle }

  /// The corner radius for `rounded`, from the theme's element radius.
  private var cornerRadius: CGFloat { astryx.tokens.radius.element }

  /// Initials drawn at 40% of the side in the theme's body family, medium weight.
  private var initialsFont: Font {
    astryxFont(
      families: astryx.tokens.font.family.body,
      size: side * 0.4,
      weight: astryx.fontWeight(astryx.tokens.font.weight.medium),
      isBoldText: astryx.isBoldText
    )
  }

  /// The initials the plate shows, or `nil` for the person symbol.
  var initials: String? {
    guard let name = Avatar.meaningful(props.name) else { return nil }
    let initials = Avatar.initials(from: name)
    return initials.isEmpty ? nil : initials
  }

  /// The name VoiceOver reads: `alt`, else `name`; `nil` when neither
  /// carries anything, and then a static avatar is decorative.
  var accessibilityLabel: String? {
    Avatar.accessibleName(name: Avatar.meaningful(props.alt) ?? Avatar.meaningful(props.name), status: statusLabel)
  }

  /// The name with the status dot's label: "Ada Lovelace, Online" in the
  /// person's language; either alone when the other is absent.
  nonisolated static func accessibleName(name: String?, status: String?) -> String? {
    switch (name, status) {
    case let (name?, status?): AstryxStrings.avatarNameWithStatus(name: name, status: status)
    case let (name, status): name ?? status
    }
  }

  /// The URL the avatar opens, or `nil` when it has no usable `href`.
  var linkURL: URL? {
    // Only an absolute URL the system can open; a malformed or relative
    // `href` leaves the avatar static or a button.
    guard let url = url(props.href), url.scheme != nil else { return nil }
    return url
  }

  private func url(_ string: String?) -> URL? {
    guard let string, !string.isEmpty else { return nil }
    return URL(string: string)
  }

  /// Core's named sizes in points.
  nonisolated static func points(for size: AvatarSize) -> CGFloat {
    switch size {
    case .xsm: 20
    case .sm: 24
    case .md: 36
    case .lg: 48
    case .xl: 128
    }
  }

  /// The string when it carries something, `nil` when it is absent or blank.
  /// Words without their leading and trailing space, as core trims the
  /// tooltip it shows.
  nonisolated static func trimmed(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  nonisolated static func meaningful(_ value: String?) -> String? {
    guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    return value
  }

  /// Core's initials: the first letter, digit, or emoji of the first and last
  /// words that have one, uppercased. Leading punctuation in a word is skipped.
  nonisolated static func initials(from name: String) -> String {
    let letters = name.split(whereSeparator: { $0.isWhitespace }).compactMap { word in
      word.first(where: avatarCanStandForAWord)
    }
    guard let first = letters.first else { return "" }
    guard letters.count > 1, let last = letters.last else { return String(first).uppercased() }
    return (String(first) + String(last)).uppercased()
  }
}

/// A letter, a digit, or an emoji, as core's `\p{L}`, `\p{N}`,
/// `\p{Extended_Pictographic}`, and `\p{Regional_Indicator}`.
func avatarCanStandForAWord(_ character: Character) -> Bool {
  if character.isLetter || character.isNumber { return true }
  guard let scalar = character.unicodeScalars.first else { return false }
  // `isEmoji` also covers `#`, `*`, and the digits, which are ASCII.
  return scalar.value > 0x7F && scalar.properties.isEmoji
}

/// Draws the image at a URL: `loading` while it loads, `failure` when it
/// fails or there is no URL.
private struct AvatarImage<Loading: View, Failure: View>: View {
  let url: URL?
  @ViewBuilder let loading: () -> Loading
  @ViewBuilder let failure: () -> Failure

  var body: some View {
    if let url {
      AsyncImage(url: url) { phase in
        if let image = phase.image {
          image.resizable().scaledToFill()
        } else if phase.error != nil {
          failure()
        } else {
          loading()
        }
      }
    } else {
      failure()
    }
  }
}

/// Runs `onClick` as a link opens, then hands the URL to whatever opens URLs
/// above the avatar, so an app's own handler still applies. Without
/// `onClick` it changes nothing.
private struct AvatarRunsBeforeOpening: ViewModifier {
  let onClick: (() -> Void)?
  @Environment(\.openURL) private var inheritedOpenURL

  func body(content: Content) -> some View {
    if let onClick {
      content.environment(\.openURL, OpenURLAction { url in
        onClick()
        inheritedOpenURL(url)
        return .handled
      })
    } else {
      content
    }
  }
}

/// The outline each shape clips to: a circle, the element radius, or square.
private struct AvatarShapeOutline: Shape {
  let shape: AvatarShape
  let radius: CGFloat

  func path(in rect: CGRect) -> Path {
    switch shape {
    case .circle: Circle().path(in: rect)
    case .rounded: RoundedRectangle(cornerRadius: radius, style: .continuous).path(in: rect)
    case .square: Rectangle().path(in: rect)
    }
  }
}

/// Places the status content at the avatar's bottom trailing corner from the
/// content's own size (`Avatar.statusOffset`), in the same layout pass, so it
/// is in place from the first frame whatever it holds.
private struct AvatarStatusPlacement: Layout {
  let side: CGFloat
  let shape: AvatarShape

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    proposal.replacingUnspecifiedDimensions(by: CGSize(width: side, height: side))
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      let offset = Avatar<EmptyView>.statusOffset(content: size, side: side, shape: shape)
      let origin = CGPoint(x: bounds.maxX - size.width + offset.width, y: bounds.maxY - size.height + offset.height)
      subview.place(at: origin, anchor: .topLeading, proposal: ProposedViewSize(size))
    }
  }
}

/// One element named by the avatar's label. A static avatar without a label
/// is hidden; an interactive one keeps its link or button trait.
private struct AvatarName: ViewModifier {
  let label: String?
  let tap: Avatar<EmptyView>.Tap

  func body(content: Content) -> some View {
    let isNamed = label != nil
    let added = Avatar<EmptyView>.addedTraits(tap: tap, isNamed: isNamed)
    let removed = Avatar<EmptyView>.removedTraits(tap: tap, isNamed: isNamed)
    if let label {
      if tap == .none {
        // One image element named by the name.
        content.accessibilityElement(children: .ignore).accessibilityLabel(label)
          .accessibilityAddTraits(added)
      } else {
        // The link or button itself carries the name, so VoiceOver reads
        // "Grace Hopper, button", not the initials inside it.
        content.accessibilityLabel(label).accessibilityAddTraits(added).accessibilityRemoveTraits(removed)
      }
    } else if tap != .none {
      content
    } else {
      content.accessibilityHidden(true)
    }
  }
}

/// A tappable avatar answers taps across at least 44 by 44 points without
/// changing its drawn size or its layout (Swift accessibility, X7).
private struct AvatarTarget: ViewModifier {
  let side: CGFloat

  func body(content: Content) -> some View {
    content.contentShape(.interaction, Rectangle().inset(by: -Avatar<EmptyView>.tapOutset(side: side)))
  }
}

/// The base `id` becomes the accessibility identifier (AST-082 FR7).
private struct AvatarIdentifier: ViewModifier {
  let id: String?

  func body(content: Content) -> some View {
    if let id {
      content.accessibilityIdentifier(id)
    } else {
      content
    }
  }
}
