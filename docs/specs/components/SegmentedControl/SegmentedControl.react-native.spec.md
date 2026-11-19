---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/SegmentedControl
platform_of: component:SegmentedControl
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, layout, motion, theming, accessibility, platform]
verified_by: []
modules: []
families: []
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-085, spec:AST-093, spec:AST-112]
---

# SegmentedControl (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `SegmentedControl` and `SegmentedControlItem` under their core names, with the core props, meanings and defaults. `SegmentedControlItem`'s `icon` takes a shared icon name. The iOS contract adds `render` (`auto`, `system`, `drawn`) to `SegmentedControl`; Android, which has no system host for it, has no `render`. Neither takes `xstyle` or a `ref`; their base props are `id` and `isHidden`. |
| Behavior                | On iOS, with `render="auto"`, the default, the control is UISegmentedControl wherever its host exists; on Android it is the control Astryx draws. Each shape FR2 lists, which the system control cannot show, draws Astryx's control. Astryx's control never cuts a label: a long label wraps, and at large text sizes the segments wrap into balanced rows.                                                               |
| End-user impact         | A person picks one of a few options with a tap, in the platform's own segmented control on iOS. Every label stays readable at every text size. VoiceOver and TalkBack read the group's name, then each segment as a radio with its checked state.                                                                                                                                                                          |
| Builder impact          | The same SegmentedControl code runs on the web, iOS and Android. An app that wants Astryx's control on iOS sets `render="drawn"` there, or the theme's `render.default` for every control.                                                                                                                                                                                                                                 |
| Compatibility/readiness | Not yet released; additive. Draft. Gaps are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                             |
| Review checks           | Reject a cut or truncated label, a lone segment stretched across a wrapped row, a system control that drops an icon or a disabled reason, a library haptic on the system control, a disabled reason only a screen reader can reach, an announcement on a selection change, or a visual prop on either component.                                                                                                           |
| Governing rules         | `component:SegmentedControl`; `component:SegmentedControlItem`; `spec:AST-082` FR3, FR4, FR7, FR11, FR17 and DEC-2; `spec:AST-085`; `component:Tooltip` FR5; `spec:AST-093` FR1–FR5; `spec:AST-112` FR21; `spec:AST-126` FR2, FR6 and FR10–FR12; `spec:AST-127` FR4; DEC-1 below.                                                                                                                                          |

This table is a review projection; the body below is authoritative.

## Intent

SegmentedControl on React Native is core's segmented choice on a phone: a few
mutually exclusive options, all visible at once, picked with a tap. It uses the
platform's own segmented control where that control meets the contract, and
Astryx's control where it does not, with core's props, words, states and
accessibility either way. In this record, "core" is `component:SegmentedControl`
and `component:SegmentedControlItem`, and the record states only what React
Native adds or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a React Native implementation of an existing
  core component)
- Controlled/uncontrolled behavior: controlled; selection is `value` and
  `onChange`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR2 gap: `SegmentedControl` takes no `render`. On iOS, the capabilities
  provider's `nativePresentation` or the theme's `native.presentation` turns on
  UISegmentedControl; with neither set, the control is Astryx's control.
- FR2 gap: a segment that shows both an icon and a label, or a hidden label
  whose icon has no SF Symbol, keeps the system control, which does not draw
  that icon.
- FR5 gap: in Astryx's control the selection moves at once: the selected
  surface does not slide, a drag does not carry it, and a press does not lift
  it.
- FR7 gap: with a hardware keyboard, each segment is its own Tab stop, and the
  arrow keys do not move between segments.
- FR8 gap: a disabled control's reason opens on a long press, not a tap.
- `spec:AST-082` FR11 gap: on Android, Astryx's control draws where Material
  3's segmented button is the platform's own control (OQ1).

## Ownership boundary

**Owns**

- Which props React Native offers (FR1).
- Which control draws the segments, and what each draws (FR2–FR4).
- Selection, label wrapping, keyboard and screen-reader reach, and the disabled
  state on React Native (FR5–FR8).
- Base props and the theme values each control reads (FR9).
- How VoiceOver and TalkBack read the control (AR1–AR4).

**Does not own / non-goals**

- The meaning of the props, the states and the words — owned by
  `component:SegmentedControl` and `component:SegmentedControlItem`.
