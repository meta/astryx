---
schema_version: 3
template_version: 7
kind: component
id: component:swift/TextInput
platform_of: component:TextInput
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by: [packages/native/apple/Tests/AstryxTests/TextInputTests.swift]
modules: []
families: [family:input-fields]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093, spec:AST-085]
---

# TextInput (Swift) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `TextInput(label:value:type:onChange:size:isLabelHidden:description:isOptional:isRequired:onEnter:isDisabled:isReadOnly:disabledMessage:isLoading:placeholder:labelTooltip:status:statusVariant:hasClear:hasAutoFocus:base:)` and `TextInput(_ props: TextInputProps)`, a SwiftUI `View` in module `Astryx`. |
| Behavior                | An editable field is SwiftUI's `TextField`, or `SecureField` for a password. A read-only or disabled field draws its value, keeps a focus stop without raising a keyboard, and reads to VoiceOver as SwiftUI's text field.                                                                                   |
| End-user impact         | A person types in the platform's own field; keyboard users still reach a read-only or disabled field and its reason; VoiceOver users hear the name, any error, the description, and the state.                                                                                                               |
| Builder impact          | An app passes `value` and `onChange` as the contract types them, not a `Binding`.                                                                                                                                                                                                                            |
| Compatibility/readiness | Breaking for canary callers: a `Binding` gives way to `value` and `onChange`, as the contract types them. Draft; built and tested on macOS and the iOS Simulator.                                                                                                                                            |
| Review checks           | Reject a read-only field that raises a keyboard or accepts edits, a disabled field that leaves focus, a read-only password that shows its characters, an error only in the hint, or `.help` for a tip.                                                                                                       |
| Governing rules         | `component:TextInput` FR3–FR10, FR13, FR15; `family:input-fields` FR4; `spec:AST-085`; `spec:AST-082` FR3, FR7, FR11; `spec:AST-093` FR1–FR5; the Swift component API, tooltip, and accessibility records under `packages/native/specs/swift/library/`.                                                      |

This table is a review projection; the body below is authoritative.

## Intent

TextInput on Apple platforms is core's text field drawn with SwiftUI's own
field for typing, so input methods, autofill, and the keyboard work the
platform's way, while its read-only and disabled states keep core's focus and
reading behavior where SwiftUI's field cannot.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: breaking for canary callers (`Binding` → `value` and `onChange`)
- Controlled/uncontrolled behavior: controlled; `value` and `onChange` only
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Which platform field Swift uses in each state, how a read-only or disabled
  field keeps focus and reads to VoiceOver, and its status announcements.

**Does not own / non-goals**

- The meaning of TextInput's props and states — owned by `component:TextInput`
  and `family:input-fields`.
- Tooltip behavior — owned by the Swift tooltip record.

## Public concepts

| Concept      | Closed values or states       | Meaning                                                                  | Availability by variant/orientation/state | Default  | Owner                       | Stability    | Invalid-value behavior |
| ------------ | ----------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- | -------- | --------------------------- | ------------ | ---------------------- |
| field        | editable; drawn               | SwiftUI `TextField`/`SecureField`, or the drawn read-only/disabled field | always                                    | editable | `component:swift/TextInput` | experimental | none                   |
| availability | editable; read-only; disabled | disabled wins over read-only                                             | always                                    | editable | `component:TextInput`       | experimental | none                   |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                                                                           | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------ |
| FR1 | Both initializers MUST build the same `TextInputProps`. Edits reach `onChange` only while the field is editable; Return runs `onEnter` while editable or read-only.                                                                                                                                                                                                                                                                                                                                                                  | Swift component API A2, A3, A5; `component:TextInput` FR3, FR10                 | verify             |
| FR2 | A read-only or disabled field MUST draw its value (masked for a password, the placeholder when empty), keep its focus stop without raising a keyboard (a field that becomes read-only or disabled while focused keeps focus: the editable and drawn parts stay in one view structure and focus moves between them), accept no edits, and read to VoiceOver as SwiftUI's text field (`accessibilityRepresentation`): dimmed when disabled, a secure field for a password, with "Read only" or the disabled reason in its description. | `component:TextInput` FR6, FR8; `spec:AST-085`; `family:input-fields` FR4; AV1  | verify             |
| FR3 | An error MUST be in the field's VoiceOver label after its name; the description and status message MUST stay readable as text and in the description. A status message, and "Loading", are announced on the field's first appearance and when they change, an error at high priority.                                                                                                                                                                                                                                                | `component:TextInput` FR4, FR9; `component:FieldStatus` AR1                     | verify             |
| FR4 | The label tip, the tooltip-variant status, the clear button, and a disabled reason MUST show through the shared Astryx tooltip; no view uses `.help`. The tooltip-variant status tip is a button, as core's status icon is, named by its status and speaking its message when VoiceOver activates it. Trailing controls each lay out across their own 44-point target.                                                                                                                                                               | `component:TextInput` FR5, FR7, FR15; `spec:AST-082` FR11; Swift tooltip record | verify             |
| FR5 | Base `id` and `isHidden` MUST apply to the field control, TextInput's base target: `id` is its accessibility identifier, and `isHidden` takes the control and its buttons out of layout and focus (autofocus included) while the label, description, and status stay, with the label and its note read by VoiceOver as text.                                                                                                                                                                                                         | `component:TextInput` FR13; `spec:AST-082` FR7                                  | verify             |

