// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from github.com/ejc3/astryx-swift (MIT).

/// A labeled one-line text field, painted with the theme's tokens. It takes
/// core's TextInput props (`TextInputProps`): the label stays visible above
/// the field unless hidden, and is the field's accessible name either way.
public struct TextInput: View {
  public let props: TextInputProps
  @Environment(\.astryx) private var astryx
  /// Which of the field's two parts holds focus: the editable field, or the
  /// drawn read-only or disabled field.
  enum FieldFocus: Hashable { case editable, drawn }
  @FocusState private var focus: FieldFocus?
  /// Set on the first appearance, so a field that scrolls back into view in a
  /// List or Form does not announce or take focus again.
  @State private var hasAppeared = false

  public init(_ props: TextInputProps) {
    self.props = props
  }

  /// - Parameters:
  ///   - label: core's `label`, the field's visible and accessible name.
  ///   - value: core's `value`, the text the field shows.
  ///   - type: core's `type`: `text`, `email`, or `password`.
  ///   - onChange: core's `onChange`, called with each edit.
  ///   - size: core's `size`; `md` when nil.
  ///   - isLabelHidden: core's `isLabelHidden`: no visible label, the same
  ///     accessible name.
  ///   - description: core's `description`, shown between the label and the
  ///     field and read after the label.
  ///   - isOptional: core's `isOptional`, an "Optional" note after the label.
  ///   - isRequired: core's `isRequired`, a "Required" note after the label.
  ///   - onEnter: core's `onEnter`, called when the person submits the field
  ///     (Return), never while an input method is still composing.
  ///   - isDisabled: core's `isDisabled`: dimmed and not editable.
  ///   - isReadOnly: core's `isReadOnly`: shown at full strength, selectable,
  ///     not editable.
  ///   - disabledMessage: core's `disabledMessage`, why a disabled field is
  ///     disabled: a tip on hover or tap, and read after the label.
  ///   - isLoading: core's `isLoading`: a spinner, and "Loading" spoken once
  ///     when it starts.
  ///   - placeholder: core's `placeholder`.
  ///   - labelTooltip: core's `labelTooltip`, a tip on an info icon after the
  ///     label: on hover or tap.
  ///   - status: core's `status`: a colored border and status icon, and its
  ///     message below the field.
  ///   - statusVariant: core's `statusVariant`: the message `attached` to the
  ///     field (default), `detached` below it, or in a `tooltip` on the icon.
  ///   - hasClear: core's `hasClear`, a clear button while there is text.
  ///   - hasAutoFocus: core's `hasAutoFocus`, focus when the field appears.
  ///   - base: core's base props; `id` names the field itself.
  public init(
    label: String,
    value: String,
    type: TextInputType? = nil,
    onChange: ((String) -> Void)? = nil,
    size: TextInputSize? = nil,
    isLabelHidden: Bool? = nil,
    description: String? = nil,
    isOptional: Bool? = nil,
    isRequired: Bool? = nil,
    onEnter: (() -> Void)? = nil,
    isDisabled: Bool? = nil,
    isReadOnly: Bool? = nil,
    disabledMessage: String? = nil,
    isLoading: Bool? = nil,
    placeholder: String? = nil,
    labelTooltip: String? = nil,
    status: TextInputStatus? = nil,
    statusVariant: TextInputStatusVariant? = nil,
    hasClear: Bool? = nil,
    hasAutoFocus: Bool? = nil,
    base: AstryxBaseProps = AstryxBaseProps()
  ) {
    self.init(
      TextInputProps(
        type: type,
        label: label,
        value: value,
        onChange: onChange,
        size: size,
        isLabelHidden: isLabelHidden,
        description: description,
        isOptional: isOptional,
        isRequired: isRequired,
        onEnter: onEnter,
        isDisabled: isDisabled,
        isReadOnly: isReadOnly,
        disabledMessage: disabledMessage,
        isLoading: isLoading,
        placeholder: placeholder,
        labelTooltip: labelTooltip,
        status: status,
        statusVariant: statusVariant,
        hasClear: hasClear,
        hasAutoFocus: hasAutoFocus,
        base: base
      )
    )
  }

  var isDisabled: Bool { props.isDisabled == true }
  /// Disabled wins when both are set, as in core.
  var isReadOnly: Bool { props.isReadOnly == true && !isDisabled }
  var statusVariant: TextInputStatusVariant { props.statusVariant ?? .attached }

