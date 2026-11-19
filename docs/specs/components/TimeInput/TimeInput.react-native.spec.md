---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/TimeInput
platform_of: component:TimeInput
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
families: [family:input-fields]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs:
  [
    spec:AST-043,
    spec:AST-082,
    spec:AST-085,
    spec:AST-086,
    spec:AST-093,
    spec:AST-117,
    spec:AST-118,
  ]
---

# TimeInput (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `TimeInput` under core's name with core's `label`, `isLabelHidden`, `description`, `isOptional`, `isRequired`, `isDisabled`, `disabledMessage`, `value`, `onChange`, `isLoading`, `min`, `max`, `hasSeconds`, `hasClear`, `hourFormat`, `increment`, `presentation` (and the deprecated `nativePicker`), `placeholder`, `size`, `status`, `statusVariant`, `labelTooltip`, `entryErrorBehavior` and `onEntryErrorChange`, with core's meaning and defaults. Its ref is an input handle (`focus`, `blur`, `isFocused`). The iOS contract adds `pickerStyle` (FR2). Web's `changeAction`, `width`, `containerXstyle`, `controlXstyle` and HTML attributes stay in the web contract (DEC-1). |
| Behavior                | `presentation` picks the surface as core does, with a finger as the pointer until a mouse or trackpad touches the field: the typed field, the Astryx sheet's time wheels, or the native picker. The native picker is UIDatePicker on iOS and Material 3's time dialog, opened from the field, on Android; where it cannot show the call site, the typed field draws.                                                                                                                                                                                                                                                                                                                                           |
| End-user impact         | A person on a phone gets the platform's time picker by default, types a time in their locale's form when they prefer, and with VoiceOver or TalkBack steps the time up and down. A disabled field stays reachable and says why.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Builder impact          | An app passes core's TimeInput props, and the same code renders on iOS and Android; an iOS app may pick UIDatePicker's style with `pickerStyle`. Values stay ISO times.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Compatibility/readiness | Not yet released; additive. Draft. The core and web contracts are unchanged. Gaps are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Review checks           | Reject a surface other than the one `presentation` names, a native picker that silently drops seconds, the step or the bounds, a commit outside `min` and `max`, a web-only prop accepted and ignored, an iOS-only prop offered on Android, a disabled field that changes value or leaves the screen reader, a field read as more than one element, a visual value not taken from the theme, or a third-party native dependency.                                                                                                                                                                                                                                                                               |
| Governing rules         | `component:TimeInput` FR1–FR15 and ORD; `spec:AST-043` FR1–FR4; `spec:AST-117`; `spec:AST-118`; `family:input-fields`; `spec:AST-085` FR1–FR2; `spec:AST-086` FR8; `spec:AST-082` FR3–FR5 and FR7; `spec:AST-093` FR2–FR4; `spec:AST-126` FR2, FR7 and FR10–FR12; `spec:AST-127` FR4; DEC-1 and DEC-2 below.                                                                                                                                                                                                                                                                                                                                                                                                   |

This table is a review projection; the body below is authoritative.

## Intent

A time on a phone is usually picked, not typed, so TimeInput on React Native
reaches for the platform's own time picker and keeps core's typed field and
sheet wheels for the call sites that ask for them. It keeps core's props,
surfaces and ISO values, so a form reads the same on the web and on a phone.
This record states only what React Native adds to `component:TimeInput` or does
differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: controlled through `value` and `onChange`,
  as in core
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR1 gap: clearing reports `''` to `onChange` instead of `undefined`.
- FR1 gap: the package does not offer `entryErrorBehavior` or
  `onEntryErrorChange`; the typed field reverts a rejected draft without a
  message (FR5).
- FR2 gap: `pickerStyle` is offered on Android, where it changes nothing.
- FR3 gap: an omitted `presentation` draws the typed field unless a theme or
  the app provider opts in to the native picker, instead of core's
  `adaptive-native`.
- FR3 gap: `bottom-sheet`, and `adaptive-bottom-sheet` under a finger, draw the
  typed field instead of the sheet's time wheels.
