---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/DateInput
platform_of: component:DateInput
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [public-api, behavior, interaction, layering, accessibility, platform]
verified_by: []
modules: []
families: [family:input-fields]
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-043, spec:AST-082, spec:AST-093]
---

# DateInput (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Web's `DateInput` props with web's names and defaults, values as ISO `YYYY-MM-DD` strings, without `width` and the `container*` and `control*` styling props. React Native adds `pickerStyle` on iOS. The ref is an `InputHandle` on the control.                                                                                                                                                                               |
| Behavior                | `presentation` picks the surface as `spec:AST-043` says: the platform's date picker on touch where it is present, the bottom-sheet calendar where it is not, and the popover under a mouse or trackpad. The Astryx field commits a complete typed date as it is typed, or at Return or blur without a full year, and its calendar toggle opens the Calendar. A calendar other than Gregorian never shows the platform's picker. |
| End-user impact         | A person picks a date with the phone's own date picker or types one; VoiceOver and TalkBack users move it a day or a month at a time without opening anything.                                                                                                                                                                                                                                                                  |
| Builder impact          | Web code ports with these differences: the styling props are gone, and `pickerStyle` chooses UIDatePicker's style on iOS. The gap lines list where the package differs.                                                                                                                                                                                                                                                         |
| Compatibility/readiness | Not released. Draft. The web contract is unchanged. Gap lines under FR1–FR4.                                                                                                                                                                                                                                                                                                                                                    |
| Review checks           | Reject a surface chosen by screen size, a native picker shown for a non-Gregorian calendar, a value that bypasses `min`, `max` or `dateConstraints`, a prop accepted and ignored, an unnamed toggle, a clear button without the field's name, or a native picker that drops the field's label.                                                                                                                                  |
| Governing rules         | `component:DateInput`; `spec:AST-043` FR1–FR4; `family:input-fields`; `spec:AST-082` FR3, FR5, FR7, FR11; `spec:AST-093` FR1–FR5; `spec:AST-118` FR4.                                                                                                                                                                                                                                                                           |

This table is a review projection; the body below is authoritative.

## Intent

DateInput on React Native is web's one-date field: the same props, constraints
and field chrome, shown with the phone's own date picker where the platform has
one and with Astryx's typed field and calendar where it does not.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive (a new platform contract; the web contract is unchanged)
- Controlled/uncontrolled behavior: controlled, as on the web: the caller owns `value`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- How React Native renders web's `DateInput`: its props, values and field
  composition (FR1, FR6).
- Which surface each `presentation` shows on a phone or tablet (FR2).
- How the field shows the platform's date picker, its values and
  `pickerStyle` (FR3).
- The Astryx field's typed entry, calendar toggle and clear button (FR4), and
  its disabled and busy states (FR5).

**Does not own / non-goals**

- The meaning of the web props and the presentation vocabulary — owned by
  `component:DateInput` and `spec:AST-043`.
- The calendar grid — owned by `component:Calendar`; the sheet and popover —
  owned by `component:BottomSheet` and `component:Popover`.
- Label, description, status and required words — owned by
  `family:input-fields` and `component:Field`.

## Public concepts

