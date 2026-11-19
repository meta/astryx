---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/DateTimeInput
platform_of: component:DateTimeInput
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, layout, theming, accessibility, platform]
verified_by: []
modules: []
families: [family:input-fields]
design_specs: []
architecture:
  [architecture:internationalization, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-043, spec:AST-082, spec:AST-093, spec:AST-112]
---

# DateTimeInput (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `DateTimeInput` under core's name, with core's field, value, bounds, time and `presentation` props. `value`, `min` and `max` are ISO strings, `onChange` reports a string with `''` for no value, and `weekStartsOn` takes `0` to `6` (DEC-2). The web contract's props (`changeAction`, `dateConstraints`, `timeOptionInterval`, `width`, `containerXstyle`, `controlXstyle`) are not offered. The iOS contract adds `pickerStyle` (`compact`, `inline`, `wheels`) for the system picker. |
| Behavior                | One controlled date and time. Astryx draws a date field with its calendar and a time field side by side, stacked below 400 dp; where `presentation` resolves to native, the system picker shows instead: one date-and-time picker on iOS, the date dialog and then the time dialog on Android (DEC-1). `onChange` reports a whole value only once both parts are set.                                                                                                                                           |
| End-user impact         | A person sets a date and a time with the platform's own picker where it can show the value, and with Astryx's calendar and time field where it cannot; screen readers name the date field by the label and the time field by its own name.                                                                                                                                                                                                                                                                      |
| Builder impact          | An app passes core's props with ISO strings; an iOS app may pick the system picker's style.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Compatibility/readiness | Not yet released; additive. Draft. Gaps are listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Review checks           | Reject a web contract prop offered on React Native, `pickerStyle` offered on Android, a default `presentation` other than `spec:AST-043`'s, a value reported with only one part set, a value outside `min` and `max`, a native picker that cannot show the value under `adaptive-native`, or a time field without its own name.                                                                                                                                                                                 |
| Governing rules         | `component:DateTimeInput` FR1–FR3, FR5, FR6, FR8, FR9 and FR12; `spec:AST-043` FR1–FR4; `spec:AST-082` FR3–FR5 and FR7; `spec:AST-093` FR2–FR4; `spec:AST-126` FR2 and FR7; DEC-1 and DEC-2 below.                                                                                                                                                                                                                                                                                                              |

This table is a review projection; the body below is authoritative.

## Intent

DateTimeInput on React Native is core's one field for a date and a time of day.
It shows the platform's own date-and-time picker where `presentation` asks for
it and the picker can show the value, and Astryx's date and time fields
elsewhere, so a phone app gets the system picker people know without losing
seconds, steps or calendars the system picker cannot show. This record states
only what React Native adds to `component:DateTimeInput` or does differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: controlled only; a part set while the
  other is empty waits inside the field
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR1 gap: the package does not offer `onEntryErrorChange` and
  `entryErrorBehavior`; its typed fields report no rejection kinds.
- FR4 gap: an unset `presentation` resolves to `adaptive-bottom-sheet`, unless
  a theme's `native.presentation` or the provider's `nativePresentation` opts
  in to native, where `spec:AST-043` FR1 and FR3 make it `adaptive-native`.
- FR4 gap: under `adaptive-native`, seconds or a step the system picker cannot
  take keep both Astryx fields, where `spec:AST-043` FR2 lets the date go
  native while the time falls back.
- FR5 gap: with a calendar other than `gregory` or `iso8601`, the Astryx
  fields draw Gregorian months and read and write Gregorian dates.
- FR2 gap: the package offers `pickerStyle` on Android too, where it is
  ignored.

## Ownership boundary

**Owns**

- DateTimeInput's React Native contract and the iOS contract's `pickerStyle`
  (FR1, FR2).
- The value's portable form on React Native (FR3).
- Which surface shows on React Native, and the system picker's shape on each
  platform (FR4, FR5).
- The two fields' layout, their names and the one clear (FR6–FR8).

**Does not own / non-goals**

- The meaning of DateTimeInput's props, its value rules and its words — owned
  by `component:DateTimeInput`.
- `presentation`'s values, pointer adaptation and fallbacks — owned by
  `spec:AST-043`.
- The date field, its calendar and its typing — owned by
  `component:react-native/DateInput`; the time field — owned by
  `component:react-native/TimeInput`.