- FR5 gap: the typed field commits only on Enter or blur, never as soon as the
  draft reads as an in-range time.
- FR6 gap: a hardware keyboard's arrow keys do not step the time.
- FR8 gap: loading that starts is not announced; only the busy state changes.

## Ownership boundary

**Owns**

- Which of core's props React Native offers, and the iOS-only `pickerStyle`
  (FR1, FR2).
- Which surface draws on React Native and when the native picker falls back
  to the typed field (FR3, FR4).
- The typed field's keyboard, commit and screen-reader stepping on React Native
  (FR5, FR6).
- How the field reads to screen readers, inside a field and inside an
  `InputGroup` (FR9, FR10).

**Does not own / non-goals**

- The meaning of TimeInput's props, its surfaces, its hour format and its
  rejected entries — owned by `component:TimeInput`, `spec:AST-043`,
  `spec:AST-117` and `spec:AST-118`.
- The native time picker views and dialogs — owned by `spec:AST-126`.
- Whether the date family takes `render` — owned by `spec:AST-126` OQ3.
- Field labels, descriptions and status lines — owned by `family:input-fields`.
- The clock glyph — owned by `spec:AST-127`.

## Public concepts

| Concept      | Closed values or states                  | Meaning                                                                              | Availability by variant/orientation/state | Default                                             | Owner                              | Stability    | Invalid-value behavior           |
| ------------ | ---------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------- | --------------------------------------------------- | ---------------------------------- | ------------ | -------------------------------- |
| surface      | typed field; sheet wheels; native picker | what selects the time, from `presentation` and the pointer                           | every value                               | `adaptive-native`: the native picker under a finger | `spec:AST-043` FR1                 | experimental | an unknown value is a type error |
| pointer      | finger; mouse or trackpad                | a finger until a mouse or trackpad touches the field, then fine for the field's life | always                                    | finger                                              | `component:react-native/TimeInput` | experimental | none                             |
| picker style | `compact`; `inline`; `wheels`            | how UIDatePicker draws under the native surface on iOS                               | iOS only, native surface                  | `compact`                                           | `component:react-native/TimeInput` | experimental | a type error on Android          |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Basis                                                                                           | Draft review state |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------ |
| FR1  | React Native's `TimeInput` MUST take core's props, as the Public contract row lists them, with core's names, meaning and defaults: `value`, `min` and `max` are ISO times, and `onChange` receives the new ISO time, or `undefined` when cleared. Base props are `id` and `isHidden` (`spec:AST-082` FR7) on the control. Its ref is an input handle with `focus`, `blur` and `isFocused`. It MUST NOT offer `changeAction`, `width`, `containerXstyle`, `controlXstyle` or HTML attributes such as `name` (DEC-1).                                                                                                                                                                                                                                                                                    | `component:TimeInput`; `spec:AST-082` FR3, FR4, FR7; DEC-1                                      | verify             |
| FR2  | The iOS contract MUST add `pickerStyle` for the native surface (DEC-2): `compact`, the default, shows UIDatePicker's compact pill in the field row with its own popover; `inline` (a time list) and `wheels` show a pill that opens that picker in the library's sheet, with Cancel at the start and Done at the end, and only Done changes the value. With no value, the field shows a placeholder pill that opens the picker in the sheet, because UIDatePicker always holds a time. `pickerStyle` is absent from the Android types, where using it is a type error.                                                                                                                                                                                                                                 | `spec:AST-126` FR7; `spec:AST-082` FR5; DEC-2                                                   | verify             |
| FR3  | `presentation` and the pointer MUST pick the surface as `spec:AST-043` FR1–FR4 state, with `adaptive-native` as the default, `nativePicker` mapped as core maps it, and `presentation` winning when both are set. The pointer is a finger until a mouse or trackpad touches the field, and then fine for the field's life. `text-input` and `popover` draw the typed field; `bottom-sheet`, and `adaptive-bottom-sheet` under a finger, draw the sheet's time wheels (`component:TimeInput` FR7); `native`, and `adaptive-native` under a finger, draw the native picker (FR4). A forced value never draws another surface, except the native fallback of FR4.                                                                                                                                         | `spec:AST-043` FR1–FR4; `component:TimeInput` FR1, FR7                                          | verify             |
| FR4  | The native surface MUST be the platform's picker where its native piece is present (`spec:AST-126` FR7): on iOS, UIDatePicker in the style of FR2; on Android, the Astryx field, whose press opens Material 3's time dialog, and dismissing the dialog leaves the value unchanged. It takes the resolved hour cycle, the minute step and the bounds, and enforces `min` and `max` on commit. It draws only where it can show the call site: no `hasSeconds`, an `increment` the picker steps by (on iOS a whole divisor of 60 up to 30, on Android 1), no `min` or `max` on Android, whose time dialog takes no bounds, and outside an `InputGroup`. Elsewhere, and where the native piece is absent, the typed field draws; an explicit `native` then warns once in development (`spec:AST-043` FR2). | `spec:AST-126` FR7; `spec:AST-043` FR2; `component:TimeInput` FR6                               | verify             |
| FR5  | The typed field MUST be a React Native text input with a leading clock glyph and the platform's numbers-and-punctuation keyboard. Typing keeps a draft that commits as `component:TimeInput` FR3, FR13 and FR14 state: a time in the active locale's form (24-hour text, the locale's day periods or the English ones, the locale's digits and separators, compact digits) inside `min` and `max`, with typed seconds dropped without `hasSeconds`, and an empty draft clearing the value. A rejected draft stays in the field and shows its rejection under `entryErrorBehavior` (`spec:AST-117`, `spec:AST-118`).                                                                                                                                                                                    | `component:TimeInput` FR3, FR13–FR15; `spec:AST-117`; `spec:AST-118`                            | verify             |
| FR6  | The typed field MUST be adjustable for VoiceOver and TalkBack: increment and decrement step the time by `increment` whole minutes, wrapping at midnight and stopping at `min` and `max`, and the field's value is the shown time, so the screen reader reads each step. A hardware keyboard's up and down arrows step it the same way (`component:TimeInput` FR4). A fractional or non-positive `increment` offers no steps.                                                                                                                                                                                                                                                                                                                                                                           | `component:TimeInput` FR4                                                                       | verify             |
| FR7  | Every surface MUST show the time in the hour format core resolves: `hourFormat`, else the locale's hour cycle, a `-u-hc-` extension included, with the locale's day-period words and digits (`component:TimeInput` FR5). An empty field shows `placeholder`, else core's localized default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `component:TimeInput` FR5                                                                       | verify             |
| FR8  | With `isLoading`, the field MUST refuse edits, steps and the picker, read as busy, show the theme's loading ring in the control, and announce the busy start once (`spec:AST-086` FR8). With `hasClear`, a clear button named by core's clear word and the label shows while a value is shown and the field is editable, and clears it through `onChange`.                                                                                                                                                                                                                                                                                                                                                                                                                                             | `component:TimeInput` FR2, FR8; `spec:AST-086` FR8                                              | verify             |
| FR9  | The control MUST be the one accessibility element of the field, named by the label, core's required word and an error's message with core's invalid word, and hinted by the description, a warning or success message and the disabled reason; the visible field words are hidden from screen readers. An error status is announced once when it appears or changes. A disabled field (its own `isDisabled` or its `InputGroup`'s) refuses edits, steps, the picker and the clear button, reads as disabled, draws the theme's disabled colours rather than reduced opacity, and keeps `disabledMessage` in its hint and on a long press.                                                                                                                                                              | `component:TimeInput` FR9, FR10; `family:input-fields`; `spec:AST-085` FR1, FR2; `spec:AST-086` | verify             |
| FR10 | Inside an `InputGroup`, the field MUST draw the typed field inside the group's border, take the group's size, disabled and required states, and add the group's label, description and status to its own name and hint as FR9 orders them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `component:TimeInput` FR10; `family:input-fields` FR3                                           | verify             |