  public var body: some View {
    SwiftUI.VStack(alignment: .leading, spacing: astryx.tokens.space.s1) {
      if props.isLabelHidden != true {
        labelRow
      }
      // A hidden label hides the description with it, as core's field does;
      // VoiceOver still reads it on the field. A shown description is also
      // its own text in the reading order, as core's is.
      if props.isLabelHidden != true, let description = props.description {
        Text(description, type: .supporting, color: .secondary)
      }
      SwiftUI.VStack(alignment: .leading, spacing: 0) {
        // Base `isHidden` targets the control, as `id` does: the control and
        // its buttons leave layout and focus, while the label, description,
        // and status stay (AST-082 FR7).
        if !hidesControl {
          fieldRow
        }
        statusMessage
      }
    }
    .onAppear {
      guard !hasAppeared else { return }
      hasAppeared = true
      if props.hasAutoFocus == true, !hidesControl { focus = isDrawn ? .drawn : .editable }
      // A field that appears busy says so, as core announces a busy start.
      if props.isLoading == true { AccessibilityNotification.Announcement(AstryxStrings.spinnerLoading).post() }
      // A status message already present when the field appears is
      // announced too, as core's field status does.
      if let announcement = statusAnnouncement { announce(announcement) }
    }
    .onChange(of: props.isLoading == true) { _, loading in
      if loading { AccessibilityNotification.Announcement(AstryxStrings.spinnerLoading).post() }
    }
    .onChange(of: statusAnnouncement) { _, announcement in
      // A status message that appears or changes is announced: an error at
      // once, others when VoiceOver is free, as core's field status does.
      if let announcement { announce(announcement) }
    }
  }

  // MARK: Label

  /// The note after the label: "Optional" or "Required".
  /// `isOptional` wins when both are set, as in core.
  var labelNote: String? {
    if props.isOptional == true { return AstryxStrings.fieldOptional }
    if props.isRequired == true { return AstryxStrings.fieldRequired }
    return nil
  }

  /// The status message to announce when the field appears with it, and when
  /// its words or its type change.
  struct StatusAnnouncement: Equatable {
    var message: String
    var type: TextInputStatusType
    var isError: Bool { type == .error }
  }

  var statusAnnouncement: StatusAnnouncement? {
    guard let status = props.status, let message = status.message else { return nil }
    return StatusAnnouncement(message: message, type: status.type)
  }

  /// Posts a status message: an error at once, others when VoiceOver is free.
  func announce(_ announcement: StatusAnnouncement) {
    var words = AttributedString(announcement.message)
    words.accessibilitySpeechAnnouncementPriority = announcement.isError ? .high : .default
    AccessibilityNotification.Announcement(words).post()
  }

  private var labelRow: some View {
    SwiftUI.HStack(alignment: .firstTextBaseline, spacing: astryx.tokens.space.s1) {
      // The field reads the label and its note, so VoiceOver skips them here
      // while the field shows; with the field hidden they are read as text.
      Text(props.label, type: .label, color: isDisabled ? .disabled : .secondary, weight: .medium)
        .accessibilityHidden(!hidesControl)
      if let note = labelNote {
        Text("∙ \(note)", type: .supporting, color: .secondary, weight: .normal)
          .accessibilityHidden(!hidesControl)
      }
      if let tip = props.labelTooltip {
        tipIcon(tip, icon: "info", label: tip)
          .foregroundStyle(astryx.tokens.color.textSecondary)
      }
    }
  }

  // MARK: Field

  /// The field's accessible name: the label and its note, as core's label
  /// element names the input.
  var accessibilityName: String {
    labelNote.map { "\(props.label), \($0)" } ?? props.label
  }

  /// The label VoiceOver reads on the field: the name, then an error, since
  /// SwiftUI has no invalid state and a hint is skipped with Speak Hints off.
  var accessibilityLabelText: String {
    guard let status = props.status, status.type == .error else { return accessibilityName }
    return "\(accessibilityName), \(status.message ?? AstryxStrings.statusButton(.error))"
  }

  /// What VoiceOver reads after the name: the description, the status message,
  /// and the disabled reason, in core's `aria-describedby` order.
  /// An error leads, since SwiftUI has no invalid state to expose: its
  /// message, or the error status name when it has none. A read-only field
  /// says so, as core does where a control cannot expose read-only.
  var accessibilityDescription: String {
    var parts: [String] = []
    if let description = props.description { parts.append(description) }
    if let status = props.status, status.type != .error, let message = status.message { parts.append(message) }
    if isReadOnly { parts.append(AstryxStrings.inputReadOnly) }
    if isDisabled, let reason = props.disabledMessage { parts.append(reason) }
    return parts.joined(separator: ", ")
  }

