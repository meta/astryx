// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from github.com/ejc3/astryx-swift (MIT).

/// A run of text in one of core's type styles, painted with the theme's type
/// tokens. It takes core's Text props (`TextProps`).
public struct Text: View {
  public let props: TextProps
  @Environment(\.astryx) private var astryx
  @Environment(\.multilineTextAlignment) private var inheritedAlignment

  public init(_ props: TextProps) {
    self.props = props
  }

  /// - Parameters:
  ///   - children: the words, core's `children`.
  ///   - type: core's `type`; `body` when nil. `inherit` keeps the
  ///     surrounding font and color, unless `size` is also set (below).
  ///   - size: core's `size`, replacing the type's size. With `inherit`,
  ///     SwiftUI cannot change only the size of an inherited font, so the text
  ///     draws in the theme's body family at normal weight (or at `weight`,
  ///     when set) at that size: a documented Swift gap from core, where an
  ///     inherited family and weight keep their face.
  ///   - color: core's `color`; secondary for `supporting`, primary otherwise.
  ///   - weight: core's `weight`, replacing the type's weight.
  ///   - maxLines: core's `maxLines`; text past it is truncated. Unset, a
  ///     surrounding `.lineLimit` still applies.
  ///   - justify: core's `justify`, the alignment of wrapped lines.
  ///   - hasStrikethrough: core's `hasStrikethrough`.
  ///   - hasTabularNumbers: core's `hasTabularNumbers`; digits take equal
  ///     widths.
  ///   - base: core's base props.
  public init(
    _ children: String,
    type: TextType? = nil,
    size: TextSize? = nil,
    color: TextColor? = nil,
    weight: TextWeight? = nil,
    maxLines: Double? = nil,
    justify: TextJustify? = nil,
    hasStrikethrough: Bool? = nil,
    hasTabularNumbers: Bool? = nil,
    base: AstryxBaseProps = AstryxBaseProps()
  ) {
    self.init(
      TextProps(
        type: type,
        children: children,
        size: size,
        color: color,
        weight: weight,
        maxLines: maxLines,
        justify: justify,
        hasStrikethrough: hasStrikethrough,
        hasTabularNumbers: hasTabularNumbers,
        base: base
      )
    )
  }

  public var body: some View {
    styled(SwiftUI.Text(props.children))
      .astryxMaxLines(props.maxLines)
      .multilineTextAlignment(props.justify?.alignment ?? inheritedAlignment)
      .astryxBase(props.base)
  }

  func styled(_ text: SwiftUI.Text) -> SwiftUI.Text {
    var text = text
    let font = astryx.tokens.font
    let type = props.type ?? .body
    if let style = font.style(type) {
      var style = style
      if let size = props.size { style.size = font.size.value(for: size) }
      if let weight = props.weight { style.weight = font.weight.value(named: weight.rawValue) }
      text = text.font(astryx.font(style))
    } else if let size = props.size {
      // `inherit` with a size: SwiftUI cannot change only the size of an
      // inherited font, so it draws the body family at normal weight (or the
      // given weight) at that size, a documented gap.
      let weight = font.weight.value(named: props.weight?.rawValue ?? "normal")
      text = text.font(astryx.font(TypeStyle(size: font.size.value(for: size), weight: weight, families: font.family.body)))
    } else if let weight = props.weight {
      text = text.fontWeight(astryx.fontWeight(font.weight.value(named: weight.rawValue)))
    }
    if let color = astryx.tokens.color.text(named: (props.color ?? Self.defaultColor(type)).rawValue) {
      text = text.foregroundStyle(color)
    }
    if props.hasStrikethrough == true { text = text.strikethrough() }
    if props.hasTabularNumbers == true { text = text.monospacedDigit() }
    return text
  }

  /// The color core's Text uses when none is given.
  static func defaultColor(_ type: TextType) -> TextColor {
    switch type {
    case .supporting: .secondary
    case .inherit: .inherit
    default: .primary
    }
  }
}
