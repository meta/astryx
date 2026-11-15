// Copyright (c) Meta Platforms, Inc. and affiliates.

import SwiftUI

/// Core's `Banner` statuses.
public enum AstryxBannerStatus: String, CaseIterable, Sendable {
  case info
  case warning
  case error
  case success

  /// The shared icon name for this status (AST-082 FR17), drawn as the
  /// theme's or the platform's symbol for it.
  var iconName: String { rawValue }

  func groundColor(_ color: ColorTokens) -> Color {
    switch self {
    case .info: color.accentMuted
    case .warning: color.warningMuted
    case .error: color.errorMuted
    case .success: color.successMuted
    }
  }

  func iconColor(_ color: ColorTokens) -> Color {
    switch self {
    case .info: color.accent
    case .warning: color.warning
    case .error: color.error
    case .success: color.success
    }
  }
}

/// A message about the page or a section of it. The status sets the color
/// and icon only; the title must say what happened, because the icon is
/// decorative to VoiceOver.
public struct Banner: View {
  let status: AstryxBannerStatus
  let title: String
  let description: String?
  @Environment(\.astryx) private var astryx

  public init(status: AstryxBannerStatus, title: String, description: String? = nil) {
    self.status = status
    self.title = title
    self.description = description
  }

  public var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: astryx.tokens.space.s2) {
      if let icon = astryx.icon(status.iconName) {
        // Sized with the title so it grows with Dynamic Type.
        icon.sized(astryx.tokens.font.body.size * astryx.textScale)
          .font(astryx.font(TypeStyle(astryx.tokens.font.body, families: astryx.tokens.font.family.body)))
          .foregroundStyle(status.iconColor(astryx.tokens.color))
          .accessibilityHidden(true)
      }
      VStack(alignment: .leading, spacing: astryx.tokens.space.s1) {
        Text(title, weight: .semibold)
        if let description {
          Text(description, color: .secondary)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(astryx.tokens.space.s3)
    .background(
      RoundedRectangle(cornerRadius: astryx.tokens.radius.container, style: .continuous)
        .fill(status.groundColor(astryx.tokens.color))
    )
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(SwiftUI.Text(accessibilityText))
  }

  /// What VoiceOver reads: the title, then the description.
  var accessibilityText: String {
    description.map { "\(title), \($0)" } ?? title
  }
}