### Allowed variation

- **AV1 — The platform's picker.** Under the native surface, the pill, the
  popover, the wheels, the time list and Material's dialog look and move as the
  platform draws them and may change with each OS release.
- **AV2 — The platform's keyboard.** The numbers-and-punctuation keyboard is
  the platform's own.

### Representative states

| State                                    | Required invariant                                                       | Allowed variation     |
| ---------------------------------------- | ------------------------------------------------------------------------ | --------------------- |
| `presentation` unset, finger             | the native picker where it can show the call site                        | the platform's picker |
| `hasSeconds` with `adaptive-native`      | the typed field, with seconds                                            | none                  |
| `native` that cannot show the call site  | the typed field and one development warning                              | none                  |
| `bottom-sheet`                           | the sheet's time wheels                                                  | the sheet's motion    |
| Android with `min` or `max`              | the typed field                                                          | none                  |
| iOS `pickerStyle="wheels"` with no value | a placeholder pill that opens the wheels in the sheet; only Done commits | the system's wheels   |
| typed draft out of range                 | the draft stays and shows its rejection                                  | message text          |
| screen reader increment at 23:59         | wraps to the next minute after midnight, within `min` and `max`          | none                  |
| disabled with a reason                   | no change; disabled; the reason in the hint and on a long press          | tooltip placement     |
| inside an `InputGroup`                   | the typed field; the group's words in the name and hint                  | none                  |

