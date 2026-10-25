// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
import SwiftUI

/// How keyboard focus reaches a tooltip, as core's `focusTrigger`.
enum TooltipFocus: Equatable, Sendable {
  /// The view is not a tab stop and focus shows nothing, as core's tooltip on
  /// an element that is not focusable.
  case none
  /// The view is a control that takes focus already; focus shows the tooltip.
  case control
  /// The view is made a tab stop so focus can show the tooltip, as core gives
  /// a static element with a tooltip a tab stop.
  case tabStop
}

/// What a direct tap on a touch screen does, as core's `touchTrigger`.
enum TooltipTouch: Equatable, Sendable {
  /// Core's default: a tap opens the tooltip unless the view is a control,
  /// whose tap belongs to its action.
  case auto
  /// A tap always opens the tooltip; an action on the view still runs.
  case tap
  /// A tap never opens the tooltip.
  case none
}

extension View {
  /// The Astryx tooltip, one behavior for every component, following core's
  /// `useTooltip` and `Tooltip` (`library/tooltip.spec.md`).
  /// - Parameters:
  ///   - text: The tooltip's words; `nil` shows nothing.
  ///   - hint: Words VoiceOver reads as the hint, as core puts given tooltip
  ///     words in the description; `nil` for words already in the name.
  ///   - focus: How keyboard focus reaches the tooltip.
  ///   - touch: What a direct tap does; `auto`, core's default, by default.
  ///   - isDisabled: A disabled view shows no tooltip.
  func astryxTooltip(
    _ text: String?, hint: String? = nil, focus: TooltipFocus = .none, touch: TooltipTouch = .auto,
    isDisabled: Bool = false
  ) -> some View {
    modifier(
      TooltipPresenter(
        text: TooltipPresenter.shownText(text, isDisabled: isDisabled), hint: isDisabled ? nil : hint,
        focus: focus, touch: touch))
  }
}

/// Core's tooltip on Apple platforms (`library/tooltip.spec.md`):
///
/// - The bubble sits above the view, as core places it, below when there is
///   no room above, and slides sideways to stay inside the window's safe area
///   with core's `space.s4` floor; long words wrap at core's 300-point width.
/// - A resting pointer shows the bubble after 200 ms; it stays while the
///   pointer is on the view or the bubble, hides 100 ms after it leaves both,
///   and a press hides it.
/// - Keyboard focus shows it at once, as core's `focusin` does, and hides it
///   100 ms after focus leaves; focus a pointer press brings shows nothing,
///   as core's `:focus-visible` check keeps it shut, decided once as focus
///   arrives. Escape hides a shown bubble wherever focus is,
///   as core's top-most layer takes the press.
/// - On a touch screen a direct tap opens it at once; a click from a trackpad
///   or mouse, which hovers first, does not. The tap is shared, so the view's
///   own action and an enclosing row still run. A tap anywhere but the view or
///   the bubble, or a scroll or pinch anywhere but the bubble, closes it and
///   still reaches what it lands on, as core's outside dismissal does.
/// - VoiceOver never sees the bubble and the tap is left alone while it runs;
///   given words are the hint.
///
/// It keeps one view structure whatever its words, so a change of words or a
/// disabled toggle never rebuilds the view it decorates.
struct TooltipPresenter: ViewModifier {
  let text: String?
  let hint: String?
  let focus: TooltipFocus
  let touch: TooltipTouch
  @Environment(\.astryx) private var astryx
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  @State private var isShown = false
  @State private var isHovering = false
  @State private var isHoveringBubble = false
  @State private var isTapShown = false
  @State private var pending: Task<Void, Never>?
  @State private var viewFrame: CGRect = .zero
  @State private var bubbleFrame: CGRect = .zero
  @State private var window = TooltipWindowMetrics()
  @State private var pressedAt: Date = .distantPast
  /// Whether the keyboard brought the current focus, decided once as it
  /// arrives, as core's `:focus-visible` check does.
  @State private var focusIsKeyboard = false
  @FocusState private var isFocused: Bool

  /// Core's delay before showing.
  nonisolated static var delay: Duration { .milliseconds(200) }
  /// Core's grace before hiding, so the pointer can cross onto the bubble.
  nonisolated static var bridge: Duration { .milliseconds(100) }
  /// Core's widest bubble; longer words wrap.
  nonisolated static var maximumWidth: CGFloat { 300 }

