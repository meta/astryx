---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/CheckboxInput
platform_of: component:CheckboxInput
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, layout, interaction, theming, accessibility, platform]
verified_by: []
modules: []
families: []
design_specs: [design:user-states]
architecture: [architecture:public-component-api]
contributing: []
system_specs:
  [spec:AST-021, spec:AST-082, spec:AST-085, spec:AST-086, spec:AST-093]
---

# CheckboxInput (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `CheckboxInput` under core's name with core's `label`, `isLabelHidden`, `description`, `value` (`true`, `false` or `'indeterminate'`), `onChange`, `isLoading`, `isDisabled`, `disabledMessage`, `isReadOnly`, `isOptional`, `isRequired`, `size` (`sm` or `md`), `labelIcon` (a shared icon name) and `status`, with core's meaning and defaults. It adds no prop. Web's `ref`, `changeAction`, `htmlName`, `onFocus`, `onBlur` and `width` stay in the web contract (DEC-1). |
| Behavior                | One pressable row, the box and the field label beside it, is the one element a screen reader reaches: a checkbox named by its label, the required word and an error message, with the description, a warning or success message and the disabled reason as its hint (DEC-2). A press proposes the next boolean value through `onChange`. Disabled, read-only and loading rows refuse the press; a tap on a disabled row shows its reason.                                                           |
| End-user impact         | A person taps anywhere on the row to change the choice, hears one checkbox with its state and everything that explains it, and finds out why a disabled box is unavailable by tapping it. The row keeps the platform's minimum touch target and grows with the text size.                                                                                                                                                                                                                           |
| Builder impact          | An app passes core's props, and the same code renders on iOS and Android. The value stays controlled: the app owns it through `value` and `onChange`.                                                                                                                                                                                                                                                                                                                                               |
| Compatibility/readiness | Not yet released; additive. Draft. The core and web contracts are unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Review checks           | Reject a web-only prop accepted and ignored, a row that reads as more than one element or reads its label twice, a press that changes a disabled, read-only or loading checkbox, a mixed value read as unchecked, a disabled reason that only sighted people can reach, a status message missing from the name or hint, a touch target below the platform minimum, a visual value not taken from the theme, or a third-party native dependency.                                                     |
| Governing rules         | `component:CheckboxInput` FR1–FR7, FR13, FR14 and ORD1–ORD3; `spec:AST-021`; `spec:AST-085` FR1–FR3; `spec:AST-086` FR8; `design:user-states`; `spec:AST-082` FR3, FR4 and FR7; `spec:AST-093` FR2–FR4; DEC-1–DEC-3 below.                                                                                                                                                                                                                                                                          |

This table is a review projection; the body below is authoritative.

## Intent

A checkbox on a phone is a row a finger can hit anywhere, read as one choice.
CheckboxInput on React Native keeps core's props and states, so a form reads the
same on the web and on a phone, and draws the box and its label as one
pressable row that VoiceOver and TalkBack read as a single checkbox. This
record states only what React Native adds to `component:CheckboxInput` or does
differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: controlled only; `value` is required and
  every change is the caller's, as in core
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Which of core's props React Native offers and the form each takes (FR1).
- The pressable row: what it holds, how it reads to screen readers, and what a
  press does (FR2, FR3, DEC-2).
- How disabled, read-only and loading rows behave under a finger (FR4–FR6).
- Status, required and optional words on React Native (FR7, FR8).
- The row's size, layout, touch target, press feedback and focus ring (FR9,
  FR10).

**Does not own / non-goals**

- The meaning of CheckboxInput's props, the change order and the state
  precedence — owned by `component:CheckboxInput`.
- The box, the check and the indeterminate mark, and their disabled paint —
  owned by the CheckboxIndicator record.
- Labels, descriptions and status lines as parts — owned by FieldLabel and
  FieldStatus.
- A group of checkboxes — owned by CheckboxList.
- The meaning of a checkbox with no `onChange` — owned by
  `component:CheckboxInput` OQ1.
- The shared checkbox accessibility binding — owned by `spec:AST-021`.

## Public concepts