### Transformation and precedence order

- **ORD1 — Surface.** `presentation`, else `nativePicker` mapped as core maps
  it, else `adaptive-native`; then the pointer (`spec:AST-043` FR1–FR4); then
  FR4's fallback when the native picker cannot show the call site.
- **ORD2 — Hour format.** `hourFormat`, then the locale's `-u-hc-` extension,
  then the locale's own hour cycle (`component:TimeInput` FR5).
- **ORD3 — Availability.** Disabled (the field's own or the group's), then
  loading, then editable.
- **ORD4 — Spoken words.** Name: the group label, the label, the required word,
  an error's message, the invalid word. Hint: the description, a warning or
  success message, the disabled reason.

### Performance and resources

- **PR1 — Bounded resources.** The field holds no timers; a native dialog is
  open only while the person picks, and the status announcement lives only
  while the field is mounted.

## Accessibility contract

- **AR1 — One element.** The control, the native pill or the Astryx field is
  the field's accessibility element, with the name, hint, value and states of
  FR9; the native picker's own views are the system's (`spec:AST-126` FR12).
- **AR2 — Stepping.** The typed field is adjustable (FR6).
- **AR3 — Reachable when disabled.** A disabled field stays reachable by
  VoiceOver and TalkBack and says why through its hint (FR9).
- **AR4 — Text size.** The field's text and the control grow with Dynamic Type
  and Android's font scale; the native picker follows the system's text size.

## Design relationships

