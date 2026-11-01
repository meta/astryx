---
schema_version: 3
template_version: 7
kind: component
id: component:DateInput
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/DateInput/MonthScrollerSettle.test.tsx,
    packages/core/src/DateInput/DateInput.test.tsx,
    packages/core/src/DateInput/DateInput.fr10.test.tsx,
    packages/core/src/DateInput/DateInputTouch.test.tsx,
    packages/core/src/DateInput/NativeDateField.test.tsx,
    packages/core/src/DateInput/Presentation.test.tsx,
    packages/core/src/__tests__/BusyOwnerAnnouncement.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:input-fields, family:overlay-dismissal]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:internationalization,
    architecture:public-component-api,
  ]
contributing: []
system_specs:
  [spec:AST-020/FR15, spec:AST-043, spec:AST-085, spec:AST-086, spec:AST-102]
---

# DateInput component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None. API shape and defaults are as shipped; every surface follows the input-field `changeAction`, disabled, and busy contracts.                                                                                                                                                                      |
| Behavior                | `presentation` selects the picker surface; an omitted value is `adaptive-native`; `presentation` wins over deprecated `nativePicker`; every committed path emits the same controlled ISO-date value and action feedback.                                                                              |
| End-user impact         | People type or pick one date using a surface suited to the primary pointer. Disabled and busy fields stay focusable; a busy field keeps its ordinary paint with a Spinner while new commits are blocked.                                                                                              |
| Builder impact          | None. `changeAction` runs after `onChange` with optimistic busy feedback on every surface.                                                                                                                                                                                                            |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Caller handlers while disabled, fixed field height, the English-only typed parser, a clear control that drops focus, and month paging in the touch calendar are listed under Current-state impact.                                          |
| Review checks           | Reject a surface-mapping change, lost constraint, callback-order change, unlabeled field, native `disabled`, disabled paint on a busy-only field, unreachable disabled reason, changed close behavior, or a theming target placed on the wrong owner.                                                 |
| Governing rules         | `spec:AST-043/FR1–FR5`; `spec:AST-085/FR1–FR6`; `spec:AST-086/FR3, FR4, FR6, FR8`; `family:input-fields/FR1–FR6, FR8–FR11`; `family:overlay-dismissal/FR1–FR7`, including its recorded BottomSheet adoption gap; `spec:AST-020/FR15`; `spec:AST-102/FR4`; the four architecture records linked above. |

This table is a review projection; the body below is authoritative.

## Intent

DateInput presents one controlled calendar date through a labeled input-field
surface. A person may type the value or use a Calendar, bottom-sheet calendar, or
browser/OS date picker selected by the public presentation contract.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: unchanged; DateInput remains controlled by
  `value`, with `undefined` representing no selected date
- Migration decision: `spec:AST-043/DEC-1` and `spec:AST-043/DEC-2` own the
  `presentation` vocabulary, default, deprecated `nativePicker` mapping, and
  precedence

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Selecting the pointer, bottom-sheet, or native field surface from the resolved
  public presentation.
- Parsing typed dates, formatting committed dates, enforcing DateInput constraints,
  and emitting one controlled ISO date or `undefined`.
- The DateInput field wrapper, calendar-toggle affordance, clear composition, and
  focus handoff between those controls and the selected picker surface.
- DateInput-specific composition of Field, Calendar, Popover, BottomSheet, and the
  browser/OS date control.
- The disabled-reason Tooltip composition: DateInput renders the reason Tooltip
  and links it from its focusable controls (`family:input-fields`
  representative matrix, "Member with `disabledMessage`").

**Does not own / non-goals**

- Label, description, status, width, and shared clear-button presentation —
  owned by `component:Field`, `component:FieldStatus`, and `family:input-fields`.
- Calendar-grid dates, navigation, and selection semantics — owned by
  `component:Calendar`.
- Popover hosting and topmost dismissal — owned by `component:Popover` and
  `family:overlay-dismissal`.
