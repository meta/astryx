// Copyright (c) Meta Platforms, Inc. and affiliates.

import AstryxNative
import SwiftUI

/// A square preview of an image attachment (core `Thumbnail`): the image,
/// a placeholder when there is none or it fails, a loading look, an optional
/// remove button, and an optional tap to open it.
///
/// ```swift
/// Thumbnail(src: "https://example.com/beach.jpg", alt: "Beach at sunset", label: "beach.jpg")
/// Thumbnail(src: url, label: "beach.jpg", isLoading: true)   // uploading
/// Thumbnail(src: url, label: "beach.jpg", onClick: { open() }, onRemove: { remove() })
/// ```
public struct Thumbnail: View {
  /// The contract the view draws, the same for both initializers.
  public let props: ThumbnailProps
  @Environment(\.astryx) private var astryx
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.colorSchemeContrast) private var contrast
  @State private var isHovering = false
  @FocusState private var focusedPart: Part?

  /// The thumbnail's focusable parts.
  enum Part: Hashable { case open, remove }

  /// A thumbnail from its labeled props.
  /// - Parameters:
  ///   - src: The image URL (core `src`).
  ///   - alt: What the image shows; without it the image is decorative (core `alt`).
  ///   - label: The thumbnail's name, such as a file name; also its tooltip (core `label`).
  ///   - isLoading: A placeholder while there is no image, or an upload look over the image (core `isLoading`).
  ///   - isDisabled: Dims the thumbnail and turns off its tap and remove button (core `isDisabled`).
  ///   - showRemoveOn: `hover` shows the remove button under a pointer and always on touch; `always` shows it at rest; `nil` is `hover` (core `showRemoveOn`).
  ///   - onClick: Makes the thumbnail a button that runs this; a single trailing closure is this (core `onClick`).
  ///   - onRemove: Adds a remove button that runs this (core `onRemove`).
  public init(
    src: String? = nil,
    alt: String? = nil,
    label: String? = nil,
    isLoading: Bool? = nil,
    isDisabled: Bool? = nil,
    showRemoveOn: ThumbnailShowRemoveOn? = nil,
    onClick: (() -> Void)? = nil,
    onRemove: (() -> Void)? = nil
  ) {
    self.init(
      ThumbnailProps(
        src: src, alt: alt, label: label, onRemove: onRemove, onClick: onClick, isLoading: isLoading,
        isDisabled: isDisabled, showRemoveOn: showRemoveOn))
  }

  /// A thumbnail from its generated contract, for generated and wire-driven callers.
  public init(_ props: ThumbnailProps) {
    self.props = props
  }

  public var body: some View {
    if props.base.isHidden != true {
      ZStack(alignment: .topTrailing) {
        tile
        if hasRemove {
          // Mounted while disabled too, inert, so focus on it stays put and
          // VoiceOver reads it dimmed (AST-085; Swift accessibility X2).
          removeButton
            .disabled(!removes)
            .padding(astryx.tokens.space.s1)
            .opacity(isRemoveVisible ? 1 : 0)
        }
      }
      .frame(width: Thumbnail.side, height: Thumbnail.side)
      .opacity(isDisabled ? 0.5 : 1)
      .onHover { isHovering = $0 }
      // The Astryx tooltip (library/tooltip.spec.md), as core's Thumbnail wraps
      // itself in core's tooltip: not a tab stop, and core's `auto` touch opens
      // it on a tap, since the wrapper is not a control, while an open action
      // still runs. The label is already in the name, so no hint.
      .astryxTooltip(Thumbnail.meaningful(props.label), focus: .inside(focusedPart != nil), isDisabled: isDisabled)
      .accessibilityElement(children: .contain)
      .accessibilityLabel(accessibleName)
      .modifier(ThumbnailIdentifier(id: props.base.id))
      .onChange(of: showUploadOverlay, initial: true) { _, isUploading in
        // AST-086 FR8: each busy start is announced once, in place of the
        // decorative spinner, including one already uploading as the
        // thumbnail appears, as core announces on mount.
        if isUploading {
          AccessibilityNotification.Announcement(AstryxStrings.spinnerLoading).post()
        }
      }
    }
  }

  /// The image area, with a button over it that opens the thumbnail when it
  /// has `onClick`. The button stays mounted while loading or disabled, inert,
  /// so focus on it stays put and VoiceOver reads it dimmed (AST-085; Swift
  /// accessibility X2), and the picture never reloads as those states change.
  /// The button names the tile, so the picture is hidden.
  private var tile: some View {
    picture
      .accessibilityHidden(hasOpenButton)
      .overlay {
        if let onClick = props.onClick {
          SwiftUI.Button(action: onClick) { Color.clear.contentShape(Rectangle()) }
            .buttonStyle(ThumbnailPressStyle(radius: radius, pressed: astryx.tokens.color.overlayPressed))
            .disabled(!isInteractive)
            .focused($focusedPart, equals: .open)
            .accessibilityLabel(openLabel)
        }
      }
  }

  private var picture: some View {
    ZStack {
      astryx.tokens.color.neutral
      if showSkeleton {
        ThumbnailSkeleton(color: skeletonColor, isStill: reduceMotion)
      } else if let url = imageURL {
        AsyncImage(url: url) { phase in
          if let image = phase.image {
            image.resizable().scaledToFill()
              // Cropped to the tile first, so the inset edge below follows
              // the tile on all four sides, whatever the photo's shape.
              .frame(width: Thumbnail.side, height: Thumbnail.side)
              .clipped()
              .modifier(ThumbnailImageName(alt: Thumbnail.meaningful(props.alt)))
              .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                  .strokeBorder(astryx.tokens.color.border, lineWidth: 1)
              )
          } else if phase.error != nil {
            placeholder
          } else {
            Color.clear
          }
        }
      } else {
        placeholder
      }
      if showUploadOverlay {
        astryx.tokens.color.overlay
        ProgressView()
          .progressViewStyle(.circular)
          .controlSize(.small)
          // Core's small spinner: it stays inside the fixed-size tile at any
          // text size.
          .dynamicTypeSize(...DynamicTypeSize.large)
          .tint(astryx.tokens.color.onDark)
          .accessibilityHidden(true)
      }
    }
    .frame(width: Thumbnail.side, height: Thumbnail.side)
    .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
  }

  /// An image silhouette in the secondary icon color.
  private var placeholder: some View {
    Image(systemName: "photo.fill")
      .resizable()
      .scaledToFit()
      .frame(width: 24, height: 24)
      .foregroundStyle(astryx.tokens.color.iconSecondary)
      .accessibilityHidden(true)
  }

  private var removeButton: some View {
    SwiftUI.Button(action: { props.onRemove?() }) {
      // Core's remove glyph: the shared `close` icon at `xsm`, which the
      // theme can remap (AST-082 FR17).
      Icon(.close, size: .xsm)
        .foregroundStyle(astryx.tokens.color.onDark)
        // The button keeps its 20-point size at any text size.
        .dynamicTypeSize(.large)
        .frame(width: 20, height: 20)
        .background(
          RoundedRectangle(cornerRadius: max(0, radius - astryx.tokens.space.s1), style: .continuous)
            .fill(astryx.tokens.color.overlay)
        )
    }
    .buttonStyle(.plain)
    .focused($focusedPart, equals: .remove)
    // A 44 by 44 point target without moving the drawn button (Swift accessibility, X7).
    .contentShape(.interaction, Rectangle().inset(by: -12))
    .accessibilityLabel(removeLabel)
  }

  private var radius: CGFloat { astryx.tokens.radius.element }

  /// Core's skeleton color; under Increase Contrast it moves 30% toward the
  /// primary text color, as core's does under `prefers-contrast: more`.
  var skeletonColor: Color {
    Thumbnail.skeletonColor(astryx.tokens, increasedContrast: contrast == .increased)
  }

  nonisolated static func skeletonColor(_ tokens: Tokens, increasedContrast: Bool) -> Color {
    guard increasedContrast else { return tokens.color.skeleton }
    return mix(tokens.color.skeleton, tokens.color.textPrimary, by: 0.3)
  }

  /// `amount` of `other` mixed into `base`, in sRGB, as CSS `color-mix` does.
  nonisolated static func mix(_ base: Color, _ other: Color, by amount: Double) -> Color {
    let environment = EnvironmentValues()
    let a = base.resolve(in: environment), b = other.resolve(in: environment)
    let t = Float(amount)
    return Color(
      .sRGB,
      red: Double(a.red + (b.red - a.red) * t),
      green: Double(a.green + (b.green - a.green) * t),
      blue: Double(a.blue + (b.blue - a.blue) * t),
      opacity: Double(a.opacity + (b.opacity - a.opacity) * t)
    )
  }

  var isDisabled: Bool { props.isDisabled == true }
  var isLoading: Bool { props.isLoading == true }
  var imageURL: URL? {
    guard let src = props.src, !src.isEmpty else { return nil }
    return URL(string: src)
  }
  /// Loading with no image yet: a skeleton.
  var showSkeleton: Bool { isLoading && props.src == nil }
  /// Loading over an image: the upload look.
  var showUploadOverlay: Bool { isLoading && props.src != nil }
  /// A tap opens the thumbnail unless it is disabled or loading, as core does.
  var isInteractive: Bool { props.onClick != nil && !isDisabled && !isLoading }


  /// Whether the open button is mounted: whenever there is `onClick`.
  var hasOpenButton: Bool { props.onClick != nil }
  /// Whether the remove button is mounted: whenever there is `onRemove`.
  var hasRemove: Bool { props.onRemove != nil }
  /// Whether the remove button acts: mounted and not disabled.
  var removes: Bool { hasRemove && !isDisabled }

  /// `hover` shows the remove button under a pointer, while either button
  /// has keyboard focus, and always on touch devices, as core does; `always`
  /// shows it at rest.
  var isRemoveVisible: Bool {
    Thumbnail.isRemoveVisible(
      showRemoveOn: props.showRemoveOn ?? .hover, isTouch: Thumbnail.isTouchDevice, isHovering: isHovering,
      isFocused: focusedPart != nil, isDisabled: isDisabled)
  }

  /// A pointer reveals the remove button only on an enabled thumbnail, as
  /// core turns pointer events off on a disabled one.
  nonisolated static func isRemoveVisible(
    showRemoveOn: ThumbnailShowRemoveOn, isTouch: Bool, isHovering: Bool, isFocused: Bool, isDisabled: Bool = false
  ) -> Bool {
    showRemoveOn == .always || isTouch || (isHovering && !isDisabled) || isFocused
  }

  /// The thumbnail's name: label and alt, else either, else core's fallback.
  var accessibleName: String {
    switch (Thumbnail.meaningful(props.label), Thumbnail.meaningful(props.alt)) {
    case let (label?, alt?): "\(label) — \(alt)"
    case let (label?, nil): label
    case let (nil, alt?): alt
    case (nil, nil): AstryxStrings.thumbnailFallbackName
    }
  }

  var openLabel: String { AstryxStrings.thumbnailOpen(accessibleName) }
  var removeLabel: String { AstryxStrings.thumbnailRemove(accessibleName) }

  /// Core's thumbnail side in points.
  static var side: CGFloat { 64 }

  static var isTouchDevice: Bool {
    #if os(iOS)
    true
    #else
    false
    #endif
  }

  nonisolated static func meaningful(_ value: String?) -> String? {
    guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    return value
  }
}