| Anatomy or state     | Design requirement                                                                   | Representation authority   | Hierarchy role  | Component contract |
| -------------------- | ------------------------------------------------------------------------------------ | -------------------------- | --------------- | ------------------ |
| Typed field          | a bordered control with a clock glyph and the time                                   | theme intent               | primary control | FR5, FR6           |
| Native pill or field | UIDatePicker's pill on iOS; the Astryx field that opens Material's dialog on Android | prescribed by the platform | primary control | FR2, FR4           |
| Sheet wheels         | hour, minute, optional second and day-period wheels                                  | theme intent               | primary control | FR3                |
| Clear button         | a button named by the clear word and the label                                       | theme intent               | supporting      | FR8                |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): UIDatePicker on iOS and Material 3's
time dialog on Android, through `spec:AST-126` FR7, under the native surface,
which is the default under a finger. The typed field is a React Native text
input for the call sites the picker cannot show and for `text-input`.
Guideline pages: Pickers and Accessibility (Dynamic Type, VoiceOver) in the
Apple Human Interface Guidelines; Time pickers and Accessibility in Material 3
(`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): the field family's control colours,
border, radius, sizes and type, its disabled colours, the focus outline, the
loading ring's colour and the text size scale; under the native surface, the
tokens `spec:AST-126` FR11 lists for the date picker (the mode and the accent).

### Native pieces

| Native piece           | Record                        | What this record uses it for                                         |
| ---------------------- | ----------------------------- | -------------------------------------------------------------------- |
| `AstryxDatePickerView` | `spec:AST-126` FR7, FR10–FR12 | UIDatePicker's pill, popover, time list and wheels on iOS (FR2, FR4) |
| `AstryxDatePicker`     | `spec:AST-126` FR7            | Material 3's time dialog on Android (FR4)                            |
| `Icon` resolution      | `spec:AST-127` FR4            | the typed field's clock glyph (FR5)                                  |

## Family and system relationships

- `component:TimeInput` owns the props, surfaces, typed parsing, stepping, hour
  format, clear and rejected entries; this record states how React Native draws
  them.
- `spec:AST-043` owns `presentation`; `spec:AST-117` and `spec:AST-118` own
  when and how a rejected entry shows.
- `spec:AST-126` owns the native time picker views and dialogs.
- `family:input-fields` owns the field's label, description, status and
  `InputGroup` composition.

## Verification map

| Contract                             | Verification                                                                                                                     | Representative states                                                                                                       | Mutation or failure expectation                                                                                                         | Audit section                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| FR1, FR2                             | Type tests against core's TimeInput contract and each platform's types                                                           | each core prop; each web-only prop; `pickerStyle` on iOS and on Android; the ref's methods                                  | a web-only prop that type-checks, `pickerStyle` accepted on Android, or a cleared value other than `undefined` fails                    | `audit:react-native/TimeInput/api`      |
| FR3, FR4, ORD1                       | Unit tests of the surface choice through the testing doubles, with and without the native piece; simulator and emulator captures | each `presentation`; `nativePicker`; a finger and a mouse; `hasSeconds`; an increment of 7; Android bounds; an `InputGroup` | a surface other than the named one, a native picker that drops seconds, the step or the bounds, or a fallback without its warning fails | `audit:react-native/TimeInput/surface`  |
| FR5, FR7, ORD2                       | Unit tests of typed parsing and display in several locales                                                                       | 24-hour text; day periods; compact digits; seconds with and without `hasSeconds`; out of range; empty; `-u-hc-`             | a wrong commit, a commit outside the range, a rejected draft that disappears, or text in the wrong hour format fails                    | `audit:react-native/TimeInput/typed`    |
| FR6, AR2                             | Unit tests of the accessibility actions; VoiceOver and TalkBack checks; hardware keyboard checks                                 | increment; decrement; midnight; `min`; `max`; fractional `increment`                                                        | a step that passes a bound, a missing wrap, or a value that differs from the shown time fails                                           | `audit:react-native/TimeInput/stepping` |
| FR8, FR9, FR10, ORD3, ORD4, AR1, AR3 | Unit tests of the field's accessibility props and states                                                                         | loading; disabled with and without a reason; required; error; warning; inside an `InputGroup`                               | a second element, a part out of order, a change while blocked, opacity on a disabled field, or a busy start not announced once fails    | `audit:react-native/TimeInput/a11y`     |

## Decision log

### DEC-1 — React Native keeps core's TimeInput; web-only props stay on the web

**Reference:** `component:react-native/TimeInput/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

React Native's TimeInput takes core's props with core's names and meaning, so a
form reads the same on the web and on a phone. The web contract keeps what an
app platform has no honest form for (`spec:AST-082` FR3, FR4): `changeAction`,
a callback that returns a promise, since an app shows pending work with
`isLoading`; `width`, `containerXstyle` and `controlXstyle`, web styling
inputs; and HTML attributes such as `name`, because an app has no HTML form to
submit.

### DEC-2 — iOS picks UIDatePicker's style with `pickerStyle`

**Reference:** `component:react-native/TimeInput/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

UIDatePicker draws a time three ways: a compact pill, a time list and wheels.
An iOS app chooses among them with `pickerStyle`, a presentation choice in the
iOS contract (`spec:AST-082` FR5). Material 3 has one time dialog, so Android
has no such prop.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