- Bottom-sheet hosting and dismissal — owned by `component:BottomSheet` and the
  overlay-dismissal family. The bottom-sheet surface inherits BottomSheet's recorded
  shared-dismissal adoption gap.
- Cross-component picker vocabulary and deprecated-prop migration — owned by
  `spec:AST-043`.
- Browser/OS picker appearance, locale, momentum, or hit areas.

## Public concepts

| Concept                 | Closed values or states                                                         | Meaning                                                    | Availability by variant/orientation/state                                                                                                  | Default           | Owner                                           | Stability            | Invalid-value behavior                                                                  |
| ----------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ----------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| selected date           | `undefined` or `YYYY-MM-DD` ISO date                                            | Controlled committed calendar date                         | Every surface                                                                                                                              | `undefined`       | `component:DateInput`                           | stable               | Types reject other values; unparseable typed text is announced and reverts on commit    |
| presentation            | `popover`, `bottom-sheet`, `native`, `adaptive-bottom-sheet`, `adaptive-native` | Surface that collects the date                             | Every pointer; adaptive values resolve by primary pointer                                                                                  | `adaptive-native` | `spec:AST-043`                                  | stable               | Types reject other values; DateInput has no text-only presentation                      |
| legacy native selection | `touch`, `always`, `never`                                                      | Deprecated mapping to the released picker behavior         | Used only when `presentation` is absent                                                                                                    | `touch` behavior  | `spec:AST-043`                                  | deprecated, retained | `presentation` wins when both props are present                                         |
| committed display       | `date`, `date_long`, `date_weekday`, `system_date`, or formatter function       | Display shape for the committed ISO date                   | Closed field on every surface; never rewrites in-progress typed text                                                                       | `date_long`       | `component:DateInput`                           | stable               | Function output is displayed; unparsable output cannot be re-committed as typed text    |
| selectable range        | optional `min`, `max`, and date-constraint predicates                           | Dates that may commit                                      | Every surface; native surfaces validate on commit when the OS cannot disable them                                                          | unbounded         | `component:DateInput` with `component:Calendar` | stable               | A rejected date does not replace the controlled value and is announced where applicable |
| calendar configuration  | one or two popover months; week start Sunday through Saturday                   | Calendar-grid layout                                       | Week start applies to popover and bottom-sheet surfaces; month count applies only to the popover; neither is expressible by native pickers | one month, Sunday | `component:DateInput` with `component:Calendar` | stable               | Types close the value set                                                               |
| field state             | enabled, disabled, disabled with reason, busy, optional, required, status       | Shared field semantics and supporting presentation         | Every surface, with surface-specific control mechanics                                                                                     | enabled, not busy | `family:input-fields`                           | stable               | Conflicting optional/required resolution follows the shared Field owner                 |
| clear affordance        | absent or present while a committed value exists                                | Emits `undefined` and preserves the field interaction path | Every surface when `hasClear` and a value are present; hidden while disabled or busy                                                       | absent            | `component:DateInput` with `component:Field`    | stable               | No control renders when there is no value                                               |
| field shell             | standalone Field or admitted InputGroup child                                   | Ownership of label, status, and outer geometry             | Pointer surface supports both; other surfaces preserve the same public field semantics                                                     | standalone        | `family:input-fields`                           | stable               | InputGroup context selects grouped adaptation                                           |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Basis                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| FR1  | DateInput MUST present the controlled ISO `value` and emit `onChange` with the next ISO date or `undefined` without maintaining a competing committed value.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current source, docs, and focused tests                                                                       |
| FR2  | The five `presentation` values MUST resolve to the fine/coarse surfaces in `spec:AST-043/FR1`; omitting both presentation props MUST preserve `adaptive-native`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `spec:AST-043/FR1–FR3`; Presentation tests                                                                    |
| FR3  | Explicit `presentation` MUST outrank deprecated `nativePicker`; the legacy values MUST retain their mappings and development-only warning from `spec:AST-043/FR3–FR4`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current source, docs, and Presentation tests                                                                  |
| FR4  | Adaptive resolution MUST use the primary pointer rather than viewport width or any-pointer availability, so tablets receive a touch surface and touchscreen laptops retain the typable field.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source, consumer docs, and surface-selection tests                                                    |
| FR5  | Text, Calendar, bottom-sheet, and native commit paths MUST enforce `min`, `max`, and `dateConstraints`; a rejected value MUST NOT replace the controlled value.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source and all four focused suites                                                                    |
| FR6  | Named committed formats MUST follow the InternationalizationProvider locale and shared Timestamp vocabulary; formatting MUST NOT rewrite in-progress typed text. Typed text MUST parse in the provider locale (`architecture:internationalization` INV1a, INV8). Implementation gap: the typed parser accepts only English month names and ASCII digits, using the locale only to order day and month.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `architecture:internationalization`; current source, docs, locale tests; `spec:AST-043/FR5`                   |
| FR7  | Every value-change path MUST call `onChange` before `changeAction`, present the proposed value optimistically, and expose one busy state while the Action is pending.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `family:input-fields/FR6`; current source and focused tests                                                   |
| FR8  | The pointer field MUST open its Calendar from the input, calendar toggle, ArrowDown, or Alt+ArrowDown; Popover dismissal and focus return MUST remain owned by the shared Popover path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source, Popover composition, keyboard/focus tests                                                     |
| FR9  | A pointer-surface Calendar selection MUST commit and close its Popover; a bottom-sheet Calendar selection MUST remain editable in the open sheet until Save closes the surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source and pointer/touch tests                                                                        |
| FR10 | Standalone mode MUST compose Field; admitted InputGroup mode MUST remove competing Field chrome while preserving name, description, value, keyboard, focus, and editing semantics. The field has no root styling props; `control*` reaches the control box on every surface, and `container*` reaches the Field box where one renders (in a horizontal-labels FormLayout none renders and `container*` warns; inside an InputGroup it is dropped) (`family:input-fields` FR10). The field height is the shared element size for its size and MUST grow with a set text size (`spec:AST-102` FR4). Implementation gap: the height is fixed.                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `family:input-fields` FR3, FR10; `spec:AST-102` FR4; current source and tests                                 |
| FR11 | Clear MUST emit `undefined` through the ordinary change pipeline. The pointer and bottom-sheet surfaces restore field focus using their shipped timing; the native surface MUST NOT reclaim focus because doing so reopens the OS picker. Implementation gap: when the field becomes disabled or busy while its clear control holds focus, the control unmounts and focus falls to the document body; `spec:AST-085/FR4` requires focus to stay or move to a destination this record names.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source and focused clear tests; `spec:AST-085/FR4`                                                    |
| FR12 | No surface renders native `disabled`. A disabled field MUST stay focusable with `aria-disabled`, block typing, picking, clearing, and opening, describe its disabled reason when one is given, and take disabled paint. While busy (`isLoading` or a pending Action) the pointer and bottom-sheet surfaces expose `aria-disabled` and `aria-busy`, stay focusable, and block new commits; the native surface does the same for `isLoading`, and during a pending Action stays editable so the OS picker remains attached but rejects additional commits until the Action settles. A busy field that is not disabled keeps its ordinary paint and Spinner, shows no hover ring while commits are blocked, and keeps its keyboard focus ring. Caller handlers other than focus and blur MUST NOT run while the field is disabled (`spec:AST-085` FR2). Implementation gap: only a caller `onClick` is skipped while disabled; caller key, paste, and pointer handlers (such as `onKeyDown`, `onKeyUp`, `onPaste`, and `onPointerDown`) still run on every surface, the native field included. | `spec:AST-085/FR1–FR6`; `family:input-fields/FR4–FR6`; `family:buttons/FR4`; current source and focused tests |