- `render` and the theme's `render.default` — owned by `spec:AST-112` FR21.
- The system segmented control's native contract and when a host exists —
  owned by `spec:AST-126` (FR2, FR6).
- Icon resolution — owned by `spec:AST-127`.
- Page navigation — owned by TabList.

## Public concepts

| Concept      | Closed values or states                   | Meaning                                                                                                                                                             | Availability by variant/orientation/state                     | Default                                                  | Owner                                     | Stability    | Invalid-value behavior                     |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------- | ------------ | ------------------------------------------ |
| rendering    | `auto`; `system`; `drawn`                 | who draws the segments: `system`, the system segmented control; `drawn`, Astryx's control; `auto`, the system control wherever a host exists, else Astryx's control | iOS contract; drawn for the shapes FR2 lists                  | `auto`, unless the theme's `render.default` overrides it | `component:react-native/SegmentedControl` | experimental | an unknown value is a type error           |
| row form     | one row; wrapped rows                     | whether Astryx's control lays its segments on one row or on balanced rows (FR6)                                                                                     | Astryx's control                                              | one row                                                  | `component:react-native/SegmentedControl` | experimental | none                                       |
| availability | enabled; disabled; disabled with a reason | whether a segment can be picked (FR8)                                                                                                                               | always; a reason applies only with the control's `isDisabled` | enabled                                                  | `component:SegmentedControl`              | experimental | a reason without `isDisabled` does nothing |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Basis                                                                                                           | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------ |
| FR1 | React Native MUST export `SegmentedControl` and `SegmentedControlItem`, their names on every platform, and keep the core props, meanings, defaults and states (`spec:AST-082` FR3): `value`, `onChange`, `label`, `size`, `layout`, `isDisabled`, `disabledMessage` and the items; and on each item `value`, `label`, `isLabelHidden`, `icon` and `isDisabled`. `icon` takes a shared icon name, which resolves through `Icon` (`spec:AST-082` FR4, FR17; `spec:AST-127` FR4). `xstyle` stays in the web contract. Neither component takes a `ref`: React Native's base props are `id` and `isHidden` (`spec:AST-082` FR7). An item outside a `SegmentedControl` is unselected and does nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `component:SegmentedControl`; `component:SegmentedControlItem`; `spec:AST-082` FR3, FR4, FR7, FR17              | settled            |
| FR2 | The iOS contract MUST add `render` to `SegmentedControl`, which chooses who draws the segments (`spec:AST-112` FR21, `spec:AST-126` FR2). `system` is UISegmentedControl (`spec:AST-126` FR6), and with no host it draws Astryx's control with one development warning; `drawn` is Astryx's control (FR4); `auto`, the default, is the system control wherever its host exists and Astryx's control elsewhere, silently; the theme's `render.default` overrides it. The Android contract has no `render`: Android's platform control is Material 3's segmented button, which the package has no host for, so every value would draw Astryx's control, and a prop no value of which Android honors is not offered (`spec:AST-082` FR3; the `spec:AST-082` FR11 gap below; OQ1). On iOS, Astryx's control draws, whatever `render` says, for each shape the system control cannot show (`spec:AST-126` DEC-2): a disabled control with a `disabledMessage`, which the system control has no way to show; a segment that shows both an icon and a label, or a hidden label whose icon has no SF Symbol, since a system segment draws a title or a symbol alone; large text sizes (AX1 and up) and a label that would break inside a word (FR6); a fitting width wider than the control's room, which keeps Astryx's control for the rest of that control's life; and items an app wraps in its own component, which the system control cannot read. | `spec:AST-112` FR21; `spec:AST-126` FR2, FR6, DEC-2; `spec:AST-082` FR11                                        | human decision     |
| FR3 | The system control MUST show each item's title, or its SF Symbol when the label is hidden, the selected segment, each segment's enabled state, `size`, `layout` and the theme's mode, with the group's `label` read before the segments. A tap on an unselected segment calls `onChange` with its value once; a tap on the selected one changes nothing. Its selection motion and touch feedback are UIKit's own, and the library plays no haptic of its own on it (AV1). `hug` sizes each segment to its content; `fill` gives every segment the same width across the container (`spec:AST-126` FR6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `spec:AST-126` FR6, FR10, FR12                                                                                  | verify             |
| FR4 | Astryx's control MUST draw a track with the theme's neutral fill, element radius and inner padding, at least the element height for the resolved size, growing with the text size. `hug` sizes the track to its segments, capped at the container's width; `fill` stretches it across the container with equal segments. Each segment shows its icon before its label; enabled segments show the platform's press feedback (an overlay on iOS, a ripple on Android). The selected segment is a raised surface with the theme's low shadow, corners concentric with the track, and semibold primary words; unselected words are secondary, or primary where secondary falls below 4.5:1 against the track. When the theme's `render.default` is `system`, the track and the selected surface take the system control's capsule shape, so Astryx's control matches the system controls around it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `component:SegmentedControl` FR5, FR6; `component:SegmentedControlItem` FR3, FR5, FR6; `spec:AST-093` FR4       | verify             |
| FR5 | In Astryx's control, a tap on an enabled, unselected segment MUST call `onChange` with its value once and play the library's `select` haptic; a tap on the selected segment changes nothing and plays nothing. A change of selection slides the selected surface to the new segment, a drag from the selected segment carries it and the lift commits the nearest segment, a press lifts it, and under Reduce Motion the change cross-fades, as core states (`component:SegmentedControl` FR9, FR10, FR13, FR14).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `component:SegmentedControl` FR3, FR9, FR10, FR13, FR14; `component:SegmentedControlItem` FR2                   | verify             |
| FR6 | Astryx's control MUST never cut a label (DEC-1). A label wider than its segment wraps at word breaks, centred, and the segment grows taller. At large text sizes (AX1 and up), and once a label would break inside a word, the track wraps: a segment that does not fit starts a new row, and each row's segments grow to fill it. Once every segment's one-line width and the row's room are known, the rows are balanced by count (four segments sit two and two, five sit three and two), never a lone segment stretched across a row; a segment wider than the track takes a row of its own. A track that wrapped for a word break keeps wrapping for the rest of that control's life. Order, roles and the checked state do not change. A development build warns once when a label wraps at the default text size.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | DEC-1; `spec:AST-082` FR11; `spec:AST-126` FR6                                                                  | verify             |
| FR7 | With a hardware keyboard, the control MUST be one Tab stop, and the arrow keys MUST move between enabled segments and select the one they reach, as core states (`component:SegmentedControl` FR2, FR3). VoiceOver and TalkBack reach each segment as its own element (AR1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `component:SegmentedControl` FR2, FR3; `spec:AST-085` FR1                                                       | verify             |
| FR8 | `isDisabled` MUST disable every segment: the words take the disabled text colour, nothing can be picked, and each segment carries the disabled state (`component:SegmentedControlItem` FR4). With a `disabledMessage`, the reason is each segment's hint, and a tap on a segment shows it in a tooltip, as a disabled control's reason opens under touch (`component:Tooltip` FR5); the segments stay elements VoiceOver and TalkBack reach (`spec:AST-085`). An item's own `isDisabled` blocks that segment alone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `component:SegmentedControl` FR7; `component:SegmentedControlItem` FR4; `component:Tooltip` FR5; `spec:AST-085` | verify             |
| FR9 | The shared base props MUST attach to the track and to each segment (`spec:AST-082` FR7): `id` is the test and native identifier of the track (or of the system control's box) and of the segment, and `isHidden` removes it from layout and the accessibility tree. Neither component takes a visual prop: Astryx's control reads the theme, including its component overrides for the track and the selected surface (`spec:AST-082` DEC-2), and the system control takes only the values `spec:AST-126` FR11 lists for it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `spec:AST-082` FR7, DEC-2; `spec:AST-126` FR11                                                                  | verify             |

### Allowed variation

- **AV1 — The system control.** The system control's look, selection motion,
  drag and touch feedback are the platform's own and may change with each OS
  release.
- **AV2 — Theme paint.** Themes may restyle Astryx's track and selected surface
  through their component overrides without changing behavior.

### Representative states

| State                                 | Required invariant                                                                 | Allowed variation |
| ------------------------------------- | ---------------------------------------------------------------------------------- | ----------------- |
| `render` unset on iOS, a host present | UISegmentedControl; the label read first                                           | the system's look |
| Android                               | Astryx's control                                                                   | theme paint       |
| disabled with a reason                | Astryx's control; nothing can be picked; the reason is the hint and shows on a tap | none              |
| a segment with an icon and a label    | Astryx's control; icon before the label                                            | none              |
| `hug`, a long label in a narrow row   | the label wraps at word breaks; the segment grows taller; nothing is cut           | none              |
| largest text size, four segments      | two balanced rows of two; every label in full                                      | none              |
| a selection change                    | `onChange` once; the `select` haptic in Astryx's control only                      | none              |
| an item outside a control             | unselected; does nothing                                                           | none              |

### Transformation and precedence order

- **ORD1 — Rendering.** On Android, Astryx's control. On iOS, a shape FR2
  lists, Astryx's control; else `render`; `auto` then resolves to the theme's
  `render.default`, else to the system control where its host exists, else to
  Astryx's control.
- **ORD2 — Row form.** Large text or a word break, wrapped rows; balanced once
  the widths are known, greedy until then; else one row.
- **ORD3 — Availability.** The control's `isDisabled`, then the item's own
  `isDisabled`, then enabled.

### Performance and resources

- **PR1 — Layout events only.** Astryx's control balances its rows from layout
  events, and changes the row sizes only when they change; it measures nothing
  per frame.
- **PR2 — A tap is one change.** A selection change calls `onChange` once; a
  tap on the selected segment does no work.

## Accessibility contract

- **AR1 — Group and segments.** In Astryx's control, the track is a radio
  group that is not itself an element; the group's `label` is visually hidden
  text read first; and each segment is a radio named by its label, also when
  the label is hidden or wrapped, checked when selected and disabled when
  disabled. In the system control, the label is read before the segments, and
  each segment carries the system's selected state (`spec:AST-126` FR12).
- **AR2 — No extra announcement.** A selection change announces nothing; the
  checked state is the feedback.
- **AR3 — Text size.** Labels scale with Dynamic Type and Android's font scale.
  Astryx's control wraps instead of cutting (FR6); the system control gives
  way to Astryx's control at AX1 and up (FR2).
- **AR4 — Targets and reasons.** Each segment's touch target reaches the
  platform minimum, and a disabled reason reaches everyone: a screen reader
  reads it as the hint, and a tap shows it (FR8).

## Design relationships

| Anatomy or state | Design requirement                                        | Representation authority   | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Track            | the platform's segmented control, or Astryx's muted track | prescribed by the platform | supporting     | FR2–FR4            |
| Selected segment | a raised surface with a low shadow and semibold words     | current source             | prominent      | FR4, FR5           |
| Label            | words that wrap and are never cut                         | human-selected             | prominent      | FR6                |
| Icon             | an icon before the label                                  | current source             | supporting     | FR2, FR4           |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): UISegmentedControl on iOS, and Material
3's segmented button on Android, which the package has no host for, so
Astryx's control draws there (`spec:AST-126` FR6; the `spec:AST-082` FR11 gap
under Current-state impact; OQ1). Guideline
pages: Segmented controls and Accessibility (Dynamic Type) in the Apple Human
Interface Guidelines (`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): in Astryx's control, `color.neutral`,
`color.backgroundSurface`, `color.textPrimary`, `color.textSecondary`,
`color.textDisabled`, `radius.element`, `space` steps, `size.elementSm`,
`size.elementMd`, `size.elementLg`, `shadow.low`, the `label` and
`supporting` type with the medium and semibold weights, the text-size scale,
the theme's component overrides for the track and the selected surface, and
`render.default` for the capsule shape. In the system control, the values
`spec:AST-126` FR11 lists for it: the mode, and the selected fill and title
when the component sends them.

### Native pieces

| Native piece             | Record                        | What this record uses it for                                             |
| ------------------------ | ----------------------------- | ------------------------------------------------------------------------ |
| `AstryxSegmentedControl` | `spec:AST-126` FR6, FR10–FR12 | the system control on iOS, its fitting size and accessibility (FR2, FR3) |
| `Icon` resolution        | `spec:AST-127` FR4            | each segment's icon, and its SF Symbol in the system control (FR1, FR2)  |

## Family and system relationships

- `component:SegmentedControl` and `component:SegmentedControlItem` own the
  props, states and words; this record states only what React Native adds or
  does differently.
- `spec:AST-112` FR21 owns `render`; `spec:AST-126` owns the system segmented
  control and when a host exists; `spec:AST-127` owns icons.
- `spec:AST-085` owns disabled reachability; `component:Tooltip` FR5 owns how
  a disabled reason opens under touch.

## Verification map

| Contract       | Verification                                                                                      | Representative states                                                                                                                                                                  | Mutation or failure expectation                                                                                                                                                      | Audit section                                        |
| -------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| FR1            | Type tests of both components against the generated contracts; a contract drift test              | each core prop; `xstyle`; a `ref`; `render` on Android; an item outside a control                                                                                                      | a web-contract prop, a `ref` or an Android `render` accepted, a renamed prop, or an item outside a control that selects fails                                                        | `audit:react-native/SegmentedControl/api`            |
| FR2, ORD1      | Unit tests of the rendering choice through the package's testing doubles                          | each `render` on iOS; a theme `render.default`; Android; a disabled reason; an icon and a label; a hidden label without an SF Symbol; AX1; a word break; a narrow room; a wrapped item | a system control for a shape FR2 lists, a missing or repeated development warning, or Astryx's control where the system control applies fails                                        | `audit:react-native/SegmentedControl/render`         |
| FR3            | Simulator checks of the system control; unit tests of the forwarded props                         | each size and layout; a hidden label with an SF Symbol; a disabled segment; light and dark                                                                                             | a lost title, symbol or enabled state, a second `onChange` for one tap, or a library haptic on the system control fails                                                              | `audit:react-native/SegmentedControl/system-control` |
| FR4, FR9       | Unit tests of the drawn track and segments in each fixture theme; Simulator and emulator captures | each size; `hug` and `fill`; selected, unselected and disabled words; a theme with `render.default` `system`; component overrides                                                      | a missing raised surface, unselected words below 4.5:1 on the track, a visual prop accepted, or an identifier off the track or segment fails                                         | `audit:react-native/SegmentedControl/drawn`          |
| FR5            | Unit tests through the doubles; Simulator and emulator checks with and without Reduce Motion      | a tap; a tap on the selected segment; a drag from the selected segment; a press                                                                                                        | a second `onChange`, a haptic for the selected segment, a jump where the surface slides, or travel under Reduce Motion fails                                                         | `audit:react-native/SegmentedControl/selection`      |
| FR6, ORD2, AR3 | Layout tests at the default and largest text sizes                                                | a long label in `hug` and `fill`; four, five and seven segments at the largest text size; a segment wider than the track; a label in a script without spaces                           | an ellipsis or a line limit, a break inside a word while the track does not wrap, a lone segment stretched across a row, or a track that returns to one row after a word break fails | `audit:react-native/SegmentedControl/layout`         |
| FR7            | Hardware-keyboard checks on the Simulator and the emulator                                        | Tab into the control; arrows across a disabled segment                                                                                                                                 | more than one Tab stop, or arrows that do not move and select, fails                                                                                                                 | `audit:react-native/SegmentedControl/keyboard`       |
| FR8, AR4       | Unit tests; VoiceOver and TalkBack checks                                                         | the control disabled with and without a reason; one item disabled                                                                                                                      | a pick while disabled, a reason only in the hint or one a tap does not open, or a segment a screen reader cannot reach fails                                                         | `audit:react-native/SegmentedControl/states`         |
| AR1, AR2       | VoiceOver and TalkBack checks on the Simulator, the emulator and a device                         | the group in each control; a hidden label; a selection change                                                                                                                          | a group name not read first, a segment without its radio role or checked state, or an announcement on a selection change fails                                                       | `audit:react-native/SegmentedControl/a11y`           |

## Decision log

### DEC-1 — Astryx's control never cuts a label

**Reference:** `component:react-native/SegmentedControl/DEC-1`
**Decider:** imdreamrunner, 2026-11-12

A cut label hides which option a segment is, and on a phone the text size the
person sets makes labels wider than any fixed row. So a label wraps at word
breaks and its segment grows taller, and when a label would break inside a
word or the text size is large, the segments wrap into balanced rows. Every
label shows in full at every text size, as the system control does where it
draws (`spec:AST-126` FR6).

## Open questions

- **OQ1 — Does Android draw SegmentedControl with Material 3's segmented
  button?** (`human-design`) `spec:AST-126` OQ2 holds the question for
  Android hosts. Android draws Astryx's control (FR2), and the `spec:AST-082`
  FR11 gap line records it.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
