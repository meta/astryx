// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from github.com/ejc3/astryx-swift (MIT).

import SwiftUI

/// Core's `Text` semantic types this package draws so far.
public enum AstryxTextType: String, CaseIterable, Sendable {
  case body
  case large
  case label
  case supporting

  var token: String { "text-\(rawValue)" }

  /// The color core's Text uses when none is given: secondary for supporting
  /// text, primary otherwise.
  var defaultColor: AstryxTextColor { self == .supporting ? .secondary : .primary }
}

/// Core's `Text` colors this package draws so far.
public enum AstryxTextColor: String, CaseIterable, Sendable {
  case primary
  case secondary
  case disabled
  case accent

  var token: String { "color-text-\(rawValue)" }
}

/// Core's `Text` weights.
public enum AstryxTextWeight: String, CaseIterable, Sendable {
  case normal
  case medium
  case semibold
  case bold

  var token: String { "font-weight-\(rawValue)" }
}

/// Core's `Text` sizes this package draws so far, used to override the size
/// a semantic type sets. Core spells the extra-small size `xsm`; its token is
/// `font-size-xs`.
public enum AstryxTextSize: String, CaseIterable, Sendable {
  case xsm
  case sm
  case base
  case lg
  case xl

  var token: String { self == .xsm ? "font-size-xs" : "font-size-\(rawValue)" }
}

/// A run of text in a semantic type, painted with the theme's type tokens.
public struct Text: View {
  let content: String
  let type: AstryxTextType
  let color: AstryxTextColor?
  let size: AstryxTextSize?
  let weight: AstryxTextWeight?
  @Environment(\.astryx) private var astryx

  public init(
    _ content: String,
    type: AstryxTextType = .body,
    color: AstryxTextColor? = nil,
    size: AstryxTextSize? = nil,
    weight: AstryxTextWeight? = nil
  ) {
    self.content = content
    self.type = type
    self.color = color
    self.size = size
    self.weight = weight
  }

  public var body: some View {
    let sizeToken = size?.token ?? "\(type.token)-size"
    let weightToken = weight?.token ?? "\(type.token)-weight"
    SwiftUI.Text(content)
      .font(astryx.font(size: sizeToken, 14, weight: weightToken))
      .foregroundStyle(astryx.color((color ?? type.defaultColor).token))
  }
}