  /// Whether the bubble goes above the view: core's placement, unless the
  /// bubble and its gap would not fit between the view and `topEdge`, the
  /// window's safe top plus core's `space.s4` floor.
  nonisolated static func placesAbove(viewTop: CGFloat, bubbleHeight: CGFloat, gap: CGFloat, topEdge: CGFloat = 0)
    -> Bool
  {
    viewTop - topEdge >= bubbleHeight + gap
  }

  /// How far the bubble, centered on the view, slides sideways to stay
  /// inside a window `windowWidth` wide, `leading` and `trailing` from its
  /// edges, as core's layer slides to stay inside the viewport. Zero when the
  /// window's width is unknown.
  nonisolated static func slide(
    viewMinX: CGFloat, viewWidth: CGFloat, bubbleWidth: CGFloat, windowWidth: CGFloat?, margin: CGFloat,
    trailing: CGFloat? = nil
  ) -> CGFloat {
    guard let windowWidth, windowWidth > 0 else { return 0 }
    let left = viewMinX + (viewWidth - bubbleWidth) / 2
    let lowest = margin, highest = windowWidth - (trailing ?? margin) - bubbleWidth
    guard highest >= lowest else { return lowest - left }
    return min(max(left, lowest), highest) - left
  }

  /// How long to wait before the bubble shows or hides: a pointer waits
  /// core's delay; focus shows at once; hiding waits the bridge.
  nonisolated static func wait(showing: Bool, byFocus: Bool) -> Duration {
    showing ? (byFocus ? .zero : delay) : bridge
  }

  /// The words to show: blank words and a disabled view show nothing.
  nonisolated static func shownText(_ text: String?, isDisabled: Bool) -> String? {
    guard !isDisabled, let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    return text
  }

  /// Whether the bubble should be up for a pointer or the keyboard: words to
  /// show, and the pointer on the view or the bubble, or keyboard focus where
  /// focus reaches the tooltip.
  nonisolated static func wantsBubble(
    hasText: Bool, isHovering: Bool, isHoveringBubble: Bool, isFocused: Bool, focus: TooltipFocus
  ) -> Bool {
    hasText && (isHovering || isHoveringBubble || (isFocused && focus != .none))
  }

  /// What a tap does once `auto` is resolved as core resolves it: a tap
  /// opens the tooltip unless the view is a control.
  nonisolated static func resolvedTouch(_ touch: TooltipTouch, focus: TooltipFocus) -> TooltipTouch {
    guard touch == .auto else { return touch }
    return focus == .control ? .none : .tap
  }

  /// Whether a tap opens the bubble: a tap trigger with words, a direct touch
  /// (a pointer hovers before it clicks), and VoiceOver not running.
  nonisolated static func tapOpens(touch: TooltipTouch, hasText: Bool, isHovering: Bool, voiceOver: Bool) -> Bool {
    touch == .tap && hasText && !isHovering && !voiceOver
  }

  /// Whether a gesture starting at `point`, in window coordinates, closes a
  /// tap-opened bubble: anywhere but the bubble, and, for a tap, but the
  /// view, whose own tap toggles it. A scroll or pinch on the view closes it.
  nonisolated static func closesTapBubble(point: CGPoint, isTap: Bool, viewFrame: CGRect, bubbleFrame: CGRect) -> Bool {
    !bubbleFrame.contains(point) && !(isTap && viewFrame.contains(point))
  }

  /// Whether focus holds the bubble up: only focus the keyboard brought, so a
  /// bubble a pointer opened on a view a click focused hides when the pointer
  /// leaves, as core's does.
  nonisolated static func holdsByFocus(isFocused: Bool, focusIsKeyboard: Bool) -> Bool {
    isFocused && focusIsKeyboard
  }

  /// Whether the bubble should be up now, as `update()` decides it: words,
  /// and the pointer on the view or the bubble, or focus the keyboard brought.
  nonisolated static func showsBubble(
    hasText: Bool, isHovering: Bool, isHoveringBubble: Bool, isFocused: Bool, focusIsKeyboard: Bool,
    focus: TooltipFocus
  ) -> Bool {
    wantsBubble(
      hasText: hasText, isHovering: isHovering, isHoveringBubble: isHoveringBubble,
      isFocused: holdsByFocus(isFocused: isFocused, focusIsKeyboard: focusIsKeyboard), focus: focus)
  }

