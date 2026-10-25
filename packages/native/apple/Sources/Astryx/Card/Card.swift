// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI

/// A card: one independent item on the theme's card ground, with a hairline
/// border and the container radius.
public struct Card<Content: View>: View {
  let padding: Int
  let content: Content
  @Environment(\.astryx) private var astryx

  /// - Parameter padding: a step on the spacing ladder, as core's `padding`.
  public init(padding: Int = 4, @ViewBuilder content: () -> Content) {
    self.padding = padding
    self.content = content()
  }

  public var body: some View {
    let shape = RoundedRectangle(
      cornerRadius: astryx.size("radius-container", 12),
      style: .continuous
    )
    // Several child views stack in one card, top to bottom with no gap of
    // their own, as children flow inside core's Card.
    VStack(alignment: .leading, spacing: 0) { content }
      .padding(astryx.space(padding))
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(shape.fill(astryx.color("color-background-card")))
      .overlay(
        shape.strokeBorder(astryx.color("color-border"), lineWidth: astryx.size("border-width", 1))
      )
  }
}