- The native date picker view and the date dialogs — owned by `spec:AST-126`.
- The label block, description, status and disabled message — owned by
  `family:input-fields`.

## Public concepts

| Concept      | Closed values or states            | Meaning                                                                         | Availability by variant/orientation/state | Default                     | Owner                                  | Stability    | Invalid-value behavior          |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------- | -------------------------------------- | ------------ | ------------------------------- |
| surface      | Astryx fields; system picker       | what shows, from `presentation`, the pointer and what the picker can show (FR4) | always                                    | `spec:AST-043`'s resolution | `spec:AST-043`                         | experimental | none                            |
| picker style | `compact`; `inline`; `wheels`      | how the iOS system picker draws (FR2)                                           | iOS, with the system picker               | `compact`                   | `component:react-native/DateTimeInput` | experimental | any other value is a type error |
| layout       | row; stacked                       | the date and time fields side by side, or one above the other below 400 dp      | Astryx fields                             | row                         | `component:react-native/DateTimeInput` | experimental | none                            |
| entry        | empty; date only; time only; whole | a part set while the other is empty waits inside the field (FR3)                | always                                    | empty                       | `component:DateTimeInput`              | experimental | none                            |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                                                                           | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------ |
| FR1 | React Native MUST export the component as `DateTimeInput` (`spec:AST-082` FR3) and take core's `label`, `isLabelHidden`, `description`, `isOptional`, `isRequired`, `isDisabled`, `disabledMessage`, `value`, `onChange`, `isLoading`, `min`, `max`, `hasSeconds`, `hourFormat`, `timeIncrement`, `hasClear`, `placeholder`, `timePlaceholder`, `timeLabel`, `size`, `status`, `labelTooltip`, `numberOfMonths`, `weekStartsOn`, `presentation`, `nativePicker` and `calendar`, with core's meaning, and `onEntryErrorChange` and `entryErrorBehavior` as core defines them. The web contract's props (`changeAction`, `dateConstraints`, `timeOptionInterval`, `width`, `containerXstyle`, `controlXstyle`) are not offered, and using one is a type error. The base props `id` and `isHidden`, and the `ref`'s input handle, reach the date field (`component:DateTimeInput` FR8). | `component:DateTimeInput`; `spec:AST-082` FR3, FR4, FR7                         | verify             |
| FR2 | The iOS contract MUST add `pickerStyle` for the system picker: `compact` (the default) shows the system's compact date-and-time pill in the field row; `inline` and `wheels` show a pill that opens that picker in a sheet with Cancel and Done, where only Done changes the value. With no value the pill shows the placeholder and opens the full picker in the sheet. `pickerStyle` is absent from the Android types, where using it is a type error (`spec:AST-082` FR5).                                                                                                                                                                                                                                                                                                                                                                                                        | `spec:AST-126` FR7; `spec:AST-082` FR3, FR5                                     | verify             |
| FR3 | `value`, `min` and `max` MUST be ISO strings (`YYYY-MM-DDTHH:MM`, or with seconds), and `onChange` MUST report one whole ISO value, or `''` when the value is cleared (DEC-2). A date or a time set while the other part is empty waits inside the field and reports nothing; clearing a part of a whole value reports `''` (`component:DateTimeInput` FR1, FR2). `weekStartsOn` takes `0` (Sunday) to `6`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | DEC-2; `component:DateTimeInput` FR1, FR2; `spec:AST-126` DEC-4                 | verify             |
| FR4 | The surface MUST resolve as `spec:AST-043` FR1–FR4 say, with `adaptive-native` as the default: the system picker on a coarse pointer where the platform's date picker is present, else Astryx's fields; `native` always shows the system picker; `popover` and `bottom-sheet` force that Astryx surface. Under `adaptive-native`, a state the system picker cannot show (seconds, a `timeIncrement` it cannot step by) keeps the time field Astryx's. A calendar other than `gregory` or `iso8601` keeps Astryx's fields under `native` and `adaptive-native`, and an explicit `native` warns in development (`component:DateTimeInput` FR12).                                                                                                                                                                                                                                       | `spec:AST-043` FR1–FR4; `spec:AST-126` FR2; `component:DateTimeInput` FR3, FR12 | verify             |
| FR5 | The system picker MUST be one control for the whole value (DEC-1): on iOS one date picker in date-and-time mode, drawn as FR2 states; on Android the Astryx field, which opens the platform's date dialog and then its time dialog, where dismissing either leaves the value unchanged. The picker takes the locale, the first weekday, the minute step, the hour cycle and the bounds (`spec:AST-126` FR7). Astryx's fields read and write dates in the resolved calendar (`component:DateTimeInput` FR11).                                                                                                                                                                                                                                                                                                                                                                         | DEC-1; `spec:AST-126` FR7; `component:DateTimeInput` FR11                       | verify             |
| FR6 | Astryx's fields MUST be a date field (`component:react-native/DateInput`: a calendar toggle and typed entry, the calendar in a bottom sheet on a coarse pointer and a popover on a fine one) and a time field (`component:react-native/TimeInput`), side by side when the field is at least 400 dp wide and stacked below that (`component:DateTimeInput` FR5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `component:DateTimeInput` FR5                                                   | verify             |
| FR7 | `min` and `max` MUST bound the date, and the time on `min`'s and `max`'s own days; a whole value that would fall outside them is reported as `min` or `max` (`component:DateTimeInput` FR6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `component:DateTimeInput` FR6                                                   | verify             |
| FR8 | The date field MUST carry the label and the time field `timeLabel`, else core's time-of message with the label; both carry the required state, the description, the status and the disabled message (`family:input-fields`). With `hasClear`, one clear button on the time field clears the whole value once any part is set. `isDisabled` and `isLoading` block every value-changing path in both fields and the system picker (`component:DateTimeInput` FR9).                                                                                                                                                                                                                                                                                                                                                                                                                     | `component:DateTimeInput` FR8, FR9; `family:input-fields`                       | verify             |

### Allowed variation

- **AV1 — The system picker.** The iOS pill, its popover, the wheels and the
  Android dialogs, their layout, motion and feedback are the platform's and may
  change with each OS release.

### Representative states

| State                                 | Required invariant                                                   | Allowed variation |
| ------------------------------------- | -------------------------------------------------------------------- | ----------------- |
| no `presentation`, iOS, touch         | the system date-and-time picker                                      | the system's pill |
| no `presentation`, `hasSeconds`       | Astryx's time field                                                  | none              |
| `presentation="native"`, `hasSeconds` | the system picker                                                    | none              |
| Android, system picker                | the Astryx field opens the date dialog, then the time dialog         | the dialogs       |
| date set, time empty                  | the date waits; nothing reported                                     | none              |
| field narrower than 400 dp            | the date field above the time field                                  | none              |
| a calendar other than Gregorian       | Astryx's fields in that calendar                                     | none              |
| `pickerStyle="wheels"`, iOS           | a pill that opens the wheels in a sheet; only Done changes the value | the sheet         |

### Transformation and precedence order

- **ORD1 — Surface.** `presentation`, then `nativePicker`, then the default
  `adaptive-native` (`spec:AST-043` FR3, FR4); then the calendar; then, under
  `adaptive-native`, what the system picker can show.
- **ORD2 — Value.** A part waits until both are set; the whole value is then
  kept inside `min` and `max` and reported once.

### Performance and resources

- **PR1 — One surface.** Only the resolved surface mounts: the system picker
  or Astryx's two fields, never both.

## Accessibility contract

- **AR1 — Two named fields.** The date field reads the label and the time field
  its own name; both read the required state, the description, the status and
  the disabled message (FR8).
- **AR2 — The system picker.** The label and hint reach the system picker; the
  dialogs are the platform's own (`spec:AST-126` FR7).
- **AR3 — Status.** A status message is announced once when it appears
  (`family:input-fields`).
- **AR4 — Text size.** The fields and their words grow with Dynamic Type and
  Android's font scale; the stacked layout applies whenever the row no longer
  fits 400 dp.

## Design relationships

| Anatomy or state | Design requirement                             | Representation authority   | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------- | -------------------------- | -------------- | ------------------ |
| System picker    | the platform's date-and-time picker or dialogs | prescribed by the platform | prominent      | FR2, FR5           |
| Date field       | a bordered field with a calendar toggle        | theme intent               | prominent      | FR6                |
| Time field       | a bordered field with a clock glyph            | theme intent               | prominent      | FR6                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): iOS's date picker in date-and-time
mode, and Android's Material date and time dialogs (`spec:AST-126` FR7);
React Native's core has no date or time picker. Guideline pages: Date pickers
in the Apple Human Interface Guidelines; Date pickers and Time pickers in
Material 3 (`spec:AST-093` FR3).