  /// Edits reach `onChange` only while the field can be edited.
  var text: Binding<String> {
    Binding(
      get: { props.value },
      set: { newValue in
        guard !isDisabled, !isReadOnly else { return }
        props.onChange?(newValue)
      }
    )
  }

  private var fieldRow: some View {
    let shape = RoundedRectangle(cornerRadius: astryx.tokens.radius.element, style: .continuous)
    return SwiftUI.HStack(spacing: astryx.tokens.space.s2) {
      field
        .font(astryx.font(TypeStyle(astryx.tokens.font.body, families: astryx.tokens.font.family.body)))
        .foregroundStyle(astryx.tokens.color.textPrimary)
        .onSubmit { props.onEnter?() }
        .accessibilityLabel(SwiftUI.Text(accessibilityLabelText))
        .accessibilityHint(SwiftUI.Text(accessibilityDescription))
        .astryxIdentifier(props.base.id)
      if props.isLoading == true {
        ProgressView().controlSize(.small).accessibilityHidden(true)
      }
      // Trailing controls sit side by side, each across its own 44-point
      // target, so no two tap regions overlap.
      SwiftUI.HStack(spacing: 0) {
        if showsClear {
          SwiftUI.Button {
            props.onChange?("")
            focus = .editable
          } label: {
            icon("close").frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .foregroundStyle(astryx.tokens.color.textSecondary)
          .astryxTooltip(AstryxStrings.clearTooltip, focus: .control)
          .accessibilityLabel(SwiftUI.Text(AstryxStrings.clearLabel(props.label)))
        }
        statusIcon
          .frame(minWidth: hasTrailingButtons ? 44 : nil)
      }
    }
    .padding(.leading, astryx.tokens.space.s3)
    .padding(.trailing, hasTrailingButtons ? 0 : astryx.tokens.space.s3)
    .frame(minHeight: max(44, height * astryx.textScale))
    .background(
      shape.strokeBorder(borderColor, lineWidth: astryx.tokens.size.borderWidth)
    )
    .opacity(isDisabled ? 0.5 : 1)
    // A disabled field shows its reason in the shared tooltip on hover, on
    // keyboard focus of its drawn field, and on a tap; VoiceOver reads the
    // reason on the field.
    .astryxTooltip(isDisabled ? props.disabledMessage : nil, focus: reasonTooltipFocus, touch: .tap)
  }

  /// How keyboard focus opens the disabled reason: the row holds the drawn
  /// field, which takes the focus, so focus inside the row opens it, as
  /// Thumbnail's tooltip does for its parts.
  var reasonTooltipFocus: TooltipFocus { .inside(focus == .drawn) }

  /// Whether the field row ends in buttons, whose 44-point targets reach its
  /// edge in place of the trailing padding.
  var hasTrailingButtons: Bool {
    showsClear || (statusVariant == .tooltip && props.status?.message != nil)
  }

  /// A disabled field keeps its focus stop, as core's disabled input does
  /// (`aria-disabled`), so keyboard users reach it and its reason.
  var keepsFocusWhileDisabled: Bool { isDisabled }

  /// Base `isHidden` hides the field control, TextInput's base target.
  var hidesControl: Bool { props.base.isHidden == true }

  var showsClear: Bool {
    props.hasClear == true && !props.value.isEmpty && !isDisabled && !isReadOnly
  }

  var height: CGFloat {
    switch props.size ?? .md {
    case .sm: astryx.tokens.size.elementSm
    case .md: astryx.tokens.size.elementMd
    case .lg: astryx.tokens.size.elementLg
    }
  }

  var borderColor: Color {
    let color = astryx.tokens.color
    guard !isDisabled, let status = props.status else { return color.borderEmphasized }
    // The status border role, at 3:1 or more on the page (theme tokens INV11).
    switch status.type {
    case .error: return color.borderError
    case .warning: return color.borderWarning
    case .success: return color.borderSuccess
    }
  }

  /// Whether the field draws its value instead of the editable field.
  var isDrawn: Bool { isReadOnly || keepsFocusWhileDisabled }

  /// Both parts stay in one view structure, so a field that becomes read-only
  /// or disabled keeps its identity and its focus moves to the drawn part, as
  /// core keeps focus on an input that becomes disabled (`spec:AST-085`).
  private var field: some View {
    ZStack(alignment: .leading) {
      editableField
        .focused($focus, equals: .editable)
        .disabled(isDrawn)
        .opacity(isDrawn ? 0 : 1)
        .accessibilityHidden(isDrawn)
      readOnlyField
        .focusable(isDrawn)
        .focused($focus, equals: .drawn)
        .opacity(isDrawn ? 1 : 0)
        .allowsHitTesting(isDrawn)
        .accessibilityHidden(!isDrawn)
    }
    .onChange(of: isDrawn) { _, drawn in
      if focus != nil { focus = drawn ? .drawn : .editable }
    }
  }

  @ViewBuilder private var editableField: some View {
    let prompt = props.placeholder.map {
      SwiftUI.Text($0).foregroundStyle(astryx.tokens.color.textSecondary)
    }
    switch props.type ?? .text {
    case .password:
      SecureField("", text: text, prompt: prompt)
        .textContentType(.password)
    case .email:
      TextField("", text: text, prompt: prompt)
        .textContentType(.emailAddress)
        .autocorrectionDisabled()
        #if os(iOS)
        .keyboardType(.emailAddress)
        .textInputAutocapitalization(.never)
        #endif
    case .text:
      TextField("", text: text, prompt: prompt)
    }
  }

  /// What a read-only field shows: the value, masked for a password.
  var readOnlyText: String {
    props.type == .password ? String(repeating: "\u{2022}", count: props.value.count) : props.value
  }

  /// Whether a read-only field shows its placeholder: when it has no value.
  var showsReadOnlyPlaceholder: Bool { props.value.isEmpty && props.placeholder != nil }

  /// Read-only or disabled: the value, never editable, with the placeholder
  /// when empty. It keeps a focus stop, as core's read-only and disabled
  /// inputs do, without raising a keyboard; Return runs `onEnter` only while
  /// read-only. VoiceOver reads a SwiftUI text field in its place, dimmed when
  /// disabled, with "Read only" or the disabled reason in its description,
  /// since a SwiftUI text field cannot be read-only and a disabled one takes
  /// no focus. A password stays masked and cannot be selected or copied.
  @ViewBuilder private var readOnlyField: some View {
    let shown = showsReadOnlyPlaceholder
      ? SwiftUI.Text(props.placeholder ?? "").foregroundStyle(astryx.tokens.color.textSecondary)
      : SwiftUI.Text(readOnlyText)
    // One line, as the field it stands in for: it stays laid out under the
    // editable field, so a long value must not make that field grow taller.
    let text = shown
      .lineLimit(1)
      .frame(maxWidth: .infinity, alignment: .leading)
      .onKeyPress(.return) {
        guard isReadOnly else { return .ignored }
        props.onEnter?()
        return .handled
      }
      // VoiceOver reads it as the platform's text field: dimmed when
      // disabled, a secure field for a password, with the name and the
      // description the field reads in every state.
      .accessibilityRepresentation { accessibleField }
    if props.type == .password {
      text.textSelection(.disabled)
    } else {
      text.textSelection(.enabled)
    }
  }

  /// What VoiceOver reads for a read-only or disabled field: which platform
  /// field, whether it is dimmed, and its label, value, and description.
  struct AccessibleField: Equatable {
    enum Kind: Equatable { case text, secure }
    var kind: Kind
    var isDimmed: Bool
    var label: String
    var value: String
    var hint: String
  }

  var accessibleFieldDescription: AccessibleField {
    AccessibleField(
      kind: props.type == .password ? .secure : .text,
      isDimmed: isDisabled,
      label: accessibilityLabelText,
      value: props.value,
      hint: accessibilityDescription
    )
  }

  /// The platform text field VoiceOver reads for a read-only or disabled field.
  @ViewBuilder private var accessibleField: some View {
    let field = accessibleFieldDescription
    let value = Binding.constant(field.value)
    Group {
      switch field.kind {
      case .secure: SecureField(field.label, text: value)
      case .text: TextField(field.label, text: value)
      }
    }
    .disabled(field.isDimmed)
    .accessibilityHint(SwiftUI.Text(field.hint))
  }

  // MARK: Status

  /// The status icon in the field: plain when attached, a tip button when the
  /// message shows in a tip, and none when detached (its message has one).
  @ViewBuilder private var statusIcon: some View {
    if let status = props.status, statusVariant != .detached {
      if statusVariant == .tooltip, let message = status.message {
        tipIcon(message, icon: status.type.rawValue, label: AstryxStrings.statusButton(status.type), inField: true, isButton: true)
          .foregroundStyle(statusColor(status.type))
      } else {
        icon(status.type.rawValue)
          .foregroundStyle(statusColor(status.type))
          .accessibilityHidden(true)
      }
    }
  }

  /// The message box below the field, attached to it or detached from it.
  @ViewBuilder private var statusMessage: some View {
    if let status = props.status, let message = status.message, statusVariant != .tooltip {
      let detached = statusVariant == .detached
      let radius = astryx.tokens.radius.element
      SwiftUI.HStack(alignment: .firstTextBaseline, spacing: astryx.tokens.space.s1) {
        if detached {
          icon(status.type.rawValue).accessibilityHidden(true)
        }
        SwiftUI.Text(message)
          .font(astryx.font(TypeStyle(astryx.tokens.font.supporting, families: astryx.tokens.font.family.body)))
      }
      .foregroundStyle(messageColor(status.type))
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, astryx.tokens.space.s2)
      .padding(.vertical, astryx.tokens.space.s2)
      .background(
        UnevenRoundedRectangle(
          topLeadingRadius: detached ? radius : 0,
          bottomLeadingRadius: radius,
          bottomTrailingRadius: radius,
          topTrailingRadius: detached ? radius : 0,
          style: .continuous
        )
        .fill(messageGround(status.type))
      )
      .padding(.top, detached ? astryx.tokens.space.s1 : 0)
      // The message is also its own text in the reading order, as core's is.
      .accessibilityElement(children: .combine)
    }
  }

