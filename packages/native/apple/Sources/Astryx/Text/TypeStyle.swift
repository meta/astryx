// Copyright (c) Meta Platforms, Inc. and affiliates.

/// One of core's type styles, read from the theme's typed tokens: a size and
/// weight in core's units, and the family stack to draw it in.
struct TypeStyle: Equatable {
  var size: CGFloat
  var weight: CGFloat
  var families: [String]
}

extension TypeStyle {
  /// A theme type style drawn in a family stack.
  init(_ tokens: TypeStyleTokens, families: [String]) {
    self.init(size: tokens.size, weight: tokens.weight, families: families)
  }
}

extension FontTokens {
  /// The style core's Text draws for a type, or nil for `inherit`. Display
  /// types draw in the heading family, as core's type scale sets them.
  func style(_ type: TextType) -> TypeStyle? {
    switch type {
    case .body: TypeStyle(body, families: family.body)
    case .large: TypeStyle(large, families: family.body)
    case .label: TypeStyle(label, families: family.body)
    case .supporting: TypeStyle(supporting, families: family.body)
    case .code: TypeStyle(code, families: family.code)
    case .display1: TypeStyle(display1, families: family.heading)
    case .display2: TypeStyle(display2, families: family.heading)
    case .display3: TypeStyle(display3, families: family.heading)
    case .inherit: nil
    }
  }
}

extension FontSizeTokens {
  /// The font size core's Text draws for an explicit `size`. Core spells the
  /// extra-small size `xsm`; its token is `font-size-xs`.
  func value(for size: TextSize) -> CGFloat {
    switch size {
    case .v4xs: s4xs
    case .v3xs: s3xs
    case .v2xs: s2xs
    case .xsm: xs
    case .sm: sm
    case .base: base
    case .lg: lg
    case .xl: xl
    case .v2xl: s2xl
    case .v3xl: s3xl
    case .v4xl: s4xl
    }
  }
}

extension FontWeightTokens {
  /// The numeric weight behind one of core's weight names.
  func value(named name: String) -> CGFloat {
    switch name {
    case "medium": medium
    case "semibold": semibold
    case "bold": bold
    default: normal
    }
  }
}

extension ColorTokens {
  /// The text color behind one of core's Text and Heading color names, or nil
  /// for `inherit`. Core draws `placeholder` in the secondary text color.
  func text(named name: String) -> Color? {
    switch name {
    case "secondary", "placeholder": textSecondary
    case "disabled": textDisabled
    case "accent": textAccent
    case "inherit": nil
    default: textPrimary
    }
  }
}

extension AstryxStyle {
  /// A type style at the person's text size, in the first family the device
  /// has, stepped heavier under Bold Text for a custom face.
  func font(_ style: TypeStyle) -> Font {
    astryxFont(
      families: style.families,
      size: style.size * textScale,
      weight: fontWeight(style.weight),
      isBoldText: isBoldText
    )
  }
}

extension TextJustify {
  var alignment: TextAlignment {
    switch self {
    case .start: .leading
    case .center: .center
    case .end: .trailing
    }
  }
}

extension HeadingJustify {
  var alignment: TextAlignment {
    switch self {
    case .start: .leading
    case .center: .center
    case .end: .trailing
    }
  }

  /// Where a heading's line sits in its container: core's heading is a block,
  /// so `justify` aligns even a single line across the full width.
  var frameAlignment: Alignment {
    switch self {
    case .start: .leading
    case .center: .center
    case .end: .trailing
    }
  }
}

extension View {
  /// Core's `maxLines` as a line limit, only when set: with it unset, a
  /// caller's own `.lineLimit` around the view still applies.
  @ViewBuilder func astryxMaxLines(_ maxLines: Double?) -> some View {
    if let limit = astryxLineLimit(maxLines) { lineLimit(limit) } else { self }
  }

  /// Spans the offered width and places the content at `alignment`, when set.
  @ViewBuilder func astryxJustified(_ alignment: Alignment?) -> some View {
    if let alignment { frame(maxWidth: .infinity, alignment: alignment) } else { self }
  }
}

/// Core's `maxLines`: a positive count clamps the text; zero, none, or a count
/// too large to reach (including infinity) does not.
func astryxLineLimit(_ maxLines: Double?) -> Int? {
  guard let maxLines, maxLines >= 1, maxLines < Double(Int32.max) else { return nil }
  return Int(maxLines)
}
