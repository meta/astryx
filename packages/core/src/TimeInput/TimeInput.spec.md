---
schema_version: 3
template_version: 7
kind: component
id: component:TimeInput
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/TimeInput/TimeInput.test.tsx,
    packages/core/src/TimeInput/NativeTimeInput.test.tsx,
    packages/core/src/TimeInput/Presentation.test.tsx,
    packages/core/src/TimeInput/TimeInput.fr10.test.tsx,
    packages/core/src/InputGroup/InputGroup.test.tsx,
  ]
modules: []
families: [family:input-fields]
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:component-size-cascade,
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:internationalization,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-043, spec:AST-085, spec:AST-086, spec:AST-102]
---

# TimeInput component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. TimeInput takes an ISO time `value`, `onChange`, `changeAction`, `isLoading`, `min`, `max`, `hasSeconds`, `hourFormat`, `increment`, `hasClear`, `presentation` (and deprecated `nativePicker`), Field props, size, status, and the input-family part props.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Behavior                | `presentation` picks the surface: a typed field, the browser time picker, or bottom-sheet wheels, each committing ISO times inside the range through `onChange` and an optional `changeAction`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| End-user impact         | Desktop users type times in many forms and step with arrows; touch users get the OS picker by default. Keyboard and screen-reader users can reach a disabled field and hear invalid entries and stepped times.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Builder impact          | None.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Caller handlers other than focus, blur, and click still run while disabled, the format hint is fixed English, the clear and Save buttons scale under reduced motion, the grouped sheet field is unnamed by its own label, stepping a draft shows stale text, a focused clear button drops focus when disabled, the sheet surface is pointer-only, the sheet and native surfaces drop focus on clear, the format hint outlasts a disable, the grouped tooltip status describes nothing, time text ignores the locale's digits, separator, and day periods, and typed parsing ignores the locale and commits prefixes; all are listed under Current-state impact. |
| Review checks           | Reject a surface other than the one `presentation` names, a commit outside `min`/`max`, an Action skipped by clear, a disabled field that leaves the tab order or changes value, or `nativePicker` winning over `presentation`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Governing rules         | `spec:AST-043` FR1–FR4; `family:input-fields` FR3–FR6, FR8–FR11; `spec:AST-085` FR1, FR2, FR4, FR6; `spec:AST-086` FR3, FR4, FR8; `architecture:internationalization` INV1a, INV8; `design:reduced-motion` DR1; `architecture:interaction-modality` INV4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

This table is a review projection; the body below is authoritative.

## Intent