| Concept        | Closed values or states                                                         | Meaning                                                                                                 | Availability by variant/orientation/state                                                                                    | Default           | Owner                              | Stability    | Invalid-value behavior                    |
| -------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------- | ------------ | ----------------------------------------- |
| value          | an ISO `YYYY-MM-DD` date; `undefined`                                           | the committed date; `undefined` is none                                                                 | always                                                                                                                       | `undefined`       | `component:DateInput`              | experimental | a string that is not a date shows no date |
| `presentation` | `adaptive-native`; `native`; `adaptive-bottom-sheet`; `bottom-sheet`; `popover` | which surface picks the date (FR2)                                                                      | always                                                                                                                       | `adaptive-native` | `spec:AST-043`                     | experimental | an unknown value is a type error          |
| surface        | native picker; bottom sheet; popover                                            | what a person picks with, resolved from `presentation`, the pointer and the calendar                    | always                                                                                                                       | —                 | `component:react-native/DateInput` | experimental | none                                      |
| pointer        | touch; fine                                                                     | touch until a mouse or trackpad presses the field                                                       | always                                                                                                                       | touch             | `component:react-native/DateInput` | experimental | none                                      |
| `pickerStyle`  | `compact`; `inline`; `wheels`                                                   | how UIDatePicker draws: its compact pill, or a pill that opens the inline calendar or wheels in a sheet | iOS, under the native picker; iOS only because these are UIDatePicker's own styles and Android's date picker dialog has none | `compact`         | `component:react-native/DateInput` | experimental | an unknown value is a type error          |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Basis                                                                                               | Draft review state |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------ |
| FR1 | React Native's `DateInput` MUST take web's props with web's names, defaults (`md`, `attached`, one month, Sunday first, `date_long`, the "Select a date" placeholder) and meaning: `label`, `isLabelHidden`, `description`, `isOptional`, `isRequired`, `isDisabled`, `disabledMessage`, `value`, `onChange`, `isLoading`, `min`, `max`, `placeholder`, `size`, `status`, `statusVariant`, `labelTooltip`, `hasClear`, `numberOfMonths`, `weekStartsOn`, `format`, `calendar`, `presentation`, the deprecated `nativePicker`, `changeAction`, `dateConstraints`, `onEntryErrorChange` and `entryErrorBehavior`, and `pickerStyle` on iOS (FR3), and no other props. `value` is an ISO `YYYY-MM-DD` date, or `undefined` for no date, and clearing calls `onChange(undefined)`, as on the web. Base props follow `spec:AST-082` FR7 on the control, and the ref is an `InputHandle` on it. It MUST NOT offer a prop it does not honor: `width` and the `container*` and `control*` styling props are web styling.                                                                                                                                                                                                                                                                         | `component:DateInput` FR1, FR11; `spec:AST-082` FR3, FR5, FR7                                       | verify             |
| FR2 | `presentation` MUST resolve as `spec:AST-043` FR1–FR3 and `component:DateInput` FR2 and FR3 state: an omitted value is `adaptive-native`, the platform's date picker on touch where it is present, else the bottom sheet, and the popover under a fine pointer; `native` always shows the platform's picker; `adaptive-bottom-sheet` shows the bottom sheet on touch and the popover under a fine pointer; `bottom-sheet` and `popover` show that surface on every pointer. `presentation` outranks the deprecated `nativePicker` (`touch`, `always`, `never`). React Native departs from `component:DateInput` FR4's primary-pointer rule, because the platform reports no primary pointer: the pointer is touch until a mouse or trackpad presses the field, and fine for the field's life after that. A calendar other than `gregory` or `iso8601` never shows the platform's picker: an explicit `native` then shows the bottom sheet on touch and the popover under a fine pointer, and warns once in development.                                                                                                                                                                                                                                                                  | `spec:AST-043` FR1–FR3; `component:DateInput` FR2, FR3, FR21                                        | verify             |
| FR3 | Under the native picker, the field MUST show the platform's date picker inside the component's own label, description and status, with values read and written as ISO dates through the Gregorian calendar in the device's time zone, so a date stays on its calendar day. On iOS it is UIDatePicker: with `pickerStyle` `compact` the field row shows UIDatePicker's compact pill with its own calendar; with `inline` or `wheels`, or with no value, a pill opens that picker in the library's sheet with Cancel and Done, and only Done changes the value. On Android the Astryx field opens Material 3's date picker dialog, and dismissing it leaves the value. The picker takes the locale, the first weekday, `min`, `max`, and the theme's accent and mode, and a pick that `dateConstraints` refuses keeps the committed date and shows and announces the field's rejection message, as `spec:AST-118` FR4 states for a restored value. A pick from a surface that gives no system feedback (the compact pill's calendar, the inline calendar, the dialog) plays the theme's select haptic. `pickerStyle` is iOS only because `compact`, `inline` and `wheels` are UIDatePicker's own styles, and Android's date picker dialog has none of them.                                | `spec:AST-082` FR3; `spec:AST-093` FR2                                                              | verify             |
| FR4 | The Astryx field MUST be a bordered control box with a leading calendar toggle and a text input. Typing is never intercepted. A draft that reads as a complete date (`spec:AST-111` FR12: no trailing separator, and its last field can take no further digit) in the locale's order, with a month name or as ISO, and that lies within `min` and `max` and passes `dateConstraints` commits as soon as it is typed; a draft without a full year waits for Return or blur (`spec:AST-111` FR12); an empty draft clears at Return or blur. A draft the field rejects stays in place with the field's rejection message (`component:DateInput` FR25). The committed value shows in `format` in the provider's locale and never rewrites text being typed. The toggle, named "Open calendar" ("Close calendar" while open), opens the Calendar, named "Choose date", in a popover anchored to the field under the popover surface, where choosing a day commits it and closes the popover, or in a bottom sheet, where a chosen day stays editable until Save closes the sheet (`component:DateInput` FR9); the Calendar's days outside `min`, `max` or `dateConstraints` are disabled. With `hasClear` and a value, the clear button clears the value and returns focus to the text input. | `component:DateInput` FR5, FR6, FR8, FR9, FR11, FR20, FR25; `spec:AST-111` FR12; `spec:AST-118` FR4 | verify             |
| FR5 | A disabled or busy field (`isDisabled`, `isLoading`, or a disabled InputGroup) MUST block typing, picking, clearing and opening on every surface, hide its clear button and disable its toggle, read as disabled or busy, and carry `disabledMessage` as its disabled reason.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `component:DateInput` FR12; `spec:AST-085`                                                          | verify             |
| FR6 | Standalone, the field MUST compose the field shell: the label (hidden with `isLabelHidden`), `labelTooltip`, `description`, the optional or required mark (a FormLayout's default included) and `status` placed by `statusVariant`. Inside an InputGroup it joins the group's border and takes the group's size, disabled state, status, label and description.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `component:DateInput` FR10; `family:input-fields`                                                   | verify             |

The gap lines below describe `@astryxdesign/react-native`, the package that
implements this record.

- FR1 gap: the package reports `''` for no date, in `value` and in
  `onChange`, where web uses `undefined`.
- FR1 gap: the package does not offer `changeAction`, `dateConstraints`,
  `onEntryErrorChange` or `entryErrorBehavior`.
- FR1 gap: `format` takes the four named formats and no function, and
  `weekStartsOn` takes a number and no day name.
- FR1 gap: the Astryx surfaces read, write and draw Gregorian dates whatever
  `calendar` says.
- FR2 gap: an omitted `presentation` resolves to `adaptive-bottom-sheet`
  unless the theme's native presentation intent or the provider's
  `nativePresentation` asks for the platform's picker.
- FR2 gap: an explicit `native` where the platform's picker is absent draws
  the Astryx surface with a development warning.
- FR2 gap: inside an InputGroup the package draws the Astryx field whatever
  `presentation` says.
- FR3 gap: Android accepts `pickerStyle` and ignores it.
- FR4 gap: a draft that does not read as a date inside `min` and `max`
  returns to the committed value at blur or Return with no message, where web
  keeps it with the field's rejection message.
- FR4 gap: the package commits a typed date only at Return or blur.
- FR4 gap: the package anchors the Calendar popover to the toggle, not to
  the field.
- FR4 gap: the package names the toggle "Choose date" joined to the label
  and the bottom sheet by the label.
- FR4 gap: a day chosen in the bottom sheet commits and closes the sheet,
  where web keeps the sheet open for a correction until Save.

### Allowed variation

- **AV1 — The platform's picker.** Under the native picker, the picker's
  look, motion and dialogs are the platform's own and may change with each OS
  release.

### Representative states

| State                                           | Required invariant                               | Allowed variation |
| ----------------------------------------------- | ------------------------------------------------ | ----------------- |
| iPhone, `presentation` omitted, picker present  | UIDatePicker in the field row                    | `pickerStyle`     |
| Android, `presentation` omitted, picker present | the Astryx field opens Material 3's date dialog  | none              |
| `native` on a phone with the picker present     | the platform's picker                            | AV1               |
| iPad with a trackpad, `adaptive-native`         | the popover after the trackpad presses the field | none              |
| `calendar="persian"`, `native`                  | the Astryx surface and one development warning   | none              |
| a complete in-range date typed                  | commits once, as it is typed                     | locale order      |
| typed text that is not a date, blur             | the draft stays with the rejection message       | none              |
| `hasClear` with a value                         | the value clears; focus on the text input        | none              |
| disabled or busy                                | no typing, picking, clearing or opening          | none              |
| in an InputGroup                                | the group's border, size, status and label       | none              |

### Transformation and precedence order

- **ORD1 — Surface.** `presentation`, else `nativePicker`, else
  `adaptive-native`; then a non-Gregorian calendar → the Astryx surface; then
  the pointer.
- **ORD2 — Typed draft.** A complete date within `min` and `max` that passes
  `dateConstraints` commits as typed; without a full year it waits for Return
  or blur; empty → clear at Return or blur; otherwise → the draft stays with
  the field's rejection message.
- **ORD3 — Availability.** Disabled or busy blocks every surface before any
  commit.

### Performance and resources

- **PR1 — Closed surfaces cost nothing.** The Calendar mounts only while its
  sheet or popover is open.

## Accessibility contract

- **AR1 — One adjustable field.** The Astryx field's text input is its one
  element: named by the label with the required mark, status and description
  as the field family states, its value the spoken date, adjustable so a swipe
  up or down moves the date a day within `min`, `max` and `dateConstraints`, and with custom
  actions for the next and previous month named from the catalog. With no
  date, the first step lands on today within the bounds.
- **AR2 — Named controls.** The calendar toggle is "Open calendar" ("Close
  calendar" while open), the Calendar's sheet and popover are "Choose date",
  and the clear button is "Clear" joined to the field's label, the core's
  words (`spec:AST-082` FR3).
- **AR3 — Focus through the calendar.** When the sheet opens, its Calendar
  takes screen-reader focus on the selected day; when it closes, focus returns
  to the toggle.
- **AR4 — Native picker.** The field's label and hint reach the platform's
  picker.
- **AR5 — Direction.** The leading toggle and the trailing clear button mirror
  in right-to-left.

## Design relationships

| Anatomy or state | Design requirement                                   | Representation authority   | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Native picker    | UIDatePicker; Material 3's date picker dialog        | prescribed by the platform | primary        | FR3                |
| Astryx field     | core's bordered field with a leading calendar toggle | prescribed by core         | primary        | FR4                |
| Calendar surface | core's Calendar in a bottom sheet or popover         | prescribed by core         | supporting     | FR4                |

The component implements design requirements without copying their rationale.

Platform controls (`spec:AST-093` FR2): UIDatePicker on iOS and Material 3's
date picker dialog on Android. Guideline
pages (`spec:AST-093` FR3): Date pickers and Accessibility in the Apple Human
Interface Guidelines.

Theme values read (`spec:AST-093` FR4): the field's size, border, fill and
status colours from the input field family, the accent colour and the theme's
mode for the native picker, the calendar glyph, and the select haptic.

## Family and system relationships

- `component:DateInput` owns the props, constraints and their meaning;
  `spec:AST-043` owns the presentation vocabulary; this record states only what
  React Native adds or does differently.
- `component:Calendar` draws the calendar in the sheet and the popover.
- `family:input-fields` and `component:Field` own the label, description,
  status and required words; `component:InputGroup` owns the joined border.

## Verification map

| Contract       | Verification                                                                                           | Representative states                                                                                                                                          | Mutation or failure expectation                                                                                                                                                                                                                                      | Audit section                               |
| -------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| FR1            | Type tests of the exports against web's types; a contract drift test                                   | each prop; the styling props absent; clearing                                                                                                                  | a missing web prop, a different default, an accepted and ignored prop, or a value other than `undefined` on clear fails                                                                                                                                              | `audit:react-native/DateInput/api`          |
| FR2, ORD1      | Unit tests of surface resolution through the package's testing doubles                                 | every `presentation` and `nativePicker` value on touch and fine pointers, with the picker present and absent; a Persian calendar; an InputGroup                | a surface other than the table's, a native picker for a non-Gregorian calendar, or a missing or repeated warning fails                                                                                                                                               | `audit:react-native/DateInput/presentation` |
| FR3, AR4       | Simulator and emulator checks of the native picker; unit tests through the doubles                     | each `pickerStyle` on iOS; an empty value; Material's dialog picked and dismissed; `min` and `max`; a pick `dateConstraints` refuses                           | a pick outside the bounds, a value changed by Cancel or a dismissal, a refused pick that commits or restores silently, or a picker without the field's label fails                                                                                                   | `audit:react-native/DateInput/native`       |
| FR4, ORD2, PR1 | Unit tests of typed entry, the toggle, clear and the Calendar's mounting; a typing fuzz test           | locale orders, month names and ISO; out-of-range and unreadable drafts; the sheet and the popover; clear; the field closed, and the sheet and the popover open | a draft committed outside the bounds, a rejected draft that reverts, a bottom sheet that closes before Save, text rewritten while typing, a commit of an incomplete date while typing, focus lost after clear, or a Calendar mounted while the field is closed fails | `audit:react-native/DateInput/field`        |
| FR5, ORD3      | Unit tests of disabled and busy states                                                                 | disabled with a reason; busy; a disabled InputGroup                                                                                                            | a commit, an opened surface, or a visible clear button while disabled or busy fails                                                                                                                                                                                  | `audit:react-native/DateInput/states`       |
| FR6            | Unit tests of the field shell and InputGroup                                                           | standalone with every chrome prop; inside an InputGroup                                                                                                        | lost chrome standalone, or competing chrome in a group, fails                                                                                                                                                                                                        | `audit:react-native/DateInput/field`        |
| AR1–AR3, AR5   | VoiceOver and TalkBack checks on the Simulator and the emulator; unit tests of the accessibility props | a swipe up and down at the bounds; the month actions; the sheet opening and closing; right-to-left                                                             | a field split into elements, a step past a bound, unnamed controls, or focus left in a closed sheet fails                                                                                                                                                            | `audit:react-native/DateInput/a11y`         |

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
