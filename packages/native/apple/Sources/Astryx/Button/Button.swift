// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from github.com/ejc3/astryx-swift (MIT).

/// A labeled action, painted with the theme's tokens. It takes core's Button
/// props (`ButtonProps`). With `href` it is a link the system opens. The tap
/// area reaches the platform's 44-by-44-point minimum even when the drawn
/// button is smaller. On iOS and iPadOS 26 and later, in a system bar or a
/// container `astryxFloating()` marks, it draws the system's Liquid Glass in
/// place of its own fill, keeping its variant's meaning.
public struct Button: View {
  public let props: ButtonProps
  @Environment(\.astryx) private var astryx
  @Environment(\.astryxFloating) private var isFloating
  @Environment(\.accessibilityReduceTransparency) private var reducesTransparency
  @Environment(\.colorSchemeContrast) private var contrast
  /// Whether a system bar hosts this Button, as its bar probe reports.
  @State private var isInBar = false
  /// Which part of a Button with `href` holds focus: its link, or the button
  /// it draws while disabled.
  enum Part: Hashable { case link, button }
  @FocusState private var focus: Part?

  public init(_ props: ButtonProps) {
    self.props = props
  }

  /// - Parameters:
  ///   - label: core's `label`, the button's words and accessible name.
  ///   - variant: core's `variant`; `secondary` when nil.
  ///   - size: core's `size`; `md` when nil.
  ///   - elevation: core's `elevation`, the theme's shadow at that depth.
  ///   - isLoading: core's `isLoading`: a spinner over the label, undimmed and
  ///     focusable, "Loading" spoken, presses ignored until it finishes.
  ///   - isInterruptible: core's `isInterruptible`: presses still land while
  ///     loading, so they can interrupt it.
  ///   - isDisabled: core's `isDisabled`.
  ///   - width: core's `width`: `content` (default) or `fill`, the whole width
  ///     offered.
  ///   - tooltip: core's `tooltip`: a tip on hover with a pointer, and a hint
  ///     VoiceOver reads; a tap belongs to the button, as on core's touch
  ///     screens.
  ///   - href: core's `href`: an enabled button becomes a SwiftUI `Link` the
  ///     system opens.
  ///   - base: core's base props.
  ///   - onClick: core's `onClick`, the press.
  public init(
    label: String,
    variant: ButtonVariant? = nil,
    size: ButtonSize? = nil,
    elevation: ButtonElevation? = nil,
    isLoading: Bool? = nil,
    isInterruptible: Bool? = nil,
    isDisabled: Bool? = nil,
    width: ButtonWidth? = nil,
    tooltip: String? = nil,
    href: String? = nil,
    base: AstryxBaseProps = AstryxBaseProps(),
    onClick: (() -> Void)? = nil
  ) {
    self.init(
      ButtonProps(
        label: label,
        variant: variant,
        size: size,
        elevation: elevation,
        isLoading: isLoading,
        isInterruptible: isInterruptible,
        isDisabled: isDisabled,
        width: width,
        tooltip: tooltip,
        onClick: onClick,
        href: href,
        base: base
      )
    )
  }

  var isLoading: Bool { props.isLoading == true }
  var isDisabled: Bool { props.isDisabled == true }

  /// The destination a Button with `href` opens while enabled, or nil when
  /// it has none or its destination is refused.
  var destination: URL? {
    guard let href = props.href, let safe = Self.safeDestination(href) else { return nil }
    return URL(string: safe)
  }

  /// The link an enabled button with `href` becomes. A disabled one draws a
  /// disabled button, as core draws a disabled `<button>`.
  var link: URL? { isDisabled ? nil : destination }

  /// A destination a link may open, normalized as core's shared rule does, or
  /// nil for a script URL or an HTML document in a `data:` URL, which core's
  /// navigation destinations refuse (`family:navigation-destinations` FR4).
  /// Control characters are removed and whitespace trimmed; the scheme is
  /// compared in lowercase without the spaces after its colon, which a data
  /// URL's media type ignores (`data: text/html` is HTML).
  nonisolated static func safeDestination(_ href: String) -> String? {
    let normalized = String(String.UnicodeScalarView(
      href.unicodeScalars.filter { $0.value > 0x1F && $0.value != 0x7F }
    )).trimmingCharacters(in: .whitespacesAndNewlines)
    var comparable = normalized.lowercased()
    if let colon = comparable.firstIndex(of: ":"),
       comparable[..<colon].range(of: "^[a-z][a-z0-9+.-]*$", options: .regularExpression) != nil {
      let rest = comparable[comparable.index(after: colon)...].drop { $0 == " " }
      comparable = String(comparable[...colon]) + rest
    }
    for blocked in ["javascript:", "vbscript:", "data:text/html"] where comparable.hasPrefix(blocked) {
      return nil
    }
    return normalized
  }

