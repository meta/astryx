---
schema_version: 3
template_version: 7
kind: component
id: component:NumberInput
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/NumberInput/NumberInput.test.tsx,
    packages/core/src/NumberInput/NumberInput.fr10.test.tsx,
    packages/core/src/NumberInput/numberInputCommit.test.ts,
    packages/core/src/NumberInput/numberParser.test.ts,
    packages/core/src/NumberInput/numberParser.docblock.test.ts,
    packages/core/src/NumberInput/__tests__/NumberInput.a11y.test.tsx,
    packages/core/src/NumberInput/__tests__/NumberInput.a11y.chromium.spec.ts,
    packages/core/src/InputGroup/InputGroup.test.tsx,
  ]
modules: []
families: [family:input-fields]
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:icon-resolution-and-component-slots,
    architecture:component-size-cascade,
    architecture:component-theming-surface,
    architecture:internationalization,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-085, spec:AST-086, spec:AST-102]
---

# NumberInput component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. NumberInput is a controlled numeric field with Field props, size, status, `min`, `max`, `step`, `isIntegerOnly`, `formatValue`, `units`, steppers, wheel stepping, clear, disabled and read-only states, and the input-family part props. |
| Behavior                | A text-backed `spinbutton`. Typing edits a draft that commits only on blur or Enter, parsed for the locale and clamped to the range. Arrow keys, the wheel, and the steppers step on a grid and commit at once.                                         |
| End-user impact         | People can type or paste numbers the way their locale and spreadsheets write them, and get told at once when an entry is invalid. Keyboard and screen-reader users can reach a disabled field. Read-only is not announced.                              |
| Builder impact          | None.                                                                                                                                                                                                                                                   |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. The read-only state is not exposed to assistive technology, and the clear button scales under reduced motion; both are listed under Current-state impact.                                     |
| Review checks           | Reject an `onChange` for every keystroke, a commit of an unparsable draft, a step off the grid or past a bound, a disabled field that leaves the tab order or submits, or arrows that step during IME composition.                                      |
| Governing rules         | `family:input-fields` FR3, FR4, FR8–FR11; `spec:AST-085` FR1–FR3, FR6; `spec:AST-086` FR3, FR4; `architecture:internationalization`; `design:reduced-motion` DR1.                                                                                       |

This table is a review projection; the body below is authoritative.

## Intent

