// Copyright (c) Meta Platforms, Inc. and affiliates.

#if canImport(UIKit)
import UIKit
#endif

/// Where a Button sits, which decides whether it meets the system's glass
/// (FR7–FR9).
enum ButtonPlacement: Sendable, Equatable {
  /// In content: the token look.
  case content
  /// Hosted in a system bar, a navigation bar or a toolbar (FR7).
  case bar
  /// Inside a container `astryxFloating()` marks as floating (FR9).
  case floating
}

/// A token color a glass tint or a solid fill takes (FR8, FR10).
enum ButtonColorRole: Sendable, Equatable {
  case accent, error, neutral, surface

  func color(_ tokens: Tokens) -> Color {
    switch self {
    case .accent: tokens.color.accent
    case .error: tokens.color.error
    case .neutral: tokens.color.neutral
    case .surface: tokens.color.backgroundSurface
    }
  }
}

/// The glass a Button draws in a bar or a floating container (FR8).
enum ButtonGlass: Sendable, Equatable {
  /// No surface of its own, so the bar's glass is its only chrome (FR7).
  case barItem
  /// The system's regular glass.
  case regular
  /// The system's clear glass, the least visible surface.
  case clear
  /// The system's glass, tinted with a token color.
  case prominent(ButtonColorRole)
  /// In a bar, the bar's own glass, tinted with a token color: SwiftUI's
  /// prominent glass button style, so the bar tints its glass rather than
  /// a second glass drawing inside it (FR7).
  case barProminent(ButtonColorRole)
}

/// What a Button draws behind its label (FR7–FR10, ORD2).
enum ButtonSurface: Sendable, Equatable {
  /// The token look, in content, before iOS 26, and on macOS.
  case token
  /// The system's Liquid Glass (FR7–FR9).
  case glass(ButtonGlass)
  /// No glass under Reduce Transparency or Increase Contrast: the variant's
  /// token fill with an emphasized edge (FR10). In a bar it keeps no
  /// 44-point minimum of its own, since the bar sizes its items (FR11).
  case solid(ButtonColorRole, inBar: Bool)

  /// The surface for a variant where it sits (ORD2). An unset `variant` is
  /// `secondary`, as in core. A set `variant` keeps its meaning: placement
  /// picks its glass, never another variant's treatment (FR8). The theme's
  /// `material` intent is not yet carried by `Theme.native`; absent, it keeps
  /// FR7–FR9 (ORD2).
  static func resolve(
    variant: ButtonVariant?, placement: ButtonPlacement, glassAvailable: Bool, prefersSolid: Bool
  ) -> ButtonSurface {
    guard glassAvailable, placement != .content else { return .token }
    let variant = variant ?? .secondary
    if prefersSolid {
      let role: ButtonColorRole = switch variant {
      case .primary: .accent
      case .destructive: .error
      case .secondary: .neutral
      case .ghost: .surface
      }
      return .solid(role, inBar: placement == .bar)
    }
    let inBar = placement == .bar
    switch variant {
    case .primary: return .glass(inBar ? .barProminent(.accent) : .prominent(.accent))
    case .destructive: return .glass(inBar ? .barProminent(.error) : .prominent(.error))
    case .secondary: return .glass(inBar ? .barItem : .regular)
    case .ghost: return .glass(inBar ? .barItem : .clear)
    }
  }

  /// Whether this platform draws Liquid Glass: iOS and iPadOS 26 and later,
  /// built with an SDK that has it. macOS keeps the token look (FR10).
  static var glassAvailable: Bool {
    #if os(iOS) && compiler(>=6.2)
    if #available(iOS 26, *) { return true }
    #endif
    return false
  }
}

private struct AstryxFloatingKey: EnvironmentKey {
  static let defaultValue = false
}

extension EnvironmentValues {
  /// Whether `astryxFloating()` marks an enclosing container as floating.
  var astryxFloating: Bool {
    get { self[AstryxFloatingKey.self] }
    set { self[AstryxFloatingKey.self] = newValue }
  }
}

extension View {
  /// Marks this container as floating over scrolling content, so the Astryx
  /// Buttons inside it draw the system's Liquid Glass on iOS and iPadOS 26 and
  /// later (`component:swift/Button` FR9). It only marks the container: it
  /// changes no Button props, and elsewhere the Buttons keep their token look.
  public func astryxFloating() -> some View {
    environment(\.astryxFloating, true)
  }
}

#if os(iOS)
/// Tells a Button whether a system bar hosts it. SwiftUI has no public signal
/// for this, so it looks among its UIKit ancestors for a navigation bar, a
/// toolbar, or the host SwiftUI gives each bar item (on iOS 26 the bottom bar
/// is a floating container, not a toolbar), checked whenever it moves or lays
/// out. A bar, once found, holds: the bar re-hosts a prominent item where its
/// ancestors no longer show the bar, and letting go would flip the Button
/// back and forth. The host's name is not an API, so FR7's capture gate
/// checks the navigation bar and the bottom bar on each new iOS.
struct ButtonBarProbe: UIViewRepresentable {
  let report: (Bool) -> Void

  func makeUIView(context: Context) -> ProbeView {
    let view = ProbeView()
    view.report = report
    view.isUserInteractionEnabled = false
    view.isAccessibilityElement = false
    return view
  }

  func updateUIView(_ view: ProbeView, context: Context) {
    view.report = report
  }

  final class ProbeView: UIView {
    var report: ((Bool) -> Void)?
    private var found = false

    override func didMoveToWindow() {
      super.didMoveToWindow()
      check()
    }

    override func didMoveToSuperview() {
      super.didMoveToSuperview()
      check()
    }

    override func layoutSubviews() {
      super.layoutSubviews()
      check()
    }

    private func check() {
      guard !found else { return }
      var node = superview
      while let view = node {
        if view is UINavigationBar || view is UIToolbar
          || String(describing: type(of: view)).hasPrefix("UIKitBarItemHost") {
          found = true
          let report = report
          // Reported after this layout pass, never during it.
          Task { @MainActor in report?(true) }
          return
        }
        node = view.superview
      }
    }
  }
}
#endif
