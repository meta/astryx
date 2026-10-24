// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from github.com/ejc3/astryx-swift (MIT).

import SwiftUI

/// Core's `TextInput` types.
public enum AstryxTextInputType: String, CaseIterable, Sendable {
  case text
  case email
  case password
}

/// A labeled one-line text field, painted with the theme's tokens. The label
/// stays visible above the field and is the field's accessibility label.
public struct AstryxTextInput: View {
  let label: String
  @Binding var value: String
  let type: AstryxTextInputType
  let size: AstryxButtonSize
  let placeholder: String?
  let isDisabled: Bool
  @Environment(\.astryx) private var astryx

  public init(
    label: String,
    value: Binding<String>,
    type: AstryxTextInputType = .text,
    size: AstryxButtonSize = .md,
    placeholder: String? = nil,
    isDisabled: Bool = false
  ) {
    self.label = label
    self._value = value
    self.type = type
    self.size = size
    self.placeholder = placeholder
    self.isDisabled = isDisabled
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: astryx.space(1)) {
      AstryxText(label, type: .label, color: .secondary)
        .accessibilityHidden(true)
      field
        .font(astryx.font(size: "text-body-size", 14, weight: "text-body-weight"))
        .foregroundStyle(astryx.color("color-text-primary"))
        .padding(.horizontal, astryx.space(3))
        .frame(minHeight: max(44, astryx.size(size.heightToken, size.fallbackHeight) * astryx.textScale))
        .background(
          RoundedRectangle(cornerRadius: astryx.size("radius-element", 8), style: .continuous)
            .strokeBorder(astryx.color("color-border-emphasized"), lineWidth: astryx.size("border-width", 1))
        )
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.5 : 1)
        .accessibilityLabel(Text(accessibilityText))
    }
  }

  /// The field's accessible name: its visible label, which VoiceOver reads
  /// on the field itself rather than as separate text.
  var accessibilityText: String { label }

  @ViewBuilder private var field: some View {
    let prompt = placeholder.map { Text($0).foregroundStyle(astryx.color("color-text-secondary")) }
    switch type {
    case .password:
      SecureField("", text: $value, prompt: prompt)
        .textContentType(.password)
    case .email:
      TextField("", text: $value, prompt: prompt)
        .textContentType(.emailAddress)
        .autocorrectionDisabled()
        #if os(iOS)
        .keyboardType(.emailAddress)
        .textInputAutocapitalization(.never)
        #endif
    case .text:
      TextField("", text: $value, prompt: prompt)
    }
  }
}
