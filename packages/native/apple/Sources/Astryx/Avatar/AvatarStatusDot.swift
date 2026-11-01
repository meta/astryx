// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
import SwiftUI

/// A status dot for an avatar's corner (core `AvatarStatusDot`). Each variant
/// pairs a color with a shape, so status never rests on color alone: a filled
/// dot, a ring, or a dot with a minus bar. Inside an `Avatar` it sizes itself
/// from the avatar and its label joins the avatar's name ("Ada, Online").
///
/// ```swift
/// Avatar("Ada Lovelace", size: .lg) {
///   AvatarStatusDot(variant: .success, label: "Online")
/// }
/// ```
public struct AvatarStatusDot: View {
  /// The contract the view draws, the same for both initializers.
  public let props: AvatarStatusDotProps
  @Environment(\.astryx) private var astryx
  @Environment(\.astryxAvatarSide) private var avatarSide

  /// A status dot from its labeled props.
  /// - Parameters:
  ///   - variant: `success` (filled), `neutral` (ring), or `error` (minus bar); `nil` is `success` (core `variant`).
  ///   - label: What the status means, such as "Online" (core `label`).
  public init(variant: AvatarStatusDotVariant? = nil, label: String? = nil) {
    self.init(AvatarStatusDotProps(variant: variant, label: label))
  }

  /// A status dot from its generated contract, for generated and wire-driven callers.
  public init(_ props: AvatarStatusDotProps) {
    self.props = props
  }

  public var body: some View {
    if props.base.isHidden != true {
      let tier = AvatarStatusDot.tier(forAvatarSide: avatarSide)
      ZStack {
        Circle().fill(plate)
        glyph(tier)
      }
      .frame(width: tier.dot, height: tier.dot)
      .overlay(Circle().strokeBorder(astryx.tokens.color.backgroundSurface, lineWidth: tier.border))
      .modifier(DotName(label: label))
      .modifier(DotIdentifier(id: props.base.id))
      .preference(key: AvatarStatusLabelKey.self, value: label.map { AvatarStatusLabel(text: $0, isDot: true) })
    }
  }

  @ViewBuilder private func glyph(_ tier: Tier) -> some View {
    let field = tier.dot - tier.border * 2
    switch variant {
    case .neutral:
      // The ring's outer edge lands on the inner field.
      Circle()
        .inset(by: tier.stroke / 2)
        .stroke(ink, lineWidth: tier.stroke)
        .frame(width: field, height: field)
    case .error:
      // A round-capped bar across three quarters of the inner field.
      Capsule()
        .fill(ink)
        .frame(width: field * 0.75, height: tier.stroke)
    case .success:
      EmptyView()
    }
  }

  var variant: AvatarStatusDotVariant { props.variant ?? .success }

  /// The label, or `nil` when it is absent or blank.
  var label: String? {
    guard let label = props.label, !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    return label
  }

  /// The dot's fill: the variant color, or the surface for the ring.
  var plate: Color {
    switch variant {
    case .success: astryx.tokens.color.success
    case .neutral: astryx.tokens.color.backgroundSurface
    case .error: astryx.tokens.color.error
    }
  }

  /// What the glyph draws in, as core pairs each plate with its ink: on-error
  /// on the error plate, secondary text on the ring, on-success on success.
  var ink: Color {
    switch variant {
    case .success: astryx.tokens.color.onSuccess
    case .neutral: astryx.tokens.color.textSecondary
    case .error: astryx.tokens.color.onError
    }
  }

  /// A labeled dot alone is an image; an unlabeled one is hidden and adds no
  /// traits (Swift accessibility, X1).
  nonisolated static func traits(label: String?) -> AccessibilityTraits {
    label == nil ? [] : .isImage
  }

  /// Core's discrete size tiers: dot, border, and glyph stroke in points.
  struct Tier: Equatable {
    let dot: CGFloat
    let border: CGFloat
    let stroke: CGFloat
  }

  /// The tier for an avatar's side: up to 36 points small, up to 72 medium,
  /// larger large. A dot outside an avatar is small, as for an `md` avatar.
  nonisolated static func tier(forAvatarSide side: CGFloat?) -> Tier {
    switch side ?? 36 {
    case ...36: Tier(dot: 10, border: 1, stroke: 1)
    case ...72: Tier(dot: 20, border: 2, stroke: 1.5)
    default: Tier(dot: 32, border: 4, stroke: 2)
    }
  }
}

/// A labeled dot on its own reads as an image with its label; inside an
/// avatar the avatar reads it as part of its own name.
private struct DotName: ViewModifier {
  let label: String?

  func body(content: Content) -> some View {
    if let label {
      content.accessibilityElement(children: .ignore).accessibilityLabel(label)
        .accessibilityAddTraits(AvatarStatusDot.traits(label: label))
    } else {
      content.accessibilityHidden(true)
    }
  }
}

/// The base `id` becomes the accessibility identifier (AST-082 FR7).
private struct DotIdentifier: ViewModifier {
  let id: String?

  func body(content: Content) -> some View {
    if let id {
      content.accessibilityIdentifier(id)
    } else {
      content
    }
  }
}

/// A status label reported to the avatar that holds it: from a dot, or from
/// other labeled content such as an `Icon`.
struct AvatarStatusLabel: Equatable, Sendable {
  let text: String
  let isDot: Bool
}

/// The label the avatar's status names: a dot's wins over other content's,
/// wherever each sits, as core's reported dot label wins; else the first.
struct AvatarStatusLabelKey: PreferenceKey {
  static let defaultValue: AvatarStatusLabel? = nil

  static func reduce(value: inout AvatarStatusLabel?, nextValue: () -> AvatarStatusLabel?) {
    value = AvatarStatusLabelKey.winner(value, nextValue())
  }

  nonisolated static func winner(_ first: AvatarStatusLabel?, _ second: AvatarStatusLabel?) -> AvatarStatusLabel? {
    guard let first else { return second }
    guard let second else { return first }
    return !first.isDot && second.isDot ? second : first
  }
}

private struct AstryxAvatarSideKey: EnvironmentKey {
  static let defaultValue: CGFloat? = nil
}

extension EnvironmentValues {
  /// The side of the avatar a status dot sits on; `nil` outside an avatar.
  var astryxAvatarSide: CGFloat? {
    get { self[AstryxAvatarSideKey.self] }
    set { self[AstryxAvatarSideKey.self] = newValue }
  }
}