### Allowed variation

- **AV1 — The drawn read-only and disabled field.** No platform field fits
  both states on both platforms, so Swift draws the value and gives VoiceOver
  SwiftUI's text field in its place. Fields considered:
  - SwiftUI `TextField` and `SecureField`: no read-only mode, and `.disabled`
    removes the focus stop core keeps (`spec:AST-085`).
  - UIKit `UITextField` refusing edits through its delegate: focus raises the
    keyboard unless its input view is replaced, its text and colors must be
    bridged from the theme by hand, and SwiftUI's image renderer and previews
    do not draw it.
  - AppKit `NSTextField` with editing off and selection on: a true read-only
    field on macOS, with no iOS counterpart, so the two platforms would differ.

### Representative states

| State              | Required invariant                                          | Allowed variation |
| ------------------ | ----------------------------------------------------------- | ----------------- |
| editable           | the platform field; edits reach `onChange`                  | none              |
| read-only          | value shown; focus stop; no keyboard; Return runs `onEnter` | none              |
| read-only password | masked; not selectable                                      | none              |
| disabled           | dimmed; focus stop; reads as a dimmed text field            | none              |
| error              | error in the label; message readable                        | none              |

### Transformation and precedence order

- **ORD1 — Availability.** Disabled, then read-only, then editable, as in core.

### Performance and resources

- **PR1 — No work while idle.** The view holds no timers; announcements fire
  only on first appearance or a change.

## Accessibility contract

- **AR1 — Name, error, description.** The name is the label and its note; an
  error follows it in the label; the description, other status messages,
  "Read only", and the disabled reason are the description.
- **AR2 — Rendered tree not measured.** Tests assert what the view sets; the
  rendered accessibility tree and keyboard focus are not measured until an
  app-hosted target exists.

## Design relationships

| Anatomy or state | Design requirement        | Representation authority   | Hierarchy role | Component contract |
| ---------------- | ------------------------- | -------------------------- | -------------- | ------------------ |
| Field            | the platform's text field | prescribed by the platform | primary        | FR1, FR2           |

The component implements design requirements without copying their rationale.

Platform control: SwiftUI `TextField` and `SecureField` for editing; the drawn
field in AV1 for read-only and disabled (`spec:AST-093` FR2). Guideline pages:
Text fields and Accessibility in the Apple Human Interface Guidelines
(`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): `color.textPrimary`,
`color.textSecondary`, `color.textDisabled`, `color.borderEmphasized`, the
status roles `architecture:theme-tokens` INV11 assigns (`color.borderError`,
`color.borderWarning`, `color.borderSuccess` for the border;
`color.iconError`, `color.iconWarning`, `color.iconSuccess` for the icon;
`color.errorMuted`, `color.warningMuted`, `color.successMuted` for the
message ground and `color.onErrorMuted`, `color.onWarningMuted`,
`color.onSuccessMuted` for its text),
`size.elementSm`, `size.elementMd`, `size.elementLg`, `size.borderWidth`,
`radius.element`, `space` steps, `font.body`, `font.label`, `font.supporting`,
`font.weight.medium`, `font.weight.normal`,
`font.family.body`, the theme's icons, and the Dynamic Type scale.

## Family and system relationships

- `component:TextInput` and `family:input-fields` own the props and states;
  this record states only how Swift draws them.

## Verification map

| Contract | Verification                                                                                                                                                                                                                                                              | Representative states                                                       | Mutation or failure expectation                                                                                                            | Audit section                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| FR1      | `TextInputTests.swift` initializer and edit tests                                                                                                                                                                                                                         | both initializers; editable, read-only, disabled                            | differing props, or an edit that reaches `onChange` while not editable, fails                                                              | `audit:swift/TextInput/api`    |
| FR2      | `TextInputTests.swift` read-only, password, placeholder, and focus-stop tests, and the VoiceOver field each state gives `accessibilityRepresentation` (text or secure, dimmed when disabled, label, value, and description); the rendered tree and focus are not measured | read-only; read-only password; empty; disabled; disabled password; error    | a shown password, a missing placeholder, a secure field read as text, an undimmed disabled field, or a disabled field without a stop fails | `audit:swift/TextInput/states` |
| FR3      | `TextInputTests.swift` label, description, and announcement tests                                                                                                                                                                                                         | error with and without a message; warning; type change                      | an error missing from the label, or a missed announcement change, fails                                                                    | `audit:swift/TextInput/a11y`   |
| FR4      | `TooltipPresenterTests.swift` `.help` guard; `TextInputTests.swift` checks the row ends in buttons and that the status tip is a button named by its status with its message; overlap of the 44-point targets is not measured until an app-hosted test can hit-test them   | clear and tooltip status together; tooltip, attached, and detached statuses | `.help` in a view, or a status tip without the button trait, fails                                                                         | `audit:swift/TextInput/tips`   |
| FR5      | `TextInputTests.swift` base tests: `isHidden` leaves the control out of layout; `id` and the control base target; the identifier on the drawn control is not measured until an app-hosted test exists                                                                     | `id`; `isHidden`                                                            | `isHidden` keeping the control in layout or hiding the label fails                                                                         | `audit:swift/TextInput/base`   |

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