### Allowed variation

- **AV1 — Field presentation.** Label visibility, description, required/optional
  indicators, status placement, size, explicit width, and supported InputGroup
  composition may vary without changing the selected date.
- **AV2 — Date reachability.** Bounds, custom predicates, week start, month count,
  placeholder, and committed display format may vary within their public domains.
- **AV3 — Surface selection.** A caller may force any supported surface or retain the
  adaptive default; the resulting date value and shared field semantics remain the
  same.
- **AV4 — Theme output.** Themes may restyle admitted DateInput targets while shared
  Field, Calendar, Popover, BottomSheet, Icon, and clear-button owners retain their
  own targets and semantics.

### Representative states

| State              | Required invariant                                                                                                                                                                                                                                                                                                               | Allowed variation                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| empty rest         | Labelled field shows the placeholder and calendar affordance without a committed value.                                                                                                                                                                                                                                          | Label, placeholder, size, width    |
| committed rest     | Field displays the controlled value in the selected committed format.                                                                                                                                                                                                                                                            | Format and locale                  |
| typing             | Raw typed text remains visible until commit or reversion.                                                                                                                                                                                                                                                                        | Parseable text form and locale     |
| invalid typed text | Field reflects invalid state, announces the error, and preserves the prior committed value.                                                                                                                                                                                                                                      | Invalid text                       |
| constrained date   | Unreachable dates cannot commit on any surface.                                                                                                                                                                                                                                                                                  | Bound or predicate source          |
| popover open       | Input reflects expanded dialog state and the Calendar is reachable by pointer and keyboard.                                                                                                                                                                                                                                      | Month count and week start         |
| bottom sheet open  | Touch calendar remains open across date corrections until Save.                                                                                                                                                                                                                                                                  | Visible month and wheel state      |
| native open/closed | Real date input retains its labelled controlled value while the browser/OS owns picker chrome.                                                                                                                                                                                                                                   | Engine-provided picker             |
| disabled           | Focusable with `aria-disabled` and disabled paint; mutation and activation are blocked.                                                                                                                                                                                                                                          | With or without a reason           |
| busy               | `aria-busy` on the control; the composed Spinner is silent and the field announces its busy start once (`spec:AST-086/FR8`). The field keeps its ordinary paint, new commits are blocked, and the native picker stays focusable during a pending Action and may move its transient OS highlight without emitting another change. | Explicit loading or pending Action |
| clearable          | A committed value has one labelled clear action that emits `undefined`.                                                                                                                                                                                                                                                          | Surface and value                  |
| status             | Error, warning, or success remains named and uses shared status presentation.                                                                                                                                                                                                                                                    | Status type, message, placement    |
| InputGroup         | Group owns outer field chrome while DateInput preserves its field semantics.                                                                                                                                                                                                                                                     | Group prefix or suffix content     |