  /// Whether keyboard focus still holds the bubble after the pointer enters
  /// or leaves the view or the bubble: a pointer leaving lets the bubble hide
  /// even though focus opened it, as core's `mouseleave` schedules the hide
  /// whatever brought it up, until focus leaves and returns.
  nonisolated static func keyboardFocusHolds(afterHover inside: Bool, holds: Bool) -> Bool {
    inside && holds
  }

  /// Whether focus came from the keyboard, as core's `:focus-visible`: not
  /// while a pointer rests on the view, and not within a press of it.
  nonisolated static func isKeyboardFocus(isHovering: Bool, sincePress: TimeInterval) -> Bool {
    !isHovering && sincePress > 0.5
  }

  func body(content: Content) -> some View {
    content
      .modifier(TooltipTabStop(focus: focus, isOn: text != nil))
      .focused($isFocused)
      .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { viewFrame = $0 }
      .simultaneousGesture(TapGesture().onEnded { pressed() })
      .onHover { inside in
        isHovering = inside
        focusIsKeyboard = Self.keyboardFocusHolds(afterHover: inside, holds: focusIsKeyboard)
        update()
      }
      .onChange(of: isFocused) {
        focusIsKeyboard =
          isFocused && Self.isKeyboardFocus(isHovering: isHovering, sincePress: Date().timeIntervalSince(pressedAt))
        update()
      }
      .onChange(of: text) {
        if text == nil { isTapShown = false }
        update()
      }
      .overlay(alignment: above ? .top : .bottom) {
        if isShown || isTapShown, let text {
          TooltipBubble(text: text)
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { bubbleFrame = $0 }
            .background(TooltipWindowReader { window = $0 })
            .onHover { inside in
              isHoveringBubble = inside
              focusIsKeyboard = Self.keyboardFocusHolds(afterHover: inside, holds: focusIsKeyboard)
              update()
            }
            .background(TooltipEscape(hide: hideAll))
            .background(
              TooltipOutsideTap(isActive: isTapShown, viewFrame: viewFrame, bubbleFrame: bubbleFrame) {
                isTapShown = false
              })
            .modifier(TooltipPlacement(isAbove: above, gap: astryx.tokens.space.s1, slide: sideways))
        }
      }
      .zIndex(isShown || isTapShown ? 1 : 0)
      .modifier(TooltipHint(text: hint))
  }

  /// Whether the bubble goes above the view now.
  private var above: Bool {
    Self.placesAbove(
      viewTop: viewFrame.minY, bubbleHeight: bubbleFrame.height, gap: astryx.tokens.space.s1,
      topEdge: window.safeTop + astryx.tokens.space.s4)
  }

  /// How far the bubble slides to stay inside the window now.
  private var sideways: CGFloat {
    Self.slide(
      viewMinX: viewFrame.minX, viewWidth: viewFrame.width, bubbleWidth: bubbleFrame.width,
      windowWidth: window.width, margin: window.safeLeading + astryx.tokens.space.s4,
      trailing: window.safeTrailing + astryx.tokens.space.s4)
  }

  private func pressed() {
    pressedAt = Date()
    let wasTapShown = isTapShown
    hideAll()
    let resolved = Self.resolvedTouch(touch, focus: focus)
    if !wasTapShown, Self.tapOpens(touch: resolved, hasText: text != nil, isHovering: isHovering, voiceOver: voiceOver) {
      isTapShown = true
    }
  }

  private func hideAll() {
    pending?.cancel()
    isShown = false
    isTapShown = false
  }

  /// Shows the bubble after the delay; hides it after the bridge.
  private func update() {
    pending?.cancel()
    let keyboardFocused = Self.holdsByFocus(isFocused: isFocused, focusIsKeyboard: focusIsKeyboard)
    let wants = Self.showsBubble(
      hasText: text != nil, isHovering: isHovering, isHoveringBubble: isHoveringBubble, isFocused: isFocused,
      focusIsKeyboard: focusIsKeyboard, focus: focus)
    guard wants != isShown else { return }
    let byFocus = keyboardFocused && focus != .none && !isHovering && !isHoveringBubble
    let wait = Self.wait(showing: wants, byFocus: byFocus)
    pending = Task { @MainActor in
      try? await Task.sleep(for: wait)
      if !Task.isCancelled { isShown = wants }
    }
  }
}

/// The window that holds the bubble: its width and safe-area insets, so the
/// bubble stays inside that window's safe area with core's `space.s4` floor.
struct TooltipWindowMetrics: Equatable {
  var width: CGFloat?
  var safeTop: CGFloat = 0
  var safeLeading: CGFloat = 0
  var safeTrailing: CGFloat = 0
}