  public var body: some View {
    styledControl
      .background { barProbe }
      // The shared Astryx tooltip on hover and keyboard focus, as core's
      // Button tooltip; its words are the VoiceOver hint.
      .astryxTooltip(props.tooltip, hint: props.tooltip, focus: .control)
      .accessibilityLabel(SwiftUI.Text(accessibilityText))
      .accessibilityValue(SwiftUI.Text(loadingValue ?? ""))
      .onChange(of: isLoading) { _, loading in
        if loading { AccessibilityNotification.Announcement(AstryxStrings.buttonLoading).post() }
      }
      .astryxBase(props.base)
  }

  @ViewBuilder private var control: some View {
    if let destination {
      // A Button with `href` keeps its link and its disabled button in one
      // structure; only one is shown and reachable at a time, and focus moves
      // from the link to the button when it becomes disabled and back, so it
      // stays inside the component (AST-085 FR4, core Button FR10).
      ZStack {
        // A link the system opens, read as a link; while loading it stays a
        // link and opens nothing until loading ends, unless interruptible.
        SwiftUI.Link(destination: destination) { content }
          .environment(\.openURL, OpenURLAction { _ in
            let lands = acceptsPress
            if lands { props.onClick?() }
            return lands ? .systemAction : .handled
          })
          .focused($focus, equals: .link)
          .disabled(isDisabled)
          .opacity(isDisabled ? 0 : 1)
          .accessibilityHidden(isDisabled)
        plainButton
          .focused($focus, equals: .button)
          .disabled(!isDisabled)
          .opacity(isDisabled ? 1 : 0)
          .accessibilityHidden(!isDisabled)
      }
      .onChange(of: isDisabled) { _, disabled in
        if focus != nil { focus = disabled ? .button : .link }
      }
    } else {
      plainButton
    }
  }

  /// A disabled Button keeps its focus stop, as core keeps it focusable, so
  /// keyboard users reach it and its tooltip; presses never land. VoiceOver
  /// reads the platform's button, dimmed when disabled, in both states, so a
  /// focused Button that becomes disabled keeps one view structure and focus.
  private var plainButton: some View {
    SwiftUI.Button(action: activate) { content }
      .accessibilityAddTraits(Self.accessibilityTraits)
      .accessibilityRepresentation {
        SwiftUI.Button(accessibilityText, action: activate).disabled(isDisabled)
      }
  }

  private var content: some View {
    // The label keeps its place while loading so the width holds; the
    // spinner draws over it.
    SwiftUI.Text(props.label)
      .lineLimit(1)
      .opacity(isLoading ? 0 : 1)
      .overlay {
        if isLoading {
          ProgressView().controlSize(.small).tint(foreground)
        }
      }
      .modifier(SystemBarLabel(tint: systemBarTint, style: style))
  }

  /// The tint a primary or destructive Button in a bar gives the bar's
  /// glass, through SwiftUI's prominent glass style (FR7, FR8); nil
  /// elsewhere. It depends on placement and variant only, so disabling the
  /// Button keeps one view structure and its focus (FR6).
  var systemBarTint: Color? {
    guard case .glass(.barProminent(let role)) = surface else { return nil }
    return role.color(astryx.tokens)
  }