### Transformation and precedence order

- **ORD1 — Surface.** Resolve explicit `presentation`; otherwise map deprecated
  `nativePicker`; otherwise use `adaptive-native`; then resolve adaptive values from
  the primary pointer.
- **ORD2 — Display.** While editing, display pending typed text; otherwise format the
  controlled or optimistic ISO value with the selected format and provider locale.
- **ORD3 — Commit.** Parse or receive the proposed date, reject it when constrained,
  call `onChange`, then start `changeAction` with the same proposed value and busy
  presentation.
- **ORD4 — Clear.** Emit `undefined` through ORD3, then apply the selected surface's
  shipped focus policy: pointer and bottom-sheet fields reclaim focus, while the native
  field does not reopen the OS picker.

### Performance and resources

- **PR1 — Bounded calendar window.** The bottom-sheet calendar mounts a bounded window
  of month panes around the visible month rather than the complete reachable century.
- **PR2 — Scroll work.** Scroll-driven measurement and selection updates remain
  animation-frame throttled or settle-driven; listeners, frames, timers, and observers
  are cleaned up on deactivation or unmount.

## Accessibility contract

- **AR1 — Field relationships.** Every surface keeps an accessible label; required,
  description, status, disabled-reason, and busy relationships remain programmatically
  exposed through the shared Field contract.