/// Reads the window that holds the bubble.
private struct TooltipWindowReader: View {
  let report: (TooltipWindowMetrics) -> Void

  var body: some View {
    TooltipWindowProbe(report: report)
      .frame(width: 0, height: 0)
      .accessibilityHidden(true)
  }
}

#if os(iOS)
private struct TooltipWindowProbe: UIViewRepresentable {
  let report: (TooltipWindowMetrics) -> Void

  func makeUIView(context: Context) -> UIView {
    let view = UIView()
    view.isUserInteractionEnabled = false
    return view
  }

  func updateUIView(_ view: UIView, context: Context) {
    let report = report
    Task { @MainActor in
      guard let window = view.window else { return report(TooltipWindowMetrics()) }
      let insets = window.safeAreaInsets
      let rtl = window.effectiveUserInterfaceLayoutDirection == .rightToLeft
      report(
        TooltipWindowMetrics(
          width: window.bounds.width, safeTop: insets.top, safeLeading: rtl ? insets.right : insets.left,
          safeTrailing: rtl ? insets.left : insets.right))
    }
  }
}
#elseif os(macOS)
private struct TooltipWindowProbe: NSViewRepresentable {
  let report: (TooltipWindowMetrics) -> Void

  func makeNSView(context: Context) -> NSView { NSView() }

  func updateNSView(_ view: NSView, context: Context) {
    let report = report
    Task { @MainActor in report(TooltipWindowMetrics(width: view.window?.contentView?.bounds.width)) }
  }
}
#else
private struct TooltipWindowProbe: View {
  let report: (TooltipWindowMetrics) -> Void
  var body: some View { Color.clear }
}
#endif

/// Places the bubble `gap` above the view it decorates, or below it, slid
/// sideways by `slide`. The bubble hangs from a zero-height frame on the
/// view's top or bottom edge, so it needs no measured height and sits in
/// place on its first frame. Used inside an overlay aligned to that edge.
struct TooltipPlacement: ViewModifier {
  let isAbove: Bool
  let gap: CGFloat
  let slide: CGFloat

  func body(content: Content) -> some View {
    content
      .frame(height: 0, alignment: isAbove ? .bottom : .top)
      .offset(x: slide, y: isAbove ? -gap : gap)
  }
}

/// Escape hides a shown bubble wherever focus is, as core's top-most layer
/// takes the press: a hidden button bound to Escape lives while the bubble
/// shows.
private struct TooltipEscape: View {
  let hide: () -> Void

  var body: some View {
    SwiftUI.Button(action: hide) { EmptyView() }
      .keyboardShortcut(.escape, modifiers: [])
      .focusable(false)
      .opacity(0)
      .frame(width: 0, height: 0)
      .accessibilityHidden(true)
  }
}

/// On iOS, a tap anywhere outside the view closes a tap-opened bubble and
/// still reaches what it lands on, as core's outside tap does: a recognizer on
/// the window that never cancels the touch.
private struct TooltipOutsideTap: View {
  let isActive: Bool
  let viewFrame: CGRect
  let bubbleFrame: CGRect
  let close: () -> Void

  var body: some View {
    #if os(iOS)
    TooltipOutsideTapMonitor(isActive: isActive, viewFrame: viewFrame, bubbleFrame: bubbleFrame, close: close)
      .frame(width: 0, height: 0)
      .accessibilityHidden(true)
    #else
    EmptyView()
    #endif
  }
}

#if os(iOS)
import UIKit

private struct TooltipOutsideTapMonitor: UIViewRepresentable {
  let isActive: Bool
  let viewFrame: CGRect
  let bubbleFrame: CGRect
  let close: () -> Void

  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeUIView(context: Context) -> UIView {
    let view = UIView()
    view.isUserInteractionEnabled = false
    return view
  }

  func updateUIView(_ view: UIView, context: Context) {
    let coordinator = context.coordinator
    coordinator.viewFrame = viewFrame
    coordinator.bubbleFrame = bubbleFrame
    coordinator.close = close
    let isActive = isActive
    // The view joins its window after this update, so attach on the next turn.
    Task { @MainActor in coordinator.attach(to: isActive ? view.window : nil) }
  }

  static func dismantleUIView(_ view: UIView, coordinator: Coordinator) {
    coordinator.attach(to: nil)
  }

