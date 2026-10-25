// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from github.com/ejc3/astryx-swift (MIT).

import SwiftUI

/// Core's `Button` variants.
public enum AstryxButtonVariant: String, CaseIterable, Sendable {
  case primary
  case secondary
  case ghost
  case destructive
}

/// Core's `Button` sizes: `size-element-sm`, `-md`, and `-lg` high.
public enum AstryxButtonSize: String, CaseIterable, Sendable {
  case sm
  case md
  case lg

  var heightToken: String { "size-element-\(rawValue)" }
  var fallbackHeight: CGFloat {
    switch self {
    case .sm: 28
    case .md: 32
    case .lg: 36
    }
  }
}

/// A labeled action, painted with the theme's tokens. The tap area reaches
/// the platform's 44-by-44-point minimum even when the drawn button is smaller.
public struct Button: View {
  let label: String
  let variant: AstryxButtonVariant
  let size: AstryxButtonSize
  let icon: String?
  let isLoading: Bool
  let isDisabled: Bool
  let fillsWidth: Bool
  let action: () -> Void
  @Environment(\.astryx) private var astryx

  /// - Parameters:
  ///   - icon: a shared icon name, such as `"search"`, shown before the
  ///     label; the theme's symbol for it, else the platform default.
  ///   - fillsWidth: the button takes the whole width it is offered, as
  ///     core's `width="100%"` does.
  public init(
    label: String,
    variant: AstryxButtonVariant = .secondary,
    size: AstryxButtonSize = .md,
    icon: String? = nil,
    isLoading: Bool = false,
    isDisabled: Bool = false,
    fillsWidth: Bool = false,
    action: @escaping () -> Void
  ) {
    self.label = label
    self.variant = variant
    self.size = size
    self.icon = icon
    self.isLoading = isLoading
    self.isDisabled = isDisabled
    self.fillsWidth = fillsWidth
    self.action = action
  }

  public var body: some View {
    SwiftUI.Button(action: activate) {
      // The label keeps its place while loading so the width holds; the
      // spinner draws over it.
      HStack(spacing: astryx.space(2)) {
        if let icon, let image = astryx.icon(icon) {
          // An asset matches the label's text size, as a symbol does.
          image.sized(astryx.fontSize("text-label-size", 14))
        }
        SwiftUI.Text(label).lineLimit(1)
      }
      .opacity(isLoading ? 0 : 1)
      .overlay {
        if isLoading {
          ProgressView().controlSize(.small).tint(foreground)
        }
      }
    }
    .buttonStyle(
      AstryxButtonStyle(
        astryx: astryx,
        size: size,
        fillsWidth: fillsWidth,
        foreground: foreground,
        background: background
      )
    )
    // As core's Button: a loading button stays undimmed and focusable, keeps
    // its label, and says Loading; taps do nothing until it finishes.
    .disabled(isDisabled)
    .accessibilityLabel(SwiftUI.Text(accessibilityText))
    .accessibilityAddTraits(Self.accessibilityTraits)
    .accessibilityValue(SwiftUI.Text(loadingValue ?? ""))
    .onChange(of: isLoading) { _, loading in
      if loading { AccessibilityNotification.Announcement(AstryxStrings.buttonLoading).post() }
    }
  }

  /// The button's accessible name: its label, also while loading.
  var accessibilityText: String { label }

  /// The traits assistive technology gets: a button.
  static var accessibilityTraits: AccessibilityTraits { .isButton }

  /// What assistive technology reads after the label while loading: core's
  /// catalog message, in the person's language.
  var loadingValue: String? { isLoading ? AstryxStrings.buttonLoading : nil }

  /// Runs the action unless the button is loading.
  func activate() {
    guard !isLoading else { return }
    action()
  }

  private var foreground: Color {
    switch variant {
    case .primary: astryx.color("color-on-accent")
    case .destructive: astryx.color("color-on-error")
    case .secondary, .ghost: astryx.color("color-text-primary")
    }
  }

  private var background: Color {
    switch variant {
    case .primary: astryx.color("color-accent")
    case .destructive: astryx.color("color-error")
    case .secondary: astryx.color("color-neutral")
    case .ghost: .clear
    }
  }
}

struct AstryxButtonStyle: ButtonStyle {
  let astryx: AstryxStyle
  let size: AstryxButtonSize
  let fillsWidth: Bool
  let foreground: Color
  let background: Color
  @Environment(\.isEnabled) private var isEnabled

  func makeBody(configuration: Configuration) -> some View {
    let shape = RoundedRectangle(
      cornerRadius: astryx.size("radius-element", 8),
      style: .continuous
    )
    // Grows with text size, but not so far that one line of a large label
    // becomes a tall slab.
    let height = astryx.size(size.heightToken, size.fallbackHeight) * min(astryx.textScale, 1.4)
    configuration.label
      .font(astryx.font(size: "text-label-size", 14, weight: "text-label-weight"))
      .foregroundStyle(foreground)
      .padding(.horizontal, astryx.space(3))
      .frame(maxWidth: fillsWidth ? .infinity : nil, minHeight: height)
      .background(shape.fill(background))
      .opacity(isEnabled ? (configuration.isPressed ? 0.75 : 1) : 0.5)
      // Drawn at the token size; laid out at least 44 by 44 so the whole
      // platform-minimum tap area counts.
      .frame(minWidth: 44, minHeight: 44)
      .contentShape(Rectangle())
  }
}