- **AR2 — Pointer combobox.** The typable field exposes combobox state and a dialog
  popup; ArrowDown and Alt+ArrowDown open it, Escape dismisses it outside active IME
  composition, and focus is not reclaimed from an intentional destination.
- **AR3 — Validation.** Invalid typed or native selections are exposed without color
  alone; rejected typed input uses an assertive alert and native rejection remains
  described to assistive technology.
- **AR4 — Disabled and busy focus.** A disabled or busy field remains focusable and
  exposes its state on the focused control (`spec:AST-085/FR1, FR5`); a disabled
  reason, when given, describes the field's focusable controls while all value
  mutation and picker activation stay blocked.
- **AR5 — Native control.** The browser/OS date input remains the labelled value owner;
  the painted committed-value overlay is excluded from the accessibility tree.
- **AR6 — Touch calendar.** The bottom-sheet Calendar preserves one reachable day per
  month, arrow-key date movement, named weekday columns, selected/today semantics,
  single-tab-stop wheels, and exactly one reachable footer action for the visible
  surface.
- **AR7 — Directionality.** DateInput's own calendar and clear controls exchange logical
  inline sides in RTL while preserving their labels and meanings; Calendar navigation
  remains owned and verified by `component:Calendar`.
- **AR8 — The month scroller is an APG grid** (`spec:AST-020/FR15`), as one
  composite control: each mounted month pane of the touch calendar's scroller
  is a `role="grid"` named for its month, with rows of `role="gridcell"` days,
  at most one day per pane holding a Tab stop,
  `aria-selected` on the chosen day; ArrowLeft and ArrowRight move by a day
  following the reading direction, ArrowUp and ArrowDown by a week, Home and End
  to the ends of the week, PageUp and PageDown by a month, and Enter or Space
  picks the focused day. Implementation gap: PageUp/PageDown do not page by a
  month.

## Design relationships