/// Core's skeleton while the image has not arrived: `color.skeleton` at 25%
/// opacity; after a second it climbs to 92.5% in ten equal steps and back,
/// over and over, as core's does. Still at rest under Reduce Motion.
struct ThumbnailSkeleton: View {
  let color: Color
  let isStill: Bool
  @State private var appeared = Date()

  /// Core's resting and brightest opacities.
  nonisolated static var restingOpacity: Double { 0.25 }
  nonisolated static var brightestOpacity: Double { 0.925 }
  /// Core's wait before the pulse starts, so fast loads never flash.
  nonisolated static var delay: Double { 1 }
  /// One way of the pulse: core's default `duration-medium-max`. The Swift
  /// theme carries no motion tokens yet.
  nonisolated static var pulseDuration: Double { 0.55 }

  var body: some View {
    TimelineView(.animation(paused: isStill)) { context in
      color.opacity(
        isStill ? Self.restingOpacity : Self.opacity(elapsed: context.date.timeIntervalSince(appeared)))
    }
    .onAppear { appeared = Date() }
    .accessibilityHidden(true)
  }

  /// The opacity `elapsed` seconds after the skeleton appears: at rest for
  /// the delay, then core's ten held steps up and back down.
  nonisolated static func opacity(elapsed: Double) -> Double {
    let time = elapsed - delay
    guard time > 0 else { return restingOpacity }
    let phase = time.truncatingRemainder(dividingBy: 2 * pulseDuration) / pulseDuration
    let climb = phase <= 1 ? phase : 2 - phase
    let step = min((climb * 10).rounded(.down), 9)
    return restingOpacity + step * (brightestOpacity - restingOpacity) / 9
  }
}

/// Paints the pressed overlay over the picture.
private struct ThumbnailPressStyle: ButtonStyle {
  let radius: CGFloat
  let pressed: Color

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .overlay(
        RoundedRectangle(cornerRadius: radius, style: .continuous)
          .fill(configuration.isPressed ? pressed : .clear)
      )
  }
}

/// The image reads as its `alt`; without one it is decorative.
private struct ThumbnailImageName: ViewModifier {
  let alt: String?

  func body(content: Content) -> some View {
    if let alt {
      content.accessibilityLabel(alt)
    } else {
      content.accessibilityHidden(true)
    }
  }
}

/// The base `id` becomes the accessibility identifier (AST-082 FR7).
private struct ThumbnailIdentifier: ViewModifier {
  let id: String?

  func body(content: Content) -> some View {
    if let id {
      content.accessibilityIdentifier(id)
    } else {
      content
    }
  }
}