Theme values read (`spec:AST-093` FR4): the field family's colours, sizes,
radius and type (`family:input-fields`), and the system picker's accent
(`spec:AST-126`).

### Native pieces

| Native piece           | Record             | What this record uses it for                                    |
| ---------------------- | ------------------ | --------------------------------------------------------------- |
| `AstryxDatePickerView` | `spec:AST-126` FR7 | the iOS date-and-time picker, its pill and its sheet (FR2, FR5) |
| `AstryxDatePicker`     | `spec:AST-126` FR7 | the Android date dialog, then the time dialog (FR5)             |

## Family and system relationships

- `component:DateTimeInput` owns the props, the value rules and the words;
  this record states how React Native shows them.
- `spec:AST-043` owns `presentation`; `spec:AST-126` owns the native date
  picker view and dialogs and maps `presentation` onto them.
- `component:react-native/DateInput` and `component:react-native/TimeInput`
  own the two Astryx fields.
- `family:input-fields` owns the label block, description, status and
  disabled message.

## Verification map

| Contract     | Verification                                                                         | Representative states                                                       | Mutation or failure expectation                                                                                                                                   | Audit section                              |
| ------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| FR1, FR2     | Type tests per platform; a contract drift test against core's DateTimeInput contract | each core prop; each web contract prop; `pickerStyle` on iOS and Android    | an offered web prop, `pickerStyle` accepted on Android, or a renamed core prop fails                                                                              | `audit:react-native/DateTimeInput/api`     |
| FR3, ORD2    | Unit tests through the package's testing doubles (`spec:AST-112` FR15)               | a lone date; a lone time; both; a part cleared                              | a value reported with one part, a clear reported as anything but `''`, or a malformed value fails                                                                 | `audit:react-native/DateTimeInput/value`   |
| FR4, ORD1    | Unit tests of the surface resolution with the doubles                                | each `presentation`; no `presentation`; `hasSeconds`; a step; each calendar | a default other than `adaptive-native`, a system picker that cannot show the value under `adaptive-native`, or a native surface in a non-Gregorian calendar fails | `audit:react-native/DateTimeInput/surface` |
| FR5          | Simulator and emulator checks of the system picker                                   | each `pickerStyle`; empty; Android dialogs; a dismissed dialog              | a value changed without Done, or a dismissed dialog that changes the value, fails                                                                                 | `audit:react-native/DateTimeInput/surface` |
| FR6          | Unit tests of the layout                                                             | 400 dp and wider; narrower                                                  | a row below 400 dp or a stack above it fails                                                                                                                      | `audit:react-native/DateTimeInput/layout`  |
| FR7          | Unit tests of the bounds                                                             | a date on `min`'s day; a time before `min`; a value past `max`              | a reported value outside the bounds fails                                                                                                                         | `audit:react-native/DateTimeInput/value`   |
| FR8, AR1–AR3 | VoiceOver and TalkBack checks; unit tests of names, clear, disabled and loading      | `timeLabel` set and unset; `hasClear`; disabled; loading; a status          | an unnamed time field, a clear that leaves a part, a change while disabled or loading, or a repeated status announcement fails                                    | `audit:react-native/DateTimeInput/a11y`    |
| PR1          | Unit tests of what mounts                                                            | the system picker; the Astryx fields                                        | both surfaces mounted at once fails                                                                                                                               | `audit:react-native/DateTimeInput/surface` |

## Decision log

### DEC-1 — The system picker is one control for the whole value

**Reference:** `component:react-native/DateTimeInput/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

iOS's date picker has a date-and-time mode that sets both parts in one
control, and Android opens its date dialog and then its time dialog from one
field. React Native's DateTimeInput uses that one control for the whole value,
so a person sets a date and a time the way the platform's own apps ask for
them.

### DEC-2 — The value crosses as ISO strings, with `''` for none

**Reference:** `component:react-native/DateTimeInput/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

A date and time crosses to native code and to the Swift and Kotlin forms of
the contract as an ISO wall-clock string, so a value stays on its calendar day
in every time zone (`spec:AST-126` DEC-4). A callback argument that may be
undefined, and a union that mixes numbers and names, have no portable form, so
a cleared value is `''` and `weekStartsOn` keeps core's numeric values.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