| Anatomy or state                 | Design requirement                                                               | Representation authority                    | Hierarchy role | Component contract |
| -------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------- | -------------- | ------------------ |
| Label and supporting text        | Shared Field hierarchy surrounds one coherent input boundary.                    | `family:input-fields` and `component:Field` | Supporting     | FR10, AR1          |
| Field surface                    | One stable bordered input surface contains value and end controls.               | `family:input-fields/FR1–FR2`               | Prominent      | FR1, FR7, FR10     |
| Calendar affordance              | Communicates the picker path without replacing typed entry.                      | Current source and consumer docs            | Supporting     | FR8                |
| Calendar popover                 | Presents date selection while preserving Field ownership.                        | `component:Calendar`, `component:Popover`   | Prominent      | FR5, FR8–FR9       |
| Bottom-sheet calendar            | Presents the same date contract for a coarse pointer.                            | Current source and `spec:AST-043`           | Prominent      | FR2, FR4, FR9      |
| Native picker                    | Hands picker chrome to the browser/OS while retaining DateInput field semantics. | `spec:AST-043`, browser/OS                  | Prominent      | FR2–FR6, AR5       |
| Clear, busy, and status controls | Use the shared input-family end-control and status relationships.                | `family:input-fields` and shared primitives | Supporting     | FR7, FR11–FR12     |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Label": {
    "delegatesTo": {"owner": "component:Field", "target": "field-label"}
  },
  "Text input": {"target": "date-input"},
  "Calendar icon": {"target": "date-input-toggle-icon"},
  "Calendar popover": {
    "delegatesTo": {"owner": "component:Popover", "target": "popover"}
  },
  "Clear button": {
    "delegatesTo": {"owner": "component:Field", "target": "input-clear-button"}
  },
  "Status message": {
    "delegatesTo": {"owner": "component:FieldStatus", "target": "field-status"}
  }
}
```

The `date-input` target owns the composite field surface. The
`date-input-toggle-icon` target reflects collapsed and expanded states on the icon
itself. The shared `input-clear-icon` target owns clear-glyph theming; DateInput adds no
clear-glyph target of its own.

## Family and system relationships

- `family:input-fields` owns stable field sizing, end-control space, grouped
  adaptation, disabled reasons, loading, Transition Actions, status placement,
  base-prop and part-styling targets, and the iOS-only focus-zoom floor.
- `family:overlay-dismissal` owns topmost Popover and BottomSheet dismissal. DateInput's
  Popover path uses the shared owner; its bottom-sheet path inherits BottomSheet's
  recorded adoption gap. DateInput owns only selection, open-state requests, and focus
  policy.
- `spec:AST-043` owns the picker presentation vocabulary, default, native fallback,
  deprecated mapping, and precedence.
- `spec:AST-085` owns focusable disabled and busy controls: no native `disabled`,
  blocked change paths, distinct disabled and busy paint, and focus kept when a
  control becomes inactive.
- `spec:AST-086` owns busy announcements: the composed Spinner is silent and the
  field announces each busy start once.
- `architecture:component-theming-surface` owns target admission, painting-element
  placement, state reflection, and anatomy mapping.
- `architecture:interaction-modality` owns input-modality principles; DateInput uses
  the primary pointer to choose an interaction surface rather than a width breakpoint.
- `architecture:public-component-api` owns the package/export and public-prop boundary.

## Verification map

| Contract            | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Representative states                                                                             | Mutation or failure expectation                                                                                                                                                                                                                                                                                     | Audit section                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1, ORD2           | `DateInput.test.tsx` "displays formatted date when value is provided", "calls onChange on blur when input is valid", "calls onChange with undefined when input is cleared and blurred", "clears pending input when value changes externally"; `NativeDateField.test.tsx` "keeps the control's own value ISO", "fires onChange with the ISO date the control reports"                                                                                                                                                                                                                                                                                                        | Typed, cleared, external value; native                                                            | A committed value kept beside `value`, a non-ISO change, or pending text that survives an external change fails.                                                                                                                                                                                                    | `audit:DateInput/behavior`      |
| FR2, FR3, FR4, ORD1 | `Presentation.test.tsx` cases; `DateInputTouch.test.tsx` surface-selection cases; `NativeDateField.test.tsx` nativePicker cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Each presentation on fine and coarse pointers; deprecated mappings; tablet and touchscreen laptop | A wrong surface, a lost deprecated mapping, `nativePicker` winning, or width-based resolution fails. Evidence gap: no test asserts the development warning.                                                                                                                                                         | `audit:DateInput/behavior`      |
| FR5                 | `DateInput.test.tsx` min, max, and dateConstraints typed cases; `DateInputTouch.test.tsx` "disables days outside min/max and refuses to commit them", "honors custom date constraints"; `NativeDateField.test.tsx` "refuses an out-of-range date and announces it", "refuses a date dateConstraints rejects"                                                                                                                                                                                                                                                                                                                                                                | Typed, sheet, native; bounds and predicates                                                       | A constrained date that commits on any surface fails. Evidence gap: no test asserts constraints on a popover Calendar pick.                                                                                                                                                                                         | `audit:DateInput/behavior`      |
| FR6                 | `DateInput.test.tsx` format cases, including "updates when the InternationalizationProvider locale changes (#5074)" and "does not apply format to in-progress typed input"; `NativeDateField.test.tsx` format and locale cases; `DateInputTouch.test.tsx` "updates the field and open picker when the provider locale changes"                                                                                                                                                                                                                                                                                                                                              | Named and function formats; locale change                                                         | A format that ignores the locale or rewrites typed text fails. Evidence gap: no test types a localized month name or non-ASCII digits (the FR6 gap).                                                                                                                                                                | `audit:DateInput/i18n`          |
| FR7, ORD3           | `DateInput.test.tsx` "runs changeAction after onChange for a typed date"; `NativeDateField.test.tsx` "runs changeAction after onChange and exposes the pending state"; `DateInputTouch.test.tsx` "runs changeAction and shows a busy state"; `BusyOwnerAnnouncement.test.tsx` DateInput cases; `DateInputTouch.test.tsx` "announces a busy start from a pick inside the open sheet, not behind it (spec:AST-086 FR8, Platform support)"                                                                                                                                                                                                                                     | Typed, native, sheet                                                                              | An Action before `onChange`, a missing busy state, or a missing busy announcement fails.                                                                                                                                                                                                                            | `audit:DateInput/behavior`      |
| FR8, AR2            | `DateInput.test.tsx` "opens the calendar popover on ArrowDown (keyboard, forms-13)", "opens the calendar popover on Alt+ArrowDown (keyboard, forms-13)", "input has aria-expanded attribute", "combobox input has aria-haspopup=\"dialog\" attribute", "moves focus into the calendar on each open from the toggle"; `DateInputTouch.test.tsx` "opens from the keyboard, APG combobox style"                                                                                                                                                                                                                                                                                | Pointer and touch fields                                                                          | A missing open path, combobox state, or focus move fails. Evidence gap: no test asserts Escape outside IME composition on the popover.                                                                                                                                                                              | `audit:DateInput/accessibility` |
| FR9                 | `DateInputTouch.test.tsx` "commits the tapped day and LEAVES the sheet open", "lets a second tap correct the first, still without closing", "Save closes the sheet without touching the value"                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Sheet picks and Save                                                                              | A sheet that closes on a pick or a Save that changes the value fails. Evidence gap: no test asserts that a popover Calendar pick closes the popover.                                                                                                                                                                | `audit:DateInput/behavior`      |
| FR10                | `DateInput.fr10.test.tsx` styling and per-surface cases ("has no root styling props and has the container* and control* parts", "rejects root xstyle, className, and style at compile time", "keeps control* on the control box in a horizontal-labels FormLayout") and handler-composition cases; `DateInput.test.tsx` InputGroup cases; `DateInputTouch.test.tsx` "drops the Field wrapper inside an InputGroup"                                                                                                                                                                                                                                                          | Standalone, grouped, horizontal labels; every surface                                             | A root styling prop, `control*` off the control box, or Field chrome inside a group fails. Evidence gap: no test asserts the field height or its growth with text size (the FR10 gap).                                                                                                                              | `audit:DateInput/layout`        |
| FR11, ORD4          | `DateInput.test.tsx` hasClear cases; `DateInputTouch.test.tsx` "clears from the field", "returns focus to the field without letting the page scroll"; `NativeDateField.test.tsx` "clears the value without taking focus back", "runs clear through changeAction after onChange"                                                                                                                                                                                                                                                                                                                                                                                             | Pointer, sheet, native clear                                                                      | A clear that does not emit `undefined`, a native clear that takes focus, or a clear shown while disabled fails. Evidence gap: no test covers the clear control unmounting under focus (the FR11 gap).                                                                                                               | `audit:DateInput/behavior`      |
| FR12, AR4           | `DateInput.test.tsx` disabled, loading, and disabledMessage cases (including "does not call a caller onClick while disabled (AST-085 FR2)" and "links the reason tooltip from the calendar button too (AST-085 FR5)"); `DateInputTouch.test.tsx` open-sheet disablement and disabled cases; `NativeDateField.test.tsx` "keeps a disabled control focusable and its toggle inert (AST-085 FR1, FR2)", "does not call a caller onClick while disabled (AST-085 FR2)"; `DateInput.test.tsx` disabled theme-state cases                                                                                                                                                         | Disabled with and without a reason; loading; open picker becoming disabled                        | Native `disabled`, a change or open while disabled, a caller `onClick` while disabled, a reason not linked from each focusable control, or a missing `aria-busy` fails. Evidence gap: no test asserts that caller key, paste, or pointer handlers are skipped while disabled (the FR12 gap) or the busy-only paint. | `audit:DateInput/accessibility` |
| AR1, AR3, AR5       | `DateInput.test.tsx` label, required, description, status, and invalid-input cases ("announces an alert message when typed input is invalid", "resolves the invalid-date announcement from the i18n catalog"); `NativeDateField.test.tsx` "keeps the overlay out of the accessibility tree", "keeps the field labelled, required-marked, and ref-forwarded"; `DateInputTouch.test.tsx` "associates the label natively, so the field is named without ARIA"                                                                                                                                                                                                                  | Every surface                                                                                     | A missing label, required, description, status, or invalid announcement, or an exposed native overlay, fails.                                                                                                                                                                                                       | `audit:DateInput/accessibility` |
| AR6, AR8, PR1       | `DateInputTouch.test.tsx` calendar-surface cases ("mounts a window of months around the visible one, not the whole century", "leaves exactly one day per month tab-reachable", "gives a spilled date no tab stop in the pane that borrows it", "moves keyboard focus by date, across the month boundary", "follows the reading direction under RTL: ArrowLeft moves to the next day", "moves a week at a time with the vertical arrows", "labels the columns with three-letter weekday names", "marks the selection and today") and wheel cases ("is a single tab stop driven by the arrow keys", "shows exactly one footer action, and only the visible one is reachable") | Touch calendar and wheels; RTL                                                                    | A second Tab stop per month, a wrong arrow move, reversed RTL arrows, an unbounded month window, or more than one reachable footer action fails. Evidence gap: no test asserts Home, End, PageUp, PageDown (the AR8 gap), or Enter and Space on a day.                                                              | `audit:DateInput/accessibility` |
| AR7                 | `apps/storybook/rtl-audit/targets.json` DateInput entry; `DateInputTouch.test.tsx` RTL scroll-offset cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | RTL                                                                                               | A changed audit target or RTL offset fails.                                                                                                                                                                                                                                                                         | `audit:DateInput/rtl`           |
| PR2                 | `MonthScrollerSettle.test.tsx` cases; `DateInputTouch.test.tsx` "a rest position between two months" cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Settle and re-snap                                                                                | A scroller that never settles or corrects mid-gesture fails. Evidence gap: no test asserts listener, frame, and observer cleanup on unmount.                                                                                                                                                                        | `audit:DateInput/behavior`      |
| Theming anatomy     | `DateInput.test.tsx` clear-icon and calendar-toggle icon theme-target cases; `themingTargets.test.ts`; `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Toggle, clear glyph, disabled root                                                                | A missing or moved target, or a stale anatomy mapping, fails.                                                                                                                                                                                                                                                       | `audit:DateInput/theming`       |

## Current-state impact

- **Caller handlers while disabled (FR12).** Caller key, paste, and pointer
  handlers run on a disabled field on every surface; only `onClick` is skipped,
  against `spec:AST-085` FR2.
- **Fixed field height (FR10).** The field holds the shared element height
  instead of growing with a set text size, against `spec:AST-102` FR4.
- **English-only typed parser (FR6).** Typed dates parse only English month
  names and ASCII digits, so a localized committed value cannot be retyped as
  shown, against `architecture:internationalization` INV1a and INV8.
- **Clear control under focus (FR11).** A clear control that unmounts while
  focused drops focus to the page, against `spec:AST-085` FR4.
- **Month paging (AR8).** PageUp and PageDown do not page the touch calendar by
  a month, as AR8 states they do.

## Decision log

No component-local decision. The governing presentation decisions are
`spec:AST-043/DEC-1` through `DEC-3`.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples, current audit results,
implementation steps, Calendar/Popover/BottomSheet internals, or input-family and
presentation-system rules. It links to those owners and records only DateInput's
observable composition and current evidence boundaries.
