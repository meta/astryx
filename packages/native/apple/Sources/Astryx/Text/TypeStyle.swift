// Copyright (c) Meta Platforms, Inc. and affiliates.

/// One of core's type styles, read from the theme's typed tokens: a size and
/// weight in core's units, and the family stack to draw it in.
struct TypeStyle: Equatable {
  var size: CGFloat
  var weight: CGFloat
  var families: [String]
}

extension FontTokens {
  /// The style core's Text draws for a type, or nil for `inherit`. Display
  /// types draw in the heading family, as core's type scale sets them.
  func style(_ type: TextType) -> TypeStyle? {
    switch type {
    case .body: TypeStyle(size: bodySize, weight: bodyWeight, families: familyBody)
    case .large: TypeStyle(size: largeSize, weight: largeWeight, families: familyBody)
    case .label: TypeStyle(size: labelSize, weight: labelWeight, families: familyBody)
    case .supporting: TypeStyle(size: supportingSize, weight: supportingWeight, families: familyBody)
    case .code: TypeStyle(size: codeSize, weight: codeWeight, families: familyCode)
    case .display1: TypeStyle(size: display1Size, weight: display1Weight, families: familyHeading)
    case .display2: TypeStyle(size: display2Size, weight: display2Weight, families: familyHeading)
    case .display3: TypeStyle(size: display3Size, weight: display3Weight, families: familyHeading)
    case .inherit: nil
    }
  }

  /// The font size core's Text draws for an explicit `size`. Core spells the
  /// extra-small size `xsm`; its token is `font-size-xs`.
  func size(_ size: TextSize) -> CGFloat {
    switch size {
    case .v4xs: size4xs
    case .v3xs: size3xs
    case .v2xs: size2xs
    case .xsm: sizeXs
    case .sm: sizeSm
    case .base: sizeBase
    case .lg: sizeLg
    case .xl: sizeXl
    case .v2xl: size2xl
    case .v3xl: size3xl
    case .v4xl: size4xl
    }
  }

  /// The numeric weight behind one of core's weight names.
  func weight(named name: String) -> CGFloat {
    switch name {
    case "medium": weightMedium
    case "semibold": weightSemibold
    case "bold": weightBold
    default: weightNormal
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