  /// The control in its style: SwiftUI's prominent glass in a bar for primary
  /// and destructive, so the bar tints its own glass; the Astryx style
  /// everywhere else.
  @ViewBuilder private var styledControl: some View {
    #if os(iOS) && compiler(>=6.2)
    if #available(iOS 26, *), let tint = systemBarTint {
      // The elevation paints beneath the system's capsule (FR11). Disabled,
      // the whole control dims and takes no touch, so the style shows no
      // press response, while it keeps its focus stop (FR6, FR11). The bar
      // draws the capsule itself, so its tint dims as well.
      control.buttonStyle(.glassProminent).tint(isDisabled ? tint.opacity(0.5) : tint)
        .astryxShadow(shadow, in: Capsule())
        .opacity(isDisabled ? 0.5 : 1)
        .allowsHitTesting(!isDisabled)
    } else {
      control.buttonStyle(style)
    }
    #else
    control.buttonStyle(style)
    #endif
  }

  private var style: AstryxButtonStyle {
    AstryxButtonStyle(
      astryx: astryx,
      height: height,
      fillsWidth: props.width == .fill,
      foreground: foreground,
      background: background,
      shadow: shadow,
      isDimmed: isDisabled,
      surface: surface
    )
  }

  /// Where this Button sits: a bar wins over a floating container, so glass
  /// never draws inside the bar's own glass.
  var placement: ButtonPlacement {
    isInBar ? .bar : isFloating ? .floating : .content
  }

  /// What draws behind the label (FR7–FR10, ORD2).
  var surface: ButtonSurface {
    ButtonSurface.resolve(
      variant: props.variant,
      placement: placement,
      glassAvailable: ButtonSurface.glassAvailable,
      prefersSolid: reducesTransparency || contrast == .increased
    )
  }

  /// Finds a system bar hosting this Button, only where glass can draw.
  @ViewBuilder private var barProbe: some View {
    #if os(iOS)
    if ButtonSurface.glassAvailable {
      ButtonBarProbe { isInBar = $0 }
        .frame(width: 0, height: 0)
        .accessibilityHidden(true)
    }
    #endif
  }

  /// The button's accessible name: its label, also while loading.
  var accessibilityText: String { props.label }

  /// The traits assistive technology gets: a button.
  static var accessibilityTraits: AccessibilityTraits { .isButton }

  /// What assistive technology reads after the label while loading: core's
  /// catalog message, in the person's language.
  var loadingValue: String? { isLoading ? AstryxStrings.buttonLoading : nil }

  /// Whether a press lands now: not while loading, unless interruptible.
  var acceptsPress: Bool { !isDisabled && (!isLoading || props.isInterruptible == true) }

  /// A disabled Button keeps its focus stop (core Button FR10).
  var keepsFocusWhileDisabled: Bool { isDisabled }

  /// Runs `onClick` when a press lands.
  func activate() {
    guard acceptsPress else { return }
    props.onClick?()
  }

  var height: CGFloat {
    let size = astryx.tokens.size
    switch props.size ?? .md {
    case .sm: return size.elementSm
    case .md: return size.elementMd
    case .lg: return size.elementLg
    }
  }

  private var foreground: Color {
    let color = astryx.tokens.color
    switch props.variant ?? .secondary {
    case .primary: return color.onAccent
    case .destructive: return color.onError
    case .secondary, .ghost: return color.textPrimary
    }
  }

  private var background: Color {
    let color = astryx.tokens.color
    switch props.variant ?? .secondary {
    case .primary: return color.accent
    case .destructive: return color.error
    case .secondary: return color.neutral
    case .ghost: return .clear
    }
  }

  var shadow: [ShadowLayer] {
    let shadow = astryx.tokens.shadow
    switch props.elevation ?? .none {
    case .none: return []
    case .low: return shadow.low
    case .med: return shadow.med
    case .high: return shadow.high
    }
  }
}

struct AstryxButtonStyle: ButtonStyle {
  let astryx: AstryxStyle
  let height: CGFloat
  let fillsWidth: Bool
  let foreground: Color
  let background: Color
  let shadow: [ShadowLayer]
  /// Draws the disabled look for a disabled Button that keeps its focus stop.
  var isDimmed = false
  /// What draws behind the label: the token look unless the Button sits in
  /// a bar or a floating container on iOS 26 (FR7–FR10).
  var surface: ButtonSurface = .token
  @Environment(\.isEnabled) private var environmentEnabled
  private var isEnabled: Bool { environmentEnabled && !isDimmed }

  func makeBody(configuration: Configuration) -> some View {
    switch surface {
    case .token:
      tokenBody(configuration, fill: background, edge: nil, keepsTapMinimum: true)
    case .solid(let role, let inBar):
      // Drawn on the surface color, so a translucent token such as
      // `color.neutral` reads as it does on a page, opaque over any content.
      tokenBody(
        configuration, fill: role.color(astryx.tokens), edge: astryx.tokens.color.borderEmphasized,
        underlay: astryx.tokens.color.backgroundSurface, keepsTapMinimum: !inBar
      )
    case .glass(.barItem):
      barItemBody(configuration, labelColor: foreground)
    case .glass(.barProminent(let role)):
      // Drawn through SwiftUI's prominent style wherever glass draws; this
      // is only a fallback, the label in the variant's color on the bar.
      barItemBody(configuration, labelColor: role.color(astryx.tokens))
    case .glass(let glass):
      glassBody(configuration, glass: glass)
    }
  }

  private var shape: RoundedRectangle {
    RoundedRectangle(cornerRadius: astryx.tokens.radius.element, style: .continuous)
  }

