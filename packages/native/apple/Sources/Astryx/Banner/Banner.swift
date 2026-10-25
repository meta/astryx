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

  var groundToken: String {
    switch self {
    case .info: "color-accent-muted"
    case .warning: "color-warning-muted"
    case .error: "color-error-muted"
    case .success: "color-success-muted"
    }
  }

  var iconToken: String {
    switch self {
    case .info: "color-accent"
    case .warning: "color-warning"
    case .error: "color-error"
    case .success: "color-success"
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
    HStack(alignment: .firstTextBaseline, spacing: astryx.space(2)) {
      if let icon = astryx.icon(status.iconName) {
        // Sized with the title so it grows with Dynamic Type.
        icon.sized(astryx.fontSize("text-body-size", 14))
          .font(astryx.font(size: "text-body-size", 14, weight: "text-body-weight"))
          .foregroundStyle(astryx.color(status.iconToken))
          .accessibilityHidden(true)
      }
      VStack(alignment: .leading, spacing: astryx.space(1)) {
        Text(title, weight: .semibold)
        if let description {
          Text(description, color: .secondary)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(astryx.space(3))
    .background(
      RoundedRectangle(cornerRadius: astryx.size("radius-container", 12), style: .continuous)
        .fill(astryx.color(status.groundToken))
    )
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(SwiftUI.Text(accessibilityText))
  }

  /// What VoiceOver reads: the title, then the description.
  var accessibilityText: String {
    description.map { "\(title), \($0)" } ?? title
  }
}