  @MainActor final class Coordinator: NSObject, UIGestureRecognizerDelegate {
    var viewFrame: CGRect = .zero
    var bubbleFrame: CGRect = .zero
    var close: () -> Void = {}
    private var recognizers: [UIGestureRecognizer] = []
    private weak var window: UIWindow?

    func attach(to newWindow: UIWindow?) {
      guard newWindow !== window || (newWindow != nil && recognizers.isEmpty) else { return }
      for recognizer in recognizers { window?.removeGestureRecognizer(recognizer) }
      recognizers = []
      window = newWindow
      guard let newWindow else { return }
      // A tap, a scroll, or a pinch that starts outside closes the bubble.
      let made: [UIGestureRecognizer] = [
        UITapGestureRecognizer(target: self, action: #selector(began(_:))),
        UIPanGestureRecognizer(target: self, action: #selector(began(_:))),
        UIPinchGestureRecognizer(target: self, action: #selector(began(_:))),
      ]
      for recognizer in made {
        // The gesture still reaches what it lands on.
        recognizer.cancelsTouchesInView = false
        recognizer.delaysTouchesBegan = false
        recognizer.delaysTouchesEnded = false
        recognizer.delegate = self
        newWindow.addGestureRecognizer(recognizer)
      }
      recognizers = made
    }

    @objc func began(_ recognizer: UIGestureRecognizer) {
      guard recognizer.state == .began || recognizer.state == .ended else { return }
      let point = recognizer.location(in: recognizer.view)
      let isTap = recognizer is UITapGestureRecognizer
      if TooltipPresenter.closesTapBubble(point: point, isTap: isTap, viewFrame: viewFrame, bubbleFrame: bubbleFrame) {
        close()
      }
    }

    func gestureRecognizer(
      _ gestureRecognizer: UIGestureRecognizer,
      shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool { true }
  }
}
#endif

/// Core's tooltip surface: the primary text color behind surface-colored
/// body text, padded `space.s1` by `space.s2`, with the container radius.
/// VoiceOver skips it.
struct TooltipBubble: View {
  let text: String
  @Environment(\.astryx) private var astryx

  var body: some View {
    SwiftUI.Text(text)
      .font(astryx.font(size: "text-body-size", 14, weight: "text-body-weight"))
      .foregroundStyle(astryx.tokens.color.backgroundSurface)
      .padding(.vertical, astryx.tokens.space.s1)
      .padding(.horizontal, astryx.tokens.space.s2)
      .background(
        RoundedRectangle(cornerRadius: astryx.tokens.radius.container, style: .continuous)
          .fill(astryx.tokens.color.textPrimary)
      )
      .fixedSize(horizontal: false, vertical: true)
      .modifier(TooltipWidth(maximum: TooltipPresenter.maximumWidth))
      .accessibilityHidden(true)
  }
}

/// Lays the bubble out at its words' own width, up to `maximum`, wrapping
/// past it, whatever width the view it decorates offers.
private struct TooltipWidth: ViewModifier {
  let maximum: CGFloat

  func body(content: Content) -> some View {
    TooltipWidthLayout(maximum: maximum) { content }
  }
}

private struct TooltipWidthLayout: Layout {
  let maximum: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard let view = subviews.first else { return .zero }
    let ideal = view.sizeThatFits(.unspecified)
    return view.sizeThatFits(ProposedViewSize(width: min(ideal.width, maximum), height: nil))
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    subviews.first?.place(at: bounds.origin, proposal: ProposedViewSize(width: bounds.width, height: bounds.height))
  }
}

/// Makes a static view a keyboard tab stop while it has a tooltip. Only a
/// `tabStop` view gets the modifier, so a control keeps its own focus, which
/// `focusable(false)` would take away; the branch follows `focus`, which a
/// call site never changes, so the view keeps one structure.
private struct TooltipTabStop: ViewModifier {
  let focus: TooltipFocus
  let isOn: Bool

  func body(content: Content) -> some View {
    if focus == .tabStop {
      content.focusable(isOn)
    } else {
      content
    }
  }
}

/// Given words as the VoiceOver hint; an empty hint, which VoiceOver does not
/// read, otherwise, so the view keeps one structure.
private struct TooltipHint: ViewModifier {
  let text: String?

  func body(content: Content) -> some View {
    content.accessibilityHint(SwiftUI.Text(verbatim: text ?? ""))
  }
}