NumberInput collects one number. It owns locale-aware parsing, the draft and
commit policy, range clamping, stepping, formatted display, and the numeric
field's adaptation to Field and InputGroup under `family:input-fields`.
Consumer usage lives in `NumberInput.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; `step={1}`, wheel stepping on, no
  steppers, no clear, `size="md"`, `statusVariant="attached"`
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: controlled only; `value` (`number`, `null`,
  or `undefined`) is the committed value, and NumberInput keeps only an
  uncommitted text draft of its own
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The text-backed spinbutton and its numeric ARIA values.
- Locale-aware parsing, draft validity, and the commit, clear, or revert
  decision.
- Stepping by keyboard, wheel, and steppers, and the stepping grid.
- Formatted display at rest and the form value it submits.
- Units text, the invalid-entry announcement, and the steppers.
- The stepper icon's `numberInput:stepperDown` extension key, which
  `architecture:icon-resolution-and-component-slots` hands to NumberInput.
- Disabled, disabled-reason, and read-only behavior; the `number-input`
  target; its grouped adaptation.

**Does not own / non-goals**

- Label, description, label icon, label tooltip, status message placement, and
  `width` — owned by Field under `family:input-fields` (shared owner section).
- The clear button's own rendering and tooltip — owned by the shared clear
  control (`family:input-fields` FR11).
- InputGroup row geometry — owned by InputGroup under `family:input-fields`
  (shared owner section).
- `isLoading` and `changeAction` — not provided (`family:input-fields` AV5).
- The parser and commit helpers — internal; other components reuse them but
  they are not public.

## Public concepts

| Concept      | Closed values or states     | Meaning                              | Availability by variant/orientation/state   | Default                   | Owner                   | Stability | Invalid-value behavior                                                                                                    |
| ------------ | --------------------------- | ------------------------------------ | ------------------------------------------- | ------------------------- | ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Range        | `min`, `max`, each optional | Inclusive bounds a commit clamps to. | Always.                                     | unbounded                 | `component:NumberInput` | Stable    | `min` above `max` (after integer rounding) reverts every typed commit on blur; Enter commits nothing and keeps the draft. |
| Step         | positive finite number      | Stepping increment.                  | Arrow keys, wheel, steppers.                | `1`                       | `component:NumberInput` | Stable    | A missing, non-positive, non-finite, or (integer-only) fractional step becomes `1`.                                       |
| Integer only | off, on                     | Only whole numbers parse and commit. | Always.                                     | off                       | `component:NumberInput` | Stable    | A fractional draft is invalid.                                                                                            |
| Draft        | none, valid, invalid        | Uncommitted typed text.              | While editing.                              | none                      | `component:NumberInput` | Stable    | Not applicable.                                                                                                           |
| Clearable    | off, on                     | Whether the value may become `null`. | Widens `onChange` to accept `null` when on. | off                       | `component:NumberInput` | Stable    | Not applicable.                                                                                                           |
| Size         | `sm`, `md`, `lg`            | Control height.                      | Always.                                     | Inherited size, else `md` | `family:input-fields`   | Stable    | TypeScript rejects other values.                                                                                          |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| FR1  | The input is a native text input with `role="spinbutton"`, `inputMode` `numeric` when integer-only and `decimal` otherwise, `aria-valuemin` and `aria-valuemax` from the range, `aria-valuenow` from the committed `value`, and `aria-valuetext` set to the formatted value when `formatValue` is supplied.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current tests                                                          |
| FR2  | Typing changes only a draft; `onChange` is not called while typing. A draft is valid when it parses for the active locale (grouping, decimal separator, digit script, and sign) and, for validity display, lies within the range and meets integer-only. An invalid draft colors the text secondary, sets `aria-invalid`, and fills a persistent assertive region with the localized invalid-number message.                                                                                                                                                                                                                                                                                                                                                                                      | `spec:AST-086` FR3; `architecture:internationalization`; current tests |
| FR3  | On blur the draft resolves once and ends: an empty draft clears (`onChange(null)` when clearable and a value exists) or reverts; an unparsable or wrong-kind draft reverts; otherwise the number clamps to the range and commits with `onChange(number)` when it differs from `value`. Enter resolves a valid draft the same way and clears an empty draft when clearable. Enter commits nothing for an empty draft without `hasClear`, which stays in the field and is not marked invalid, or for an unparsable or wrong-kind draft, which stays in the field and stays invalid. Enter ends the draft only when its commit clamped. In a field that is not disabled, every Enter outside composition then calls `onEnter`, whatever it committed.                                                | Current tests                                                          |
| FR4  | ArrowUp and ArrowDown without modifiers, the wheel over the focused input (when `isWheelEnabled`), and the steppers step by one grid position and commit at once. The grid starts at `min` (when it suits integer-only) or 0. From an empty field or an emptied draft, up goes to `min` or 0 and down to `max` or 0. Results round to the finer of the step's and the grid start's precision (at most 12 decimal places), clamp to the range, and never leave integer-only; a stepper that cannot move does nothing, while an arrow or wheel step that cannot move still ends the draft, committing a valid draft's number and dropping an unparsable one. A caller `onKeyDown` that prevents an arrow cancels that step. A wheel step stops the page from scrolling; otherwise the page scrolls. | Current tests                                                          |
| FR5  | With `hasNumberSteppers`, increment and decrement buttons render at the end of the control. They are outside the tab order, are named with the localized increment and decrement phrases and the label, keep focus on the input when pressed, and expose `aria-disabled` when stepping that way cannot move or the field is disabled or read-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                | `spec:AST-085` FR1, FR2; current tests                                 |
| FR6  | With `formatValue`, the input shows the formatted committed value at rest and the plain locale-formatted number while focused. The form value is then submitted from a hidden input carrying the raw number, and the visible input has no `name`; without `formatValue` the visible input carries `name`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current tests                                                          |
| FR7  | `units` renders as secondary text after the input and is part of the input's description.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current tests                                                          |
| FR8  | With `hasClear`, a clear button shows while `value` is not `null` and the field is editable. Activating it calls `onChange(null)`, drops the draft, and focuses the input as TextInput's clear does. The clear button is a ghost small `component:Button`, so its press scale MUST NOT apply under reduced motion (`design:reduced-motion` DR1). Implementation gap: it still scales under reduced motion.                                                                                                                                                                                                                                                                                                                                                                                        | `family:input-fields` FR11; current tests                              |
| FR9  | NumberInput is disabled when its own `isDisabled` or an enclosing InputGroup's `isDisabled` is true; an enabled group never re-enables a field that disables itself (`spec:AST-085` FR7). Disabled: `aria-disabled="true"` and `readOnly` on the input, a kept tab stop, no submitted value, no draft commit (a draft in progress is dropped), no stepping by any route, no caller handlers other than focus and blur, Enter cancelled, the clear button hidden, the control dimmed, and a keyboard focus ring. With `disabledMessage`, a reason tooltip opens on hover and keyboard focus and describes the input.                                                                                                                                                                               | `spec:AST-085` FR1–FR3, FR6; `family:input-fields` FR4; current tests  |
| FR10 | Read-only: `readOnly`, full opacity, still submitted, no edits, and no stepping by keyboard, wheel, or steppers; the wheel then scrolls the page. Disabled wins when both are set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current tests                                                          |
| FR11 | Arrow and Enter keys that belong to an IME composition neither step nor commit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current tests                                                          |
| FR12 | Field composition, InputGroup adaptation, status presentation, start icon, click-to-focus, size and iOS text floor, and the prop targets match `component:TextInput` FR1, FR9, FR11–FR13, including its implementation gaps (the fixed height against `spec:AST-102` FR4, an error status without text, the color-only `detached` status, and the grouped description), plus a `labelIcon` passed to Field.                                                                                                                                                                                                                                                                                                                                                                                       | `family:input-fields` FR3, FR8–FR10; current tests                     |
| FR13 | The control box carries `astryx-number-input` with `data-size`, `data-status`, `data-disabled`, and `data-readonly`. A theme `padding` in any spelling on `number-input` pads the control box and the stepper column together.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `architecture:component-theming-surface`; current tests                |

### Allowed variation

- **AV1 — Number formatting.** `formatValue` may return any text; the
  committed value stays numeric.
- **AV2 — Theme padding.** Themes may change `number-input` padding; the
  steppers follow it.

### Representative states

| State                | Required invariant                                                               | Allowed variation |
| -------------------- | -------------------------------------------------------------------------------- | ----------------- |
| At rest, formatted   | Formatted text; `aria-valuetext`; hidden raw form value.                         | Format.           |
| Focused              | Plain locale number, ready to edit.                                              | Locale.           |
| Invalid draft        | Secondary text; `aria-invalid`; assertive invalid-number message; no `onChange`. | —                 |
| Out-of-range commit  | Clamped value committed on blur or Enter.                                        | —                 |
| Stepper at the bound | That stepper `aria-disabled`; stepping does nothing.                             | —                 |
| Disabled with reason | Focusable; read-only; not submitted; no stepping; reason tooltip.                | —                 |

### Transformation and precedence order

- **ORD1 — Typed commit.** Trim → empty check → locale parse → integer check →
  range check (`min` rounded up and `max` rounded down when integer-only) →
  clamp → commit if changed.
- **ORD2 — Step.** Current number (the draft if valid; an emptied draft steps
  from empty, FR4; otherwise `value`) → next grid position → round to the finer
  of the step's and the grid start's precision → clamp → integer check.
- **ORD3 — Availability.** Disabled, then read-only, then editable.

### Performance and resources

- **PR1 — One wheel listener.** Each mounted input with wheel stepping on
  holds one non-passive wheel listener on itself; it acts only while that
  input has focus.

## Accessibility contract

- **AR1 — Spinbutton.** FR1; the committed value, not the draft, is exposed.
- **AR2 — Invalid entry.** FR2's assertive region announces an invalid draft,
  since an invalid draft reverts silently on blur (WCAG 3.3.1).
- **AR3 — Disabled.** FR9 satisfies `spec:AST-085` FR1, FR5, and FR6.
- **AR4 — Steppers.** Pointer-only aids; the arrow keys give keyboard users the
  same stepping (FR4, FR5).
- **AR5 — Read-only exposure.** A read-only NumberInput MUST expose its
  read-only state to assistive technology (WCAG 2.2 4.1.2). Implementation gap:
  the spinbutton exposes no read-only state.

## Design relationships

| Anatomy or state | Design requirement                                        | Representation authority | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Input            | Numeric text; secondary color while the draft is invalid. | Current source and tests | Prominent      | FR2                |
| Units            | Secondary text after the number.                          | Current source and tests | Supporting     | FR7                |
| Steppers         | Stacked increment and decrement at the end.               | Current source and tests | Supporting     | FR5, FR13          |

`design:reduced-motion` governs the clear button's press scale (FR8); no other
design record governs NumberInput. The control box carries `number-input`;
the consumer anatomy names no control-box part, so this record carries no
anatomy-theming map.

## Family and system relationships

- `family:input-fields` owns grouped admission, disabled reasons, status
  placement, the focus-zoom floor, prop targets, and the clear tooltip;
  NumberInput adopts them and exposes no `isLoading` or `changeAction`.
- `spec:AST-085` owns disabled focusability; NumberInput meets it, including
  the steppers.
- `spec:AST-086` FR3 and FR4 own the persistent invalid-entry region.
- `architecture:internationalization` owns locale resolution the parser uses.
- `component:TextInput` is the reference for the shared text-field behavior
  FR12 names.

## Verification map

| Contract                 | Verification                                                                                                                              | Representative states                           | Mutation or failure expectation                                                                                             | Audit section                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| FR1, AR1                 | `NumberInput.test.tsx` spinbutton-attribute suite; `NumberInput.a11y.chromium.spec.ts`                                                    | Bounded, unbounded, formatted                   | A missing role or ARIA value fails.                                                                                         | `audit:NumberInput/accessibility` |
| FR2, AR2                 | `numberParser.test.ts`; `numberParser.docblock.test.ts`; `NumberInput.test.tsx` invalid-feedback suite                                    | Locales, grouping, invalid text                 | A misparse, a commit of a guess, or a missing announcement fails.                                                           | `audit:NumberInput/behavior`      |
| FR3, ORD1                | `numberInputCommit.test.ts`; `NumberInput.test.tsx` validation, commit-policy, clamping, keyboard-clearing suites                         | Blur, Enter, empty, clamp, inverted range       | A per-keystroke `onChange`, an unclamped commit, or a wrong clear fails.                                                    | `audit:NumberInput/behavior`      |
| FR4, FR5, ORD2, AR4, PR1 | `NumberInput.test.tsx` stepping and steppers suites; wheel-listener cases                                                                 | Keys, wheel, steppers; bounds; empty; precision | A step off the grid, past a bound, or with modifiers fails. Evidence gap: no test steps from an emptied draft over a value. | `audit:NumberInput/behavior`      |
| FR6, FR7                 | `NumberInput.test.tsx` formatted-display, form, and units suites                                                                          | Rest and focus; form submission                 | A formatted value submitted, or units not described, fails.                                                                 | `audit:NumberInput/behavior`      |
| FR8                      | `NumberInput.test.tsx` hasClear suite                                                                                                     | Clear; disabled; read-only                      | A clear on a disabled field, or no `null`, fails. Evidence gap: no test presses the clear button under reduced motion.      | `audit:NumberInput/behavior`      |
| FR9, FR10, ORD3, AR3     | `NumberInput.test.tsx` disabled, disabledMessage, read-only, and form suites; `InputGroup.test.tsx` disabled-propagation cases            | Disabled, reason, read-only                     | A lost tab stop, a submitted disabled value, or stepping while read-only fails.                                             | `audit:NumberInput/accessibility` |
| FR12                     | `NumberInput.fr10.test.tsx`; `NumberInput.test.tsx` status and click-to-focus suites                                                      | Standalone and grouped                          | A base prop off the input, or styling on the wrong part, fails.                                                             | `audit:NumberInput/api`           |
| FR13                     | `NumberInput.test.tsx` theme-state and stepper-padding suites                                                                             | Each padding spelling                           | Steppers that ignore the theme padding fail.                                                                                | `audit:NumberInput/theming`       |
| AR5                      | `NumberInput.a11y.chromium.spec.ts` with its recorded known failure                                                                       | Read-only                                       | The known failure stops matching when the gap closes.                                                                       | `audit:NumberInput/accessibility` |
| FR11                     | `NumberInput.test.tsx` "does not step or commit on a composing keydown (IME)" and "waits for IME composition to finish before committing" | Composing arrows and Enter                      | A step or commit during composition fails.                                                                                  | `audit:NumberInput/behavior`      |

## Current-state impact

- **Read-only not exposed (AR5).** A read-only NumberInput's spinbutton does
  not expose a read-only state, so assistive-technology users may expect to
  edit it. The accessibility suite records this as a known failure.
- **Clear press under reduced motion (FR8).** The clear button scales to 0.98
  on a press when the person prefers reduced motion, as `component:Button` FR15
  records, against `design:reduced-motion` DR1.
- **Inherited TextInput gaps (FR12).** The fixed height (`spec:AST-102` FR4),
  an error status without a message shown only by color and an icon (WCAG 2.2
  3.3.1), the color-only `detached` status without a message (WCAG 2.2 1.4.1),
  and the grouped description reference that `component:TextInput` records
  apply here.
- **Stepper icon key.** The steppers resolve their icon through the
  `numberInput:stepperDown` extension key rather than the component-slot model,
  the known deviation `architecture:icon-resolution-and-component-slots` names;
  it exits under that record's exit condition.

## Decision log

No component-local decision. NumberInput applies `family:input-fields` and
`spec:AST-085`.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