| Concept      | Closed values or states                                               | Meaning                                                         | Availability by variant/orientation/state | Default   | Owner                                  | Stability    | Invalid-value behavior               |
| ------------ | --------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- | --------- | -------------------------------------- | ------------ | ------------------------------------ |
| row          | one element                                                           | the box and the field label, read and pressed as one checkbox   | always                                    | —         | `component:react-native/CheckboxInput` | experimental | none                                 |
| spoken name  | label; required word; error message                                   | what the checkbox is called, in that order                      | always                                    | the label | `component:react-native/CheckboxInput` | experimental | none                                 |
| spoken hint  | "Read only"; description; warning or success message; disabled reason | what explains the choice, in that order                         | when any part is present                  | none      | `component:react-native/CheckboxInput` | experimental | none                                 |
| availability | enabled; disabled; disabled with reason; read-only; loading           | whether a press changes the value, and how the row says why not | all values                                | enabled   | `component:CheckboxInput`              | experimental | disabled wins over every other state |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Basis                                                                                                                                  | Draft review state |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| FR1  | React Native's `CheckboxInput` MUST take core's `label`, `isLabelHidden`, `description`, `value`, `onChange`, `isLoading`, `isDisabled`, `disabledMessage`, `isReadOnly`, `isOptional`, `isRequired`, `size`, `labelIcon` and `status` with core's names, meaning and defaults. `value` keeps all three of core's values; `labelIcon` is a shared icon name (`spec:AST-082` FR4, FR17). Base props are `id` and `isHidden` (`spec:AST-082` FR7) and target the row, the one checkbox element, as core's target the checkbox: `id` identifies the row, and `isHidden` removes the whole CheckboxInput, its row and its status line, from layout and the accessibility tree. It MUST NOT offer web's `ref`, `changeAction`, `htmlName`, `onFocus`, `onBlur` or `width` (DEC-1). | `component:CheckboxInput`; `spec:AST-082` FR3, FR4, FR7; DEC-1                                                                         | verify             |
| FR2  | The row MUST hold the box and, unless `isLabelHidden`, the field label with its icon, its Required or Optional marker and its description, and the whole row takes the press. It is the one accessibility element: role checkbox, named by the label, then core's required word when required, then an error's message; its hint is core's "Read only" string while read-only, then the description, then a warning or success message, then the disabled reason while disabled. The visible words are hidden from screen readers, so nothing is read twice. A hidden label still names the checkbox (DEC-2).                                                                                                                                                                 | `component:CheckboxInput` FR1, FR6; `spec:AST-021`; DEC-2                                                                              | verify             |
| FR3  | A press on an enabled row MUST call `onChange` with the next boolean value: `true` from unchecked or indeterminate, `false` from checked. The row reads as checked, not checked, or mixed for `'indeterminate'`, always from `value`, so a mixed value reads as mixed until the caller changes it. With `value` and no `onChange`, a press changes nothing; what such a checkbox means stays `component:CheckboxInput` OQ1.                                                                                                                                                                                                                                                                                                                                                   | `component:CheckboxInput` FR1, FR2, FR13                                                                                               | verify             |
| FR4  | `isReadOnly` MUST keep the value, the full-strength look and the row's place for screen readers, refuse every press, and say it is read-only: core's "Read only" string leads the hint (FR2), since React Native has no read-only accessibility state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `component:CheckboxInput` FR5                                                                                                          | verify             |
| FR5  | While `isLoading`, the row MUST read as busy, refuse every press and draw the theme's loading ring in place of the mark inside the box, without changing size; core's busy start is announced once (`spec:AST-086` FR8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `component:CheckboxInput` FR3; `spec:AST-086` FR8                                                                                      | verify             |
| FR6  | `isDisabled` MUST refuse every press, read as disabled, and draw the box and label in the theme's disabled colours. Screen readers still reach the row. With `disabledMessage`, the reason is in the hint (FR2), and a completed tap on the row opens it in a tooltip, as core's Tooltip opens a disabled control's reason under a finger (`component:Tooltip` FR5); a long press or a scroll opens nothing, and the tap changes no value.                                                                                                                                                                                                                                                                                                                                    | `component:CheckboxInput` FR4; `spec:AST-085` FR1–FR3; `spec:AST-082` FR3 (a tooltip where there is no hover); `component:Tooltip` FR5 | verify             |
| FR7  | `status` MUST show its message under the row. An error's message is part of the checkbox's name (FR2); a warning or success message is part of the hint, never the name. The message is announced once when it appears, a first mount included, and when it changes, an error interrupting, never again for the same words (`component:FieldStatus` AR1).                                                                                                                                                                                                                                                                                                                                                                                                                     | `component:CheckboxInput` FR6; `component:FieldStatus` AR1; `spec:AST-086`                                                             | verify             |
| FR8  | `isRequired` MUST add core's required word to the name; the Required and Optional markers on the label follow `component:FieldLabel` FR4, which hides the marker a `FormLayout` default already implies and shows only Optional when both flags are set. Under a `FormLayout` default, an unchecked box is still an answer, so a CheckboxInput without its own `isRequired` is not required (`component:CheckboxInput` FR7). There is no form to submit, so nothing blocks submission.                                                                                                                                                                                                                                                                                        | `component:CheckboxInput` FR7; `component:FieldLabel` FR4                                                                              | verify             |
| FR9  | The box MUST sit in a slot one label line tall, growing with the text size, so it stays level with the first line of a wrapped label, with the theme's `space.s2` between box and label at both sizes. In a stretching parent the field takes the line and the row hugs its leading edge; in a stack that centres or end-aligns, the field follows that alignment. The row never grows past its container, and its label wraps.                                                                                                                                                                                                                                                                                                                                               | `component:CheckboxInput` FR12                                                                                                         | verify             |
| FR10 | The row MUST keep the platform's minimum touch target through hit slop, without changing its size: 44 points on iOS (`spec:AST-093` FR3) and, on Android, Material 3's 48 dp, whose guideline is `spec:AST-093` OQ1, open. A press shows the platform's response over the row, a highlight on iOS and a ripple cut to the row's corners on Android, and a blocked row shows none. With a hardware keyboard, focus lands on the row and draws the theme's focus ring around it.                                                                                                                                                                                                                                                                                                | `component:CheckboxInput` FR10, FR11, FR14; `design:user-states`; `spec:AST-093` FR3, OQ1                                              | verify             |

### Allowed variation

- **AV1 — The platform's press feedback.** The highlight and the ripple are the
  platform's own (FR10).
- **AV2 — Theme paint.** The box, mark and label colours, the row's corners and
  the focus ring come from the theme and change with it.

### Representative states

| State                     | Required invariant                                                            | Allowed variation |
| ------------------------- | ----------------------------------------------------------------------------- | ----------------- |
| unchecked, checked, mixed | one checkbox; reads the state from `value`; a press proposes the next boolean | theme paint       |
| loading                   | busy; no press; the ring in the box; same size                                | the ring's look   |
| disabled                  | disabled; no press; disabled colours; still reachable                         | none              |
| disabled with a reason    | the reason in the hint; a tap opens it; a long press opens nothing            | tooltip placement |
| read-only                 | full-strength look; no press; "Read only" leads the hint                      | none              |
| no `onChange`             | a press changes nothing                                                       | none              |
| error status              | the message in the name; the message under the row, announced once            | message text      |
| hidden label              | the label still names the checkbox; no visible words                          | none              |
| largest text size         | the box stays level with the first line; the label wraps                      | none              |

### Transformation and precedence order

- **ORD1 — State.** The row reads `value`; nothing else changes what it shows
  (`component:CheckboxInput` ORD1).
- **ORD2 — Press.** A disabled, read-only or loading row refuses the press;
  otherwise `onChange` receives the next boolean value
  (`component:CheckboxInput` ORD2).
- **ORD3 — Availability.** Disabled owns availability; a disabled reason adds
  the tap that opens its tooltip and the hint, not a working press; read-only and loading block
  only the value change (`component:CheckboxInput` ORD3).
- **ORD4 — Spoken words.** Name: label, required word, error message. Hint:
  "Read only" while read-only, description, warning or success message,
  disabled reason.

### Performance and resources

- **PR1 — Bounded resources.** The row holds no timers and no global
  listeners; the status announcement and the tooltip live only while the row is
  mounted.

## Accessibility contract

- **AR1 — One checkbox.** The row is the only accessibility element, with role
  checkbox, its checked, mixed, disabled and busy states, and the name and hint
  of FR2, whose hint says it is read-only (FR4).
- **AR2 — Nothing read twice.** The visible label, description and status are
  hidden from screen readers because the row carries them.
- **AR3 — Text size.** The label and description scale with Dynamic Type and
  Android's font scale; the box grows with them and stays level with the first
  line (FR9).
- **AR4 — Touch target.** The row keeps the platform's minimum touch target
  (FR10).
- **AR5 — Keyboard focus.** With a hardware keyboard, the focus ring outlines
  the row, the element focus lands on (FR10).

## Design relationships

| Anatomy or state      | Design requirement                                           | Representation authority   | Hierarchy role      | Component contract |
| --------------------- | ------------------------------------------------------------ | -------------------------- | ------------------- | ------------------ |
| Row                   | one pressable checkbox with the platform's press response    | prescribed by the platform | primary control     | FR2, FR10          |
| Box                   | the CheckboxIndicator box, level with the label's first line | theme intent               | primary control     | FR9                |
| Label and description | field label words beside the box                             | FieldLabel composition     | primary content     | FR2, FR8           |
| Status message        | a detached status line under the row                         | FieldStatus composition    | supporting feedback | FR7                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): none; DEC-3 says why. The row is a React
Native `Pressable` with the platform's press feedback around the token-drawn
CheckboxIndicator. Guideline pages: Toggles and Accessibility (Dynamic Type,
VoiceOver) in the Apple Human Interface Guidelines (`spec:AST-093` FR3). On
Android the row follows Material 3's Checkbox and touch-target pages; Android
guidelines are `spec:AST-093` OQ1, which is open, so the Android values wait on
that ruling.