  /// The label in the theme's type, at least the size's height, which grows
  /// with text size, but not so far that one line becomes a tall slab.
  private func label(_ configuration: Configuration, padded: Bool, color: Color? = nil) -> some View {
    let font = astryx.tokens.font
    return configuration.label
      .font(astryx.font(TypeStyle(font.label, families: font.family.body)))
      .foregroundStyle(color ?? foreground)
      .padding(.horizontal, padded ? astryx.tokens.space.s3 : 0)
      .frame(maxWidth: fillsWidth ? .infinity : nil, minHeight: height * min(astryx.textScale, 1.4))
  }

  private func pressOpacity(_ configuration: Configuration) -> Double {
    isEnabled ? (configuration.isPressed ? 0.75 : 1) : 0.5
  }

  /// The token look, and the solid fill with an edge (FR10).
  @ViewBuilder
  private func tokenBody(
    _ configuration: Configuration, fill: Color, edge: Color?, underlay: Color? = nil, keepsTapMinimum: Bool
  ) -> some View {
    let drawn = label(configuration, padded: true)
      .background(shape.fill(fill))
      .background { if let underlay { shape.fill(underlay) } }
      .overlay { if let edge { shape.strokeBorder(edge, lineWidth: astryx.tokens.size.borderWidth) } }
      .astryxShadow(shadow, in: shape, borderWidth: edge == nil ? 0 : astryx.tokens.size.borderWidth)
      .opacity(pressOpacity(configuration))
    if keepsTapMinimum {
      // Drawn at the token size; laid out at least 44 by 44 so the whole
      // platform-minimum tap area counts.
      drawn.frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
    } else {
      // In a bar, which may offer almost no width, the label stays whole
      // (FR11).
      drawn.fixedSize(horizontal: !fillsWidth, vertical: false).contentShape(Rectangle())
    }
  }

  /// In a system bar: no fill or border, so the bar's glass is the only
  /// chrome; no Astryx padding, so the label is never cut short in a bar with
  /// room; a set elevation still paints its shadow (FR7, FR11).
  private func barItemBody(_ configuration: Configuration, labelColor: Color) -> some View {
    label(configuration, padded: false, color: labelColor)
      .fixedSize(horizontal: !fillsWidth, vertical: false)
      .astryxShadow(shadow, in: shape)
      .opacity(pressOpacity(configuration))
      .contentShape(Rectangle())
  }

  /// In a floating container: the system's glass in the token shape, tinted
  /// for primary and destructive, with the elevation shadow beneath (FR8,
  /// FR9, FR11).
  @ViewBuilder
  private func glassBody(_ configuration: Configuration, glass: ButtonGlass) -> some View {
    #if os(iOS) && compiler(>=6.2)
    if #available(iOS 26, *) {
      label(configuration, padded: true)
        .glassEffect(effect(glass), in: shape)
        .astryxShadow(shadow, in: shape)
        .opacity(isEnabled ? 1 : 0.5)
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
    } else {
      tokenBody(configuration, fill: background, edge: nil, keepsTapMinimum: true)
    }
    #else
    tokenBody(configuration, fill: background, edge: nil, keepsTapMinimum: true)
    #endif
  }

  #if os(iOS) && compiler(>=6.2)
  @available(iOS 26, *)
  private func effect(_ glass: ButtonGlass) -> Glass {
    switch glass {
    // A disabled Button keeps its focus stop but answers no touch with the
    // glass's press effect, as the bar path draws it (FR11).
    case .regular, .barItem, .barProminent: .regular.interactive(isEnabled)
    case .clear: .clear.interactive(isEnabled)
    case .prominent(let role): .regular.tint(role.color(astryx.tokens)).interactive(isEnabled)
    }
  }
  #endif
}

/// A label drawn by SwiftUI's own prominent glass style in a bar: the theme's
/// type in the variant's label color, at least the size's height, kept whole
/// or filling the width as `width` asks (FR11); the Astryx style draws all of
/// this itself elsewhere.
private struct SystemBarLabel: ViewModifier {
  let tint: Color?
  let style: AstryxButtonStyle

  func body(content: Content) -> some View {
    if tint != nil {
      let font = style.astryx.tokens.font
      content
        .font(style.astryx.font(TypeStyle(font.label, families: font.family.body)))
        .foregroundStyle(style.foreground)
        .fixedSize(horizontal: !style.fillsWidth, vertical: false)
        .frame(
          maxWidth: style.fillsWidth ? .infinity : nil,
          minHeight: style.height * min(style.astryx.textScale, 1.4)
        )
    } else {
      content
    }
  }
}
