// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from github.com/ejc3/astryx-swift (MIT).

/// A heading at levels 1 through 6, painted with the theme's heading tokens
/// and exposed to VoiceOver as a heading. It takes core's Heading props
/// (`HeadingProps`).
public struct Heading: View {
  public let props: HeadingProps
  @Environment(\.astryx) private var astryx
  @Environment(\.multilineTextAlignment) private var inheritedAlignment

  public init(_ props: HeadingProps) {
    self.props = props
  }

  /// - Parameters:
  ///   - children: the words, core's `children`.
  ///   - level: core's `level`: the heading's place in the outline, which
  ///     also sets its look unless `type` is given.
  ///   - type: core's `type`, a display style that replaces the level's look.
  ///   - weight: core's `weight`, replacing the look's weight.
  ///   - accessibilityLevel: core's `accessibilityLevel`, the level VoiceOver
  ///     reads when it differs from `level`.
  ///   - color: core's `color`; primary when nil.
  ///   - maxLines: core's `maxLines`; text past it is truncated. Unset, a
  ///     surrounding `.lineLimit` still applies.
  ///   - justify: core's `justify`, the alignment of wrapped lines.
  ///   - hasStrikethrough: core's `hasStrikethrough`.
  ///   - base: core's base props.
  public init(
    _ children: String,
    level: HeadingLevel,
    type: HeadingType? = nil,
    weight: HeadingWeight? = nil,
    accessibilityLevel: HeadingAccessibilityLevel? = nil,
    color: HeadingColor? = nil,
    maxLines: Double? = nil,
    justify: HeadingJustify? = nil,
    hasStrikethrough: Bool? = nil,
    base: AstryxBaseProps = AstryxBaseProps()
  ) {
    self.init(
      HeadingProps(
        level: level,
        type: type,
        weight: weight,
        children: children,
        accessibilityLevel: accessibilityLevel,
        color: color,
        maxLines: maxLines,
        justify: justify,
        hasStrikethrough: hasStrikethrough,
        base: base
      )
    )
  }

  public var body: some View {
    styled(SwiftUI.Text(props.children))
      .astryxMaxLines(props.maxLines)
      .multilineTextAlignment(props.justify?.alignment ?? inheritedAlignment)
      .astryxJustified(props.justify?.frameAlignment)
      .accessibilityAddTraits(Self.accessibilityTraits)
      .accessibilityHeading(headingLevel)
      .astryxBase(props.base)
  }

  func styled(_ text: SwiftUI.Text) -> SwiftUI.Text {
    var style = typeStyle
    if let weight = props.weight {
      style.weight = astryx.tokens.font.weight.value(named: weight.rawValue)
    }
    var text = text.font(astryx.font(style))
    if let color = astryx.tokens.color.text(named: (props.color ?? .primary).rawValue) {
      text = text.foregroundStyle(color)
    }
    if props.hasStrikethrough == true { text = text.strikethrough() }
    return text
  }

  /// The level's heading style, or the display style `type` names, in the
  /// theme's heading family.
  var typeStyle: TypeStyle {
    let font = astryx.tokens.font
    let style: TypeStyleTokens =
      switch props.type {
      case .display1: font.display1
      case .display2: font.display2
      case .display3: font.display3
      case nil:
        switch props.level {
        case .v1: font.heading1
        case .v2: font.heading2
        case .v3: font.heading3
        case .v4: font.heading4
        case .v5: font.heading5
        case .v6: font.heading6
        }
      }
    return TypeStyle(style, families: font.family.heading)
  }

  /// The traits assistive technology gets: a header.
  static var accessibilityTraits: AccessibilityTraits { .isHeader }

  /// The level VoiceOver reads: `accessibilityLevel` when given, else `level`.
  var headingLevel: AccessibilityHeadingLevel {
    switch props.accessibilityLevel?.rawValue ?? props.level.rawValue {
    case 1: .h1
    case 2: .h2
    case 3: .h3
    case 4: .h4
    case 5: .h5
    default: .h6
    }
  }
}