Theme values read (`spec:AST-093` FR4): `space.s2`, `radius.element` for the
row's corners and press response, the focus outline width, offset and colour,
the label type and its line height for the box's slot, and the text size
scale; the box's own values are the CheckboxIndicator record's.

### Native pieces

None. The row is React Native's own `Pressable`, and the box draws from theme
tokens; its check glyph resolves through `Icon` (`spec:AST-127` FR4), which the
CheckboxIndicator record owns.

## Family and system relationships

- `component:CheckboxInput` owns the props, the change order and the state
  precedence; this record states how React Native draws and reads them.
- `spec:AST-021` owns the shared checkbox accessibility binding; FR2 and AR1
  apply it to one row.
- `spec:AST-085` owns disabled reachability, and `spec:AST-086` owns the busy
  and status announcements.
- The CheckboxIndicator record owns the box; FieldLabel and FieldStatus own the
  label and the status line; CheckboxList owns a group of checkboxes.

## Verification map

| Contract            | Verification                                                                                  | Representative states                                                                                                    | Mutation or failure expectation                                                                                                                                                 | Audit section                               |
| ------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| FR1                 | Type tests against core's CheckboxInput contract; the contract check of each platform's props | each core prop; the three values; each web-only prop                                                                     | a web-only prop that type-checks, a value narrowed to a boolean, or an accepted and ignored prop fails                                                                          | `audit:react-native/CheckboxInput/api`      |
| FR2, ORD4, AR1, AR2 | Unit tests of the row's accessibility props; VoiceOver and TalkBack checks                    | a label alone; required; an error; a warning; a description; a disabled reason; a hidden label                           | a second element, a word read twice, a part out of order, or a hidden label that stops naming the checkbox fails                                                                | `audit:react-native/CheckboxInput/a11y`     |
| FR3, ORD1, ORD2     | Unit tests of the press                                                                       | unchecked; checked; indeterminate; no `onChange`                                                                         | a wrong next value, a mixed value read as unchecked, or a press that changes a checkbox with no `onChange` fails                                                                | `audit:react-native/CheckboxInput/behavior` |
| FR4–FR6, ORD3       | Unit tests of blocked rows and the tooltip under a finger                                     | read-only; loading; disabled; disabled with a reason                                                                     | a press that changes a blocked row, a missing busy or read-only state, a loading start not announced once, or a reason a tap does not open, or a long press that opens it fails | `audit:react-native/CheckboxInput/behavior` |
| FR7, FR8            | Unit tests of status and optionality, inside and outside a `FormLayout`                       | error at mount and later; warning; success; a required default and an optional default; `isRequired`; `isOptional`; both | a warning in the name, a status silent at mount or announced twice, a marker that `component:FieldLabel` FR4 hides, or an unmarked checkbox required under a form default fails | `audit:react-native/CheckboxInput/fields`   |
| FR9, AR3            | Unit tests of the box slot and placement; captures at the default and largest text sizes      | `sm`; `md`; a wrapped label; a stretching parent; a centring stack                                                       | a box off the first line, a field wider than its container, or a cut label fails                                                                                                | `audit:react-native/CheckboxInput/layout`   |
| FR10, AR4, AR5      | Unit tests of hit slop and the press target; keyboard checks                                  | each size; a blocked row; hardware keyboard focus                                                                        | a target below the platform minimum, press feedback on a blocked row, or no focus ring fails                                                                                    | `audit:react-native/CheckboxInput/layout`   |