TimeInput collects one time of day as an ISO string. It owns time parsing,
range checks, arrow-key stepping, the choice among typed, native, and sheet
surfaces under `spec:AST-043`, and its adaptation to Field and InputGroup
under `family:input-fields`. Consumer usage lives in `TimeInput.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; `presentation="adaptive-native"`,
  `hourFormat="12h"`, `increment={1}`, no seconds, no clear, `size="md"`,
  `statusVariant="attached"`
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: controlled; `value` is an ISO time or
  `undefined`, and the field shows an optimistic value only while a
  `changeAction` is pending
- Migration decision: `nativePicker` stays as the deprecated mapping in
  `spec:AST-043` FR3

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Surface selection and its fallbacks.
- The typed field: parsing, draft, commit, invalid-entry announcement, and
  arrow-key stepping with its announcement.
- The native time control's integration and the bottom-sheet time wheels.
- The change and Action pipeline, busy state, and clear.
- Disabled and disabled-reason behavior; the `time-input` target; its grouped
  adaptation.

**Does not own / non-goals**

- Label, description, status message placement, label tooltip, and `width` —
  owned by Field under `family:input-fields` (shared owner section).
- The browser time picker's own interface — owned by the platform.
- BottomSheet and wheel mechanics — owned by `component:BottomSheet` and the
  shared wheel used by the date and time inputs.
- Combined date and time — owned by DateTimeInput.
- Read-only — not provided.

## Public concepts

| Concept       | Closed values or states                                                                       | Meaning                              | Availability by variant/orientation/state                                                                                              | Default           | Owner                 | Stability  | Invalid-value behavior                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Presentation  | `text-input`, `popover`, `bottom-sheet`, `native`, `adaptive-bottom-sheet`, `adaptive-native` | Which surface selects the time.      | Always.                                                                                                                                | `adaptive-native` | `spec:AST-043`        | Stable     | TypeScript rejects other values.                                                                                                             |
| Native picker | `touch`, `always`, `never` (deprecated)                                                       | Released surface selector.           | Ignored when `presentation` is set.                                                                                                    | unset             | `spec:AST-043`        | Deprecated | A development warning names the replacement.                                                                                                 |
| Hour format   | `12h`, `24h`                                                                                  | Display and wheel hour format.       | Typed, native (resting text), and sheet surfaces.                                                                                      | `12h`             | `component:TimeInput` | Stable     | TypeScript rejects other values.                                                                                                             |
| Seconds       | off, on                                                                                       | Whether values carry seconds.        | Typed and sheet surfaces; keeps adaptive and legacy native off. A forced native surface ignores it and commits hours and minutes only. | off               | `component:TimeInput` | Stable     | Not applicable.                                                                                                                              |
| Increment     | whole minutes                                                                                 | Arrow-key step.                      | Typed surface; not 1 keeps adaptive and legacy native off.                                                                             | `1`               | `component:TimeInput` | Stable     | A fractional increment steps by nothing: an arrow key re-commits and announces `value`, or commits the current time when the field is empty. |
| Range         | `min`, `max` ISO times                                                                        | Inclusive allowed times.             | Every surface.                                                                                                                         | unbounded         | `component:TimeInput` | Stable     | Out-of-range entries do not commit.                                                                                                          |
| Busy          | idle, busy                                                                                    | The value is loading or being saved. | `isLoading`, or while a `changeAction` is pending.                                                                                     | idle              | `family:input-fields` | Stable     | Not applicable.                                                                                                                              |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Basis                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| FR1  | Surface by `presentation` and pointer: `text-input` and `popover` → typed field; `bottom-sheet` → sheet; `native` → native picker on every pointer with no fallback; `adaptive-bottom-sheet` → typed on a fine pointer, sheet on a coarse one; `adaptive-native` → typed on a fine pointer, native on a coarse one, falling back to the typed field when `hasSeconds` or `increment` is not 1. Deprecated `nativePicker` maps `touch` → `adaptive-native`, `always` → native with the same fallbacks, `never` → `text-input`; `presentation` wins when both are set.                                                                                                                                                                                                                                                                                                                                                                                                                                 | `spec:AST-043` FR1–FR4; current tests                                                    |
| FR2  | Every surface reports changes as `onChange(isoTime \| undefined)` and then, when supplied, `changeAction` in a transition; while the Action is pending the field shows the proposed value; while `isLoading` or while the shown value differs from `value`, it sets `aria-busy`, shows a decorative Spinner, and announces the busy start once; once the Action settles the field shows `value`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `family:input-fields` FR5, FR6; `spec:AST-086` FR8; current source                       |
| FR3  | Typed field: a native text input with a leading clock icon. Typing keeps a draft and commits as soon as the draft parses to an in-range time different from `value`. On blur an empty draft commits `undefined` (when a value exists), a valid draft commits if changed, and an invalid draft reverts. An invalid draft sets `aria-invalid` and fills a persistent assertive region with the localized invalid-time message. Typed times MUST parse in the active locale, and a commit MUST reflect the whole typed time (`architecture:internationalization` INV8). Implementation gap: the parser takes no locale. It recognizes only an English `a`/`p` day period, a `:` separator, and ASCII digits, and it commits as soon as a prefix parses: typing "2.30pm" commits 02:00 from "2" and keeps it on blur; `fi-FI`'s "14.30" keeps 14:00; under `es-ES` "2:30 p. m." commits 02:30 with no warning; and `ja-JP` "午後2:30" and `ar-SA` digits are rejected.                                   | `spec:AST-086` FR3; current tests; `architecture:internationalization` INV8              |
| FR4  | Typed field: ArrowUp and ArrowDown step by `increment` minutes from `value`, or from the current time when empty, commit only when the result is in range, and announce the new time politely (in FR5's display text for the field's hour format, including FR5's digit, separator, and day-period gap). Arrow keys that belong to an IME composition do nothing. The shown text MUST match the committed and announced time. Implementation gap: stepping while a typed draft is pending commits and announces the stepped time but keeps showing the draft, and blur then commits the draft when it parses.                                                                                                                                                                                                                                                                                                                                                                                        | Current tests                                                                            |
| FR5  | Typed field: the value shows as 12-hour or 24-hour text, with seconds when `hasSeconds`. While focused, enabled, and empty, the placeholder becomes a format hint for the hour format ("e.g., 2:30 PM" or "e.g., 14:30"); otherwise it is `placeholder` or the localized default. The format hint MUST be catalog text (`architecture:internationalization` INV1a). Implementation gap: it is a fixed English string. Implementation gap: a field that becomes disabled while focused keeps showing the hint until blur. On every surface, time text MUST use the locale's digits, separator, and (for twelve-hour text) day-period words (`architecture:internationalization` INV1a, INV8). Implementation gap: every surface's field text and the stepped announcement use ASCII digits, a `:` separator, and a fixed English "AM"/"PM" whatever the locale, and the sheet's hour, minute, and second wheel options use ASCII digits; the sheet's AM/PM wheel uses the catalog's day-period words. | `architecture:internationalization`; current tests                                       |
| FR6  | Native surface: an `<input type="time">` the platform picks with, plus a clock button labelled with the localized open-picker phrase. Native edits outside `min`/`max` do not commit; they set `aria-invalid` and fill the assertive invalid-time region. A pending Action keeps the picker enabled. Clearing does not refocus or reopen the picker.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `spec:AST-043` FR2; current tests                                                        |
| FR7  | Sheet surface: a read-only combobox (`aria-haspopup="dialog"`, `aria-expanded`) that opens a BottomSheet of hour, minute, optional second, and (12-hour) meridiem wheels when tapped. Wheel options outside the range are disabled; each wheel change clamps to the range and commits. `isLoading` makes the sheet field inert as well as busy. The wheels MUST be reachable by keyboard (`architecture:interaction-modality` INV4). Implementation gap: Enter, Space, ArrowDown, and Alt+ArrowDown do not open the sheet, and the clock button is out of the tab order, so keyboard users cannot set a time on this surface.                                                                                                                                                                                                                                                                                                                                                                        | `spec:AST-043` DEC-3; current source and tests; `architecture:interaction-modality` INV4 |
| FR8  | With `hasClear`, a clear button shows while a value is shown and the field is editable. It commits `undefined` through FR2's pipeline, including `changeAction`. On the typed surface it then focuses the input (keyboard: at once; pointer: on the next frame without scrolling). Implementation gap: on the sheet surface, and on the native surface (which does not refocus so the picker does not reopen), it moves focus nowhere, so a keyboard clear leaves focus on the document body. The clear button, and the sheet's Save button, are `component:Button`s, so their press scale MUST NOT apply under reduced motion (`design:reduced-motion` DR1). Implementation gap: both still scale under reduced motion.                                                                                                                                                                                                                                                                             | `family:input-fields` FR6, FR11; current tests                                           |
| FR9  | TimeInput is disabled when its own `isDisabled` or an enclosing InputGroup's `isDisabled` is true; an enabled group never re-enables a field that disables itself (`spec:AST-085` FR7). Disabled, on every surface: `aria-disabled="true"` on the focusable control, a kept tab stop, no value change by typing, arrows, the picker, or the wheels, a dropped draft, no caller `onClick`, Enter cancelled, the clear button hidden, the control dimmed, and a keyboard focus ring. With `disabledMessage`, a reason tooltip opens on hover and keyboard focus and describes the control. Implementation gap: caller DOM handlers other than focus and blur (`onKeyDown` and the like) still run; only `onClick` is blocked. Implementation gap: when a focused clear button disappears because the field becomes disabled, focus falls to the document body; no destination is named (`spec:AST-085` FR4).                                                                                           | `spec:AST-085` FR1, FR2, FR6; `family:input-fields` FR4; current tests                   |
| FR10 | Inside InputGroup there is no Field. On the typed and native surfaces, a visually hidden label, description, and status message inside the control name and describe it, the local status icon is suppressed, and a status message is announced through the shared channel (assertive for errors, polite otherwise) when it appears. The sheet surface MUST be named and described the same way. Implementation gap: the grouped sheet field renders no hidden label, description, or status node, so it is named only by the group label, its description and status ids resolve to nothing, and its own status message is not announced (the group's status still describes it). Implementation gap: with `statusVariant="tooltip"`, the grouped typed and native fields render the hidden status message but leave it out of `aria-describedby`, so it is announced once and never describes the control.                                                                                         | `family:input-fields` FR3; `spec:AST-086`; current tests                                 |
| FR11 | Base props reach the semantic control; a caller DOM handler runs after the component's own handler for the same event and cannot cancel built-in behavior. A caller `aria-labelledby` is appended to the field label. `container*` and `control*` reach the Field box and control box; root styling is not accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `family:input-fields` FR10; current tests                                                |
| FR12 | Size and text size (typed and native surfaces; the sheet field sets no font of its own), status presentation, and click-to-focus (typed surface) match `component:TextInput` FR9, FR11, and FR12, including its implementation gaps (the fixed height against `spec:AST-102` FR4, an error status without text, and the color-only `detached` status without a message). The control box carries `astryx-time-input` with `data-size`, `data-status`, and `data-disabled`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `family:input-fields` FR8, FR9; current tests                                            |

### Allowed variation

- **AV1 — Native picker interface.** The platform decides how its picker looks
  and steps.
- **AV2 — Accepted typed forms.** The shared time parser decides which typed
  spellings parse. A parse MUST commit the time the person typed, never a
  different one (FR3 gap: prefix commits and locale separators, digits, and day
  periods).

### Representative states

| State                        | Required invariant                                               | Allowed variation |
| ---------------------------- | ---------------------------------------------------------------- | ----------------- |
| Fine pointer, default        | Typed field with clock icon.                                     | Hour format.      |
| Coarse pointer, default      | Native time picker, unless seconds or a non-1 increment.         | Platform UI.      |
| Forced `native` with seconds | Native picker anyway.                                            | —                 |
| `bottom-sheet`               | Combobox opening wheels; out-of-range options disabled.          | —                 |
| Invalid typed draft          | `aria-invalid`; assertive invalid-time message; reverts on blur. | —                 |
| Disabled with reason         | Focusable; no change on any surface; reason tooltip.             | —                 |

### Transformation and precedence order

- **ORD1 — Surface.** `presentation`, else `nativePicker`'s mapping, else
  `adaptive-native`; then pointer; then the adaptive and legacy native
  fallbacks.
- **ORD2 — Change.** `onChange`, then the optimistic value and `changeAction`.
- **ORD3 — Sheet wheel.** Compose the time from the wheels → clamp to range →
  commit if changed.

### Performance and resources

- **PR1 — Pointer query.** One coarse-pointer media query per instance decides
  the surface (the native surface's segment adds its own); the typed field adds
  no measurement.

## Accessibility contract

- **AR1 — Name and description.** Standalone, the control is named by the
  Field label (plus any caller `aria-labelledby`) and described by description,
  status message or status tooltip, disabled reason, and caller description.
  Inside InputGroup it is named and described per FR10, including its gaps for
  the sheet surface and the tooltip status variant.
- **AR2 — Announcements.** Invalid typed drafts and out-of-range native edits
  announce assertively (FR3, FR6);
  stepped times announce politely (FR4); grouped status messages on the typed
  and native surfaces announce through the channel (FR10; the sheet surface is
  a gap).
- **AR3 — Disabled.** FR9 satisfies `spec:AST-085` FR1 and FR6 on every
  surface; the FR2 gap is noted there.
- **AR4 — Sheet semantics.** The sheet field is a read-only combobox that
  reports its open state and opens a dialog. Implementation gap: it opens only
  by pointer (FR7).

## Design relationships

| Anatomy or state | Design requirement                                     | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------ | ------------------------ | -------------- | ------------------ |
| Clock icon       | Leading icon; the native surface's open-picker button. | Current source           | Supporting     | FR3, FR6           |
| Time control     | Typed text, native time input, or sheet combobox.      | Current source and tests | Prominent      | FR1                |
| Wheels           | Hour, minute, second, meridiem wheels in the sheet.    | Current source           | Prominent      | FR7                |

`design:reduced-motion` governs the clear and Save buttons' press scale (FR8);
no other design record governs TimeInput. The control box carries `time-input`; the
consumer anatomy names no control-box part, so this record carries no
anatomy-theming map.

## Family and system relationships

- `spec:AST-043` owns the presentation values, fallbacks, deprecated mapping,
  and precedence; TimeInput implements them, including the sheet DEC-3
  approves.
- `family:input-fields` owns grouped admission, disabled reasons, busy,
  Transition Actions, status placement, prop targets, and the clear tooltip.
- `spec:AST-085` owns disabled focusability; FR9 records the handler gap.
- `spec:AST-086` owns the persistent invalid-entry region and busy
  announcement.
- DateTimeInput shares the native time control and the wheel behavior.

## Verification map

| Contract       | Verification                                                                                                                                                  | Representative states                                      | Mutation or failure expectation                                                                                                                                                                                                                   | Audit section                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1, ORD1      | `Presentation.test.tsx`; `NativeTimeInput.test.tsx` mode cases                                                                                                | Each value × pointer; deprecated mapping; both props       | A substituted surface, a lost fallback, or `nativePicker` winning fails. Evidence gap: no real-browser check of the surface per pointer, as `spec:AST-043` asks. No test covers `presentation="popover"`.                                         | `audit:TimeInput/behavior`      |
| FR3–FR5, AR2   | `TimeInput.test.tsx` typing, blur, invalid, stepping, IME, and format cases                                                                                   | 12h, 24h, seconds; invalid and out of range                | A commit of an invalid time, a missing alert, or a step during IME fails. Evidence gap: no test asserts the format hint, stepping from the current time when empty, or a step that would leave the range. No test steps while a draft is pending. | `audit:TimeInput/behavior`      |
| FR6            | `NativeTimeInput.test.tsx`                                                                                                                                    | Coarse default; range; pending Action; clear; clock button | An out-of-range native commit, or a reopened picker after clear, fails.                                                                                                                                                                           | `audit:TimeInput/behavior`      |
| FR7, ORD3, AR4 | `Presentation.test.tsx` sheet cases                                                                                                                           | Forced and adaptive sheet; disabled                        | A sheet field that is not inert while disabled fails. Evidence gap: no test opens the sheet by keyboard or asserts the clock button's tab order. No test disables an out-of-range wheel option or clamps a wheel change.                          | `audit:TimeInput/behavior`      |
| FR8            | `TimeInput.test.tsx` clear cases; `NativeTimeInput.test.tsx` clear case                                                                                       | With value; empty                                          | A clear on an empty field, or no `undefined`, fails. Evidence gap: no test asserts the focus move after clear on either surface, `changeAction` on clear, or a clear or Save press under reduced motion.                                          | `audit:TimeInput/behavior`      |
| FR9, AR3       | `TimeInput.test.tsx` disabled suites; `NativeTimeInput.test.tsx` and `Presentation.test.tsx` disabled cases; `InputGroup.test.tsx` disabled-propagation cases | Each surface; with reason; draft in progress               | A lost tab stop, a value change, or a caller `onClick` fails. Evidence gap: no test asserts that caller `onKeyDown` and similar handlers still run while disabled (the FR9 gap).                                                                  | `audit:TimeInput/accessibility` |
| FR10           | `TimeInput.test.tsx` InputGroup suite                                                                                                                         | Grouped with description and status                        | A duplicate label, a visible status icon, or a missed announcement fails. Evidence gap: no test groups the sheet surface.                                                                                                                         | `audit:TimeInput/accessibility` |
| FR11           | `TimeInput.fr10.test.tsx`                                                                                                                                     | Each surface; handler composition                          | A base prop off the control, or a caller handler that cancels built-ins, fails.                                                                                                                                                                   | `audit:TimeInput/api`           |
| FR12           | `TimeInput.test.tsx` status and theme-state cases                                                                                                             | Status; disabled                                           | A missing state attribute fails. Evidence gap: no test asserts `data-size` or `data-status`.                                                                                                                                                      | `audit:TimeInput/theming`       |
| FR2, ORD2      | Evidence gap: no TimeInput test of the pending Action's optimistic value                                                                                      | —                                                          | —                                                                                                                                                                                                                                                 | `audit:TimeInput/behavior`      |
| AR1, PR1       | Covered by the FR10 and FR11 rows for naming. Evidence gap: no test asserts the single coarse-pointer query that decides the surface                          | —                                                          | —                                                                                                                                                                                                                                                 | `audit:TimeInput/behavior`      |

## Current-state impact

- **Sheet keyboard access (FR7, AR4).** The sheet surface opens only by tap or
  click, and its clock button is out of the tab order, so keyboard users cannot
  set a time there, against `architecture:interaction-modality` INV4.
- **Sheet and native clear focus (FR8).** Clearing on the sheet or native
  surface leaves keyboard focus on the document body.
- **Grouped sheet field (FR10).** Inside InputGroup the sheet field is named only
  by the group label, references missing description and status ids, and does
  not announce its own status message.
- **Stepping a draft (FR4).** Stepping while a typed draft is pending announces
  a time the field does not show, and blur then commits the draft when it
  parses.
- **Clear button focus (FR9).** A focused clear button that disappears when the
  field becomes disabled drops focus to the page, against `spec:AST-085` FR4.
- **Button press under reduced motion (FR8).** The clear button and the sheet's
  Save button scale to 0.98 on a press when the person prefers reduced motion,
  as `component:Button` FR15 records, against `design:reduced-motion` DR1.
- **Caller handlers while disabled (FR9).** A disabled TimeInput still runs a
  caller's DOM handlers other than focus and blur, such as `onKeyDown`, and
  blocks only `onClick`, against `spec:AST-085` FR2.
- **Format hint (FR5).** The focused-empty format hint is fixed English text,
  against `architecture:internationalization` INV1a, and stays shown until blur
  when a focused field becomes disabled.
- **Typed parsing (FR3, AV2).** The typed field ignores the locale's day
  periods, separator, and digits, and commits a parsed prefix, so a typed time
  can commit a different time or be rejected, against
  `architecture:internationalization` INV8.
- **Time text (FR4, FR5).** Field text on every surface and the stepped-time
  announcement use ASCII digits, a `:` separator, and a fixed English "AM"/"PM"
  in every locale, and the sheet's hour, minute, and second wheels use ASCII
  digits, against `architecture:internationalization` INV1a and INV8.
- **Grouped tooltip status (FR10).** Inside InputGroup with
  `statusVariant="tooltip"`, the typed and native fields never reference the
  hidden status message from `aria-describedby`.
- **Inherited TextInput gaps (FR12).** The fixed height (`spec:AST-102` FR4),
  an error status without a message shown only by color and an icon (WCAG 2.2
  3.3.1), and the color-only `detached` status without a message (WCAG 2.2
  1.4.1) that `component:TextInput` records apply here.
- **Source comment.** The `size` JSDoc in `TimeInput.tsx` gives 18 px and 26 px
  heights; the shipped heights come from the shared element sizes.

## Decision log

No component-local decision. TimeInput applies `spec:AST-043`,
`family:input-fields`, and `spec:AST-085`.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
