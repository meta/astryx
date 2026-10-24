// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from github.com/ejc3/astryx-swift (MIT).

import SwiftUI

/// A heading at levels 1 through 6, painted with the theme's heading tokens
/// and exposed to VoiceOver as a heading.
public struct AstryxHeading: View {
  let content: String
  let level: Int
  @Environment(\.astryx) private var astryx

  public init(_ content: String, level: Int = 2) {
    self.content = content
    self.level = min(max(level, 1), 6)
  }

  public var body: some View {
    Text(content)
      .font(
        astryx.font(
          size: "text-heading-\(level)-size",
          20,
          weight: "text-heading-\(level)-weight",
          family: "font-family-heading"
        )
      )
      .foregroundStyle(astryx.color("color-text-primary"))
      .accessibilityAddTraits(Self.accessibilityTraits)
      .accessibilityHeading(headingLevel)
  }

  /// The traits assistive technology gets: a header.
  static var accessibilityTraits: AccessibilityTraits { .isHeader }

  var headingLevel: AccessibilityHeadingLevel {
    switch level {
    case 1: .h1
    case 2: .h2
    case 3: .h3
    case 4: .h4
    case 5: .h5
    default: .h6
    }
  }
}