## Decision log

### DEC-1 — React Native keeps core's CheckboxInput; web-only props stay on the web

**Reference:** `component:react-native/CheckboxInput/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

React Native's CheckboxInput takes core's props with core's names and meaning,
so a form reads the same on the web and on a phone. The web contract keeps what
an app platform has no honest form for (`spec:AST-082` FR3, FR4): `htmlName`,
because an app has no HTML form to submit; `ref`, a web element reference;
`onFocus` and `onBlur`, whose argument is a DOM event; `changeAction`, which
runs only when the `onChange` event was not prevented
(`component:CheckboxInput` FR2), while React Native's `onChange` receives the
next value alone (`spec:AST-082` FR4), so that order cannot be honored; and
`width`, a CSS length, since the field's width comes from its stack (FR9).

### DEC-2 — The row is the one checkbox element

**Reference:** `component:react-native/CheckboxInput/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

On React Native the box and its field label form one pressable row, and that
row is the checkbox a screen reader reaches. The row carries the name and the
hint that a label and descriptions give a checkbox on the web, and the visible
words are hidden from screen readers. A person then hears one checkbox with
everything that explains it, and a finger can press anywhere on the row.

### DEC-3 — The checkbox is drawn

**Reference:** `component:react-native/CheckboxInput/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

iOS has no checkbox control, and Android's checkbox view is an accessibility
element of its own, with its own role and label, so it cannot be the box inside
a row that reads as one checkbox (DEC-2). CheckboxInput therefore draws its box
from the theme on both platforms (`spec:AST-093` FR2).

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
