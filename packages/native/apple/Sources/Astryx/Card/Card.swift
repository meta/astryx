// Copyright (c) Meta Platforms, Inc. and affiliates.

/// A card: one independent item on the theme's card ground. It takes core's
/// Card props (`CardProps`) and stacks its content top to bottom, as children
/// flow inside core's Card.
public struct Card<Content: View>: View {
  public let props: CardProps
  let content: Content
  @Environment(\.astryx) private var astryx

  /// - Parameters:
  ///   - padding: core's `padding`, a step on the spacing scale; step 4 when
  ///     nil.
  ///   - variant: core's `variant`: the card ground, or `transparent` for none.
  ///     Only `default` draws a border.
  ///   - elevation: core's `elevation`, the theme's shadow at that depth.
  ///   - base: core's base props.
  ///   - content: core's `children`.
  public init(
    padding: CardPadding? = nil,
    variant: CardVariant? = nil,
    elevation: CardElevation? = nil,
    base: AstryxBaseProps = AstryxBaseProps(),
    @ViewBuilder content: () -> Content
  ) {
    self.props = CardProps(padding: padding, variant: variant, elevation: elevation, base: base)
    self.content = content()
  }

  public var body: some View {
    let shape = RoundedRectangle(cornerRadius: astryx.tokens.radius.container, style: .continuous)
    let variant = props.variant ?? .default
    // The border sits inside the padding, so the content's inset is the
    // padding step, as in core.
    SwiftUI.VStack(alignment: .leading, spacing: 0) { content }
      .padding(padding)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(shape.fill(Self.ground(variant, astryx.tokens.color)))
      .overlay {
        if variant == .default {
          shape.strokeBorder(astryx.tokens.color.border, lineWidth: astryx.tokens.size.borderWidth)
        }
      }
      .astryxShadow(
        Self.shadow(props.elevation ?? .none, astryx.tokens.shadow), in: shape,
        borderWidth: variant == .default ? astryx.tokens.size.borderWidth : 0
      )
      .astryxBase(props.base)
  }

  var padding: CGFloat {
    let space = astryx.tokens.space
    switch props.padding ?? .v4 {
    case .v0: return space.s0
    case .v0_5: return space.s0_5
    case .v1: return space.s1
    case .v1_5: return space.s1_5
    case .v2: return space.s2
    case .v3: return space.s3
    case .v4: return space.s4
    case .v5: return space.s5
    case .v6: return space.s6
    case .v8: return space.s8
    case .v10: return space.s10
    }
  }

  /// The ground core's Card draws for a variant.
  static func ground(_ variant: CardVariant, _ color: ColorTokens) -> Color {
    switch variant {
    case .default: color.backgroundCard
    case .transparent: .clear
    case .muted: color.backgroundMuted
    case .blue: color.backgroundBlue
    case .cyan: color.backgroundCyan
    case .gray: color.backgroundGray
    case .green: color.backgroundGreen
    case .orange: color.backgroundOrange
    case .pink: color.backgroundPink
    case .purple: color.backgroundPurple
    case .red: color.backgroundRed
    case .teal: color.backgroundTeal
    case .yellow: color.backgroundYellow
    }
  }

  /// The theme's shadow at an elevation.
  static func shadow(_ elevation: CardElevation, _ shadow: ShadowTokens) -> [ShadowLayer] {
    switch elevation {
    case .none: []
    case .low: shadow.low
    case .med: shadow.med
    case .high: shadow.high
    }
  }
}

extension Card where Content == AstryxNodeList {
  /// A card from core's props, with its children as the wire tree a logic
  /// core sends; `send` carries the children's callbacks back to the core.
  public init(
    _ props: CardProps,
    children: [AstryxNode],
    send: @escaping @Sendable (AstryxAction) -> Void
  ) {
    self.props = props
    self.content = AstryxNodeList(nodes: children, send: send)
  }
}