  /// The status icon role on the page (theme tokens INV11).
  func statusColor(_ type: TextInputStatusType) -> Color {
    let color = astryx.tokens.color
    switch type {
    case .error: return color.iconError
    case .warning: return color.iconWarning
    case .success: return color.iconSuccess
    }
  }

  /// Content on the muted status ground, at 4.5:1 or more (theme tokens INV11).
  func messageColor(_ type: TextInputStatusType) -> Color {
    let color = astryx.tokens.color
    switch type {
    case .error: return color.onErrorMuted
    case .warning: return color.onWarningMuted
    case .success: return color.onSuccessMuted
    }
  }

  func messageGround(_ type: TextInputStatusType) -> Color {
    let color = astryx.tokens.color
    switch type {
    case .error: return color.errorMuted
    case .warning: return color.warningMuted
    case .success: return color.successMuted
    }
  }

  // MARK: Tips

  /// An icon that shows `text` in the shared Astryx tooltip: on hover with a
  /// pointer, on keyboard focus (it is a tab stop), and on a direct tap, as
  /// core's tooltip icon does. VoiceOver reads it as `label` with `text` as
  /// the hint. In the field row it lays out across its whole 44-point target;
  /// beside the label it reaches 44 points without growing the row.
  /// A status tip is a button, as core's status icon is a `<button>`:
  /// activating it with VoiceOver speaks its message.
  private func tipIcon(_ text: String, icon name: String, label: String, inField: Bool = false, isButton: Bool = false) -> some View {
    let tip = TipAccessibility(text: text, label: label, isButton: isButton)
    return icon(name)
      .frame(minWidth: inField ? 44 : nil, minHeight: inField ? 44 : nil)
      .contentShape(Rectangle())
      .astryxMinimumHitArea(inField ? 44 : iconSide)
      .accessibilityElement()
      .accessibilityLabel(SwiftUI.Text(tip.label))
      .accessibilityAddTraits(tip.isButton ? .isButton : [])
      .accessibilityAction {
        if tip.isButton { AccessibilityNotification.Announcement(tip.text).post() }
      }
      .astryxTooltip(text, hint: tip.hint, focus: .tabStop, touch: .tap)
  }

  /// What VoiceOver gets for a tip icon: its name, whether it is a button, and
  /// its words as the hint unless they are the name.
  struct TipAccessibility: Equatable {
    var text: String
    var label: String
    var isButton: Bool
    var hint: String? { label == text ? nil : text }
  }

  /// The tooltip-variant status tip's accessibility, for the current status.
  var statusTipAccessibility: TipAccessibility? {
    guard statusVariant == .tooltip, let status = props.status, let message = status.message else { return nil }
    return TipAccessibility(text: message, label: AstryxStrings.statusButton(status.type), isButton: true)
  }

  /// A shared icon at the supporting text size: the theme's SF Symbol or app
  /// asset, else the default symbol; a name nothing maps draws nothing.
  var iconSide: CGFloat { astryx.tokens.font.supporting.size * astryx.textScale }

  @ViewBuilder private func icon(_ name: String) -> some View {
    let side = iconSide
    if let image = astryx.icon(name) {
      image.sized(side).font(.system(size: side))
    }
  }
}
