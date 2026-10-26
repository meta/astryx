---
schema_version: 3
template_version: 7
kind: component
id: component:TextInput
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/TextInput/TextInput.test.tsx,
    packages/core/src/TextInput/TextInput.fr10.test.tsx,
    packages/core/src/TextInput/__tests__/TextInput.a11y.test.tsx,
    packages/core/src/TextInput/__tests__/TextInput.a11y.chromium.spec.ts,
    packages/core/src/InputGroup/InputGroup.test.tsx,
  ]
modules: []
families: [family:input-fields]
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:component-size-cascade,
    architecture:component-theming-surface,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-085, spec:AST-086, spec:AST-102]
---

# TextInput component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. TextInput is a controlled single-line text field with Field props, `type`, size, status, clear, start icon, `onChange`, `changeAction`, `isLoading`, disabled and read-only states, and the input-family part props.                                                                                                                                     |
| Behavior                | Typing calls `onChange`, then an optional `changeAction` in a transition with an optimistic value, and a busy Spinner while the shown value differs from `value`. A disabled field stays focusable, read-only, unsubmitted, and inert.                                                                                                                                 |
| End-user impact         | People type into a labelled field that shows progress and validation in place. Keyboard and screen-reader users can reach a disabled field and its reason. An error without a message is signalled only by color and an icon.                                                                                                                                          |
| Builder impact          | None.                                                                                                                                                                                                                                                                                                                                                                  |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. The clear action skips `changeAction`, the clear button scales under reduced motion, an error may lack text, the height does not grow with text, a `detached` status without a message is color-only, and a grouped `description` is referenced but not rendered; all are listed under Current-state impact. |
| Review checks           | Reject a disabled field that leaves the tab order, submits, or runs caller handlers; an Enter that fires `onEnter` while committing an IME conversion; a busy state without `aria-busy`; or root styling props.                                                                                                                                                        |
| Governing rules         | `family:input-fields` FR1, FR2, FR3, FR4, FR6, FR8–FR11; `spec:AST-085` FR1–FR3, FR5–FR7; `spec:AST-086` FR8; `architecture:component-size-cascade` INV3–INV5; `design:reduced-motion` DR1; `spec:AST-102` FR4.                                                                                                                                                        |

This table is a review projection; the body below is authoritative.

## Intent

TextInput collects short, single-line text. It owns the native input, its
change and Action pipeline, busy, clear, status, disabled, and read-only
behavior, and its adaptation to Field and InputGroup under
`family:input-fields`. Consumer usage lives in `TextInput.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; `type="text"`, `size="md"`,
  `statusVariant="attached"`, no clear button
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: controlled only; `value` is required, and
  the field shows an optimistic value only while a `changeAction` is pending
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The native input, its attributes, and its accessible relationships.
- The `onChange` → optimistic value → `changeAction` pipeline and the busy
  state.
- The clear button's presence and effect, the start icon slot, and the
  status icon in the control.
- Disabled, disabled-reason, and read-only behavior.
- The control box and its `text-input` target.
- Its grouped adaptation inside InputGroup.

**Does not own / non-goals**

- Label, description, status message placement, label tooltip, and `width`
  layout — owned by Field under `family:input-fields` (shared owner section).
- The status message box — owned by `component:FieldStatus`.
- The clear button's own rendering and tooltip — owned by the shared clear
  control (`family:input-fields` FR11).
- InputGroup row height, connected surface, edge alignment, and group focus —
  owned by InputGroup under `family:input-fields` (shared owner section).
- Multiline text — owned by TextArea.
- Native search semantics, length limits, and keyboard hints — uncontracted.

## Public concepts

| Concept          | Closed values or states                         | Meaning                                   | Availability by variant/orientation/state                                                                                   | Default                   | Owner                 | Stability | Invalid-value behavior           |
| ---------------- | ----------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------- | --------- | -------------------------------- |
| Type             | `text`, `password`, `email`                     | Native input type.                        | Always.                                                                                                                     | `text`                    | `component:TextInput` | Stable    | TypeScript rejects other values. |
| Size             | `sm`, `md`, `lg`                                | Control height.                           | Always.                                                                                                                     | Inherited size, else `md` | `family:input-fields` | Stable    | TypeScript rejects other values. |
| Status           | `error`, `warning`, `success`, optional message | Validation state.                         | Always; the message box only outside InputGroup.                                                                            | none                      | `family:input-fields` | Stable    | TypeScript rejects other types.  |
| Status placement | `attached`, `detached`, `tooltip`               | Where the status message shows.           | Outside InputGroup.                                                                                                         | `attached`                | `family:input-fields` | Stable    | TypeScript rejects other values. |
| Busy             | idle, busy                                      | The value is loading or being saved.      | `isLoading`, or while the shown value differs from `value` (a pending `changeAction` whose value `value` has not accepted). | idle                      | `family:input-fields` | Stable    | Not applicable.                  |
| Availability     | editable, read-only, disabled                   | Whether the value can change and submits. | Always; disabled wins over read-only.                                                                                       | editable                  | `component:TextInput` | Stable    | Not applicable.                  |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Basis                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| FR1  | Standalone, TextInput renders inside Field with its label (always rendered; `isLabelHidden` hides it visually), description, optional or required marker, label tooltip, status, and `width`. Inside InputGroup it renders no Field: `aria-labelledby` names the input by the group label, then a visually hidden label inside the control, and no status message box renders.                                                                                                                                                                                                                                                                                                                                                                                                      | `family:input-fields` FR3; current source and tests                                                            |
| FR2  | The input is a native `<input>` of the chosen `type` showing the controlled value. `htmlName` becomes `name`, `autoComplete` reaches the input unchanged, and `hasAutoFocus` focuses it on mount.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current tests                                                                                                  |
| FR3  | Editing calls `onChange(value, event)`. Unless that call prevents default, `changeAction(value, event)` then runs in a transition; the field shows the proposed value while the Action is pending, and the controlled `value` once it settles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `family:input-fields` FR6; current source                                                                      |
| FR4  | While `isLoading` or while the shown value differs from `value`, the input sets `aria-busy`, a decorative small Spinner shows in the end area, and the busy start is announced once (`spec:AST-086` FR8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `family:input-fields` FR5; `spec:AST-086` FR8; current source                                                  |
| FR5  | With `hasClear`, a clear button shows only while `value` is non-empty and the field is editable. Its accessible name is the localized "Clear" phrase with the label. Activating it MUST commit `''` through FR3's pipeline (`onChange`, then the optimistic value and `changeAction`) and moves focus to the input: at once for keyboard activation, and inside the tap without scrolling for pointer activation. The clear button is a ghost small `component:Button`, so its press feedback follows Button FR15, whose press scale MUST NOT apply under reduced motion (`design:reduced-motion` DR1). Implementation gap: it calls only `onChange('')`, with no event, and skips the optimistic value and `changeAction`; and its press scale still applies under reduced motion. | `family:input-fields` FR6, FR11; current tests                                                                 |
| FR6  | TextInput is disabled when its own `isDisabled` or an enclosing InputGroup's `isDisabled` is true; an enabled group never re-enables a field that disables itself (`spec:AST-085` FR7). Disabled: the input exposes `aria-disabled="true"` and `readOnly`, keeps its tab stop, has no `name` (so it does not submit), and never changes value. Caller event handlers other than focus and blur do not run, Enter is cancelled, the clear button hides, the control dims, and keyboard focus paints a ring.                                                                                                                                                                                                                                                                          | `spec:AST-085` FR1–FR3, FR6; current tests                                                                     |
| FR7  | Disabled with `disabledMessage`: a tooltip with the reason opens above the control on hover and keyboard focus, and describes the input.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `family:input-fields` FR4; current tests                                                                       |
| FR8  | Read-only: the input is `readOnly`, keeps full opacity, stays focusable, still submits under `name`, never calls `onChange`, and hides the clear button. Disabled wins when both are set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Current tests                                                                                                  |
| FR9  | A status paints the status border; `error` sets `aria-invalid="true"`. Outside InputGroup, `attached` and `tooltip` placement show a trailing status icon on the control; `detached` placement shows its glyph only in the message box, which renders only with a message; inside InputGroup no status icon renders. Outside InputGroup, a message renders through Field in the chosen placement; `tooltip` renders no message box, and with a message its status icon becomes a focusable button whose tooltip describes the input (without one it stays a plain icon).                                                                                                                                                                                                            | `family:input-fields` FR8; current tests                                                                       |
| FR10 | Enter calls `onEnter` unless the key event commits an IME composition; `onKeyDown` receives every key, including composing ones.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Current tests                                                                                                  |
| FR11 | Standalone, height comes from the shared element size for the resolved size, as a minimum that grows with a set text size under `spec:AST-102` FR4: explicit `size`, then the nearest size provider, then `md`. Implementation gap: the height is fixed at that size. Inside InputGroup the control fills the group row's height, so its own `size` does not set its height. Text uses the body type size at every size, floored at 16 CSS px only on the iOS touch path.                                                                                                                                                                                                                                                                                                           | `family:input-fields` FR9; `architecture:component-size-cascade`; current source and tests; `spec:AST-102` FR4 |
| FR12 | `startIcon` renders a small secondary icon before the input. While the field is enabled, a click on the control box outside the input focuses the input.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Current tests                                                                                                  |
| FR13 | Base props (`ref`, `id`, `aria-*`, `data-*`, DOM handlers, and the like) reach the native input; `aria-describedby` is joined with TextInput's own descriptions. `container*` reaches the Field box and `control*` the control box. Root `xstyle`, `className`, and `style` are not accepted; an untyped one is dropped with a development warning.                                                                                                                                                                                                                                                                                                                                                                                                                                 | `family:input-fields` FR10; current tests                                                                      |
| FR14 | The control box carries `astryx-text-input` and reflects `data-size`, `data-status` when set, `data-disabled` when disabled, and `data-readonly` when read-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `architecture:component-theming-surface`; current tests                                                        |
| FR15 | The input has no minimum inline size, so a row can shrink the whole field. End controls (clear, Spinner, status icon) are in-flow items after the input and never overlap its text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `family:input-fields` FR1, FR2; current tests                                                                  |

### Allowed variation

- **AV1 — Theme paint.** Themes may restyle the control box through
  `text-input` and its states without changing behavior.
- **AV2 — Start icon.** Any icon may fill the slot.

### Representative states

| State                  | Required invariant                                                                                                                                       | Allowed variation |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Empty with placeholder | Labelled input; placeholder visible.                                                                                                                     | Size.             |
| Typing with Action     | Proposed value shows while the Action is pending, with the Spinner and `aria-busy` while it differs from `value`; `value` shows once the Action settles. | —                 |
| Error with message     | Error border and icon; `aria-invalid`; message described.                                                                                                | Placement.        |
| Disabled with reason   | `aria-disabled`; focusable; read-only; not submitted; reason tooltip on focus.                                                                           | —                 |
| Read-only              | Full opacity; submits; cannot change.                                                                                                                    | —                 |
| In InputGroup          | No Field; hidden label names the input; no message box.                                                                                                  | Group geometry.   |

### Transformation and precedence order

- **ORD1 — Availability.** Disabled (own or enclosing InputGroup), then
  read-only, then editable.
- **ORD2 — Change.** `onChange`, then the optimistic value and `changeAction`
  unless prevented.
- **ORD3 — Description.** Standalone: caller `aria-describedby`, then
  description, status message (when a message box renders), status tooltip, and
  disabled reason. Inside InputGroup: caller `aria-describedby`, then the
  group's description and status message, then TextInput's own ids; TextInput's
  own `description` does not render there, yet its id is still referenced.
- **ORD4 — Size.** Explicit `size`, then the nearest size provider, then `md`.

### Performance and resources

- **PR1 — No measurement.** TextInput adds no observer or measurement; the end
  controls are in-flow flex items.

## Accessibility contract

- **AR1 — Name and description.** Standalone, Field's native label names the
  input; inside InputGroup, `aria-labelledby` names it by the group label, then
  its own visually hidden label. It is described per ORD3, including the
  group's description and status message inside InputGroup.
- **AR2 — State.** `aria-required` when effectively required, `aria-invalid`
  for an error, `aria-busy` while busy, `aria-disabled` while disabled.
- **AR3 — Disabled reachability.** FR6 and FR7 satisfy `spec:AST-085` FR1,
  FR5, and FR6.
- **AR4 — Status without color.** Outside InputGroup, every status MUST show a
  cue other than color (WCAG 2.2 1.4.1): a glyph on the control for `attached`
  and `tooltip`, or in the message box for `detached` with a message. Outside
  InputGroup, an error MUST be identified in text (WCAG 2.2 3.3.1); inside
  InputGroup, the group's own status carries the text. Implementation gap: TextInput
  accepts an error status without a message, and a `detached` status without a
  message shows only the colored border.
- **AR5 — Focus-zoom floor.** FR11.

## Design relationships

| Anatomy or state | Design requirement                                                  | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Label            | Field label above the control, or hidden.                           | Current source           | Prominent      | FR1                |
| Description      | Field helper text.                                                  | Current source           | Supporting     | FR1                |
| Start icon       | Small secondary icon before the input.                              | Current source and tests | Supporting     | FR12               |
| Placeholder      | Secondary-color hint while empty.                                   | Current source           | Supporting     | FR2                |
| Clear button     | Trailing clear control while a value is editable.                   | Current source and tests | Supporting     | FR5                |
| Spinner          | Trailing decorative Spinner while busy.                             | Current source           | Supporting     | FR4                |
| Status icon      | Trailing status icon (attached, tooltip); a button under `tooltip`. | Current source and tests | Supporting     | FR9                |

`design:reduced-motion` governs the clear button's press scale (FR5); no other
design record governs TextInput. The control box carries `text-input`; the
consumer anatomy names no control-box part, so this record carries no
anatomy-theming map.

## Family and system relationships

- `family:input-fields` owns inline-size stability, end controls, grouped
  admission, disabled reasons, input busy, Transition Actions, status
  placement, the focus-zoom floor, prop targets, and the clear tooltip;
  TextInput adopts them, with the FR5 gap.
- `spec:AST-085` owns disabled focusability; TextInput meets it.
- `spec:AST-086` FR8 owns the busy announcement.
- `architecture:component-size-cascade` owns size inheritance.

## Verification map

| Contract       | Verification                                                                                                                                      | Representative states                       | Mutation or failure expectation                                                                                                                                                                                     | Audit section                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1, AR1       | `TextInput.test.tsx` label, tooltip, and group cases; `InputGroup.test.tsx` grouped name and description cases; `TextInput.a11y.chromium.spec.ts` | Standalone, hidden label, in group          | A lost name, a wrong grouped name or description, or a dangling description id fails. Evidence gap: no test asserts the optional marker or the standalone description.                                              | `audit:TextInput/accessibility` |
| FR2, FR3       | `TextInput.test.tsx` change, form, autoComplete, autofocus cases                                                                                  | Typing; form submission                     | A wrong `onChange` payload or a missing `name` fails. Evidence gap: no test asserts the `type` or that `changeAction` runs after `onChange` with the optimistic value.                                              | `audit:TextInput/behavior`      |
| FR4            | Evidence gap: no TextInput test of the pending Action's optimistic value and busy announcement                                                    | —                                           | —                                                                                                                                                                                                                   | `audit:TextInput/behavior`      |
| FR5            | `TextInput.test.tsx` clear and clear-focus suites                                                                                                 | Keyboard and pointer clear; empty; disabled | A clear button on an empty or disabled field, or lost focus, fails. Evidence gap: no test presses the clear button under reduced motion.                                                                            | `audit:TextInput/behavior`      |
| FR6–FR8, AR3   | `TextInput.test.tsx` disabled, disabledMessage, read-only, and form suites; `InputGroup.test.tsx` disabled-propagation cases                      | Disabled, with reason, read-only, both      | A lost tab stop, a submitted disabled value, a caller handler, or an edit fails. Evidence gap: no test asserts the dimmed paint.                                                                                    | `audit:TextInput/accessibility` |
| FR9            | `TextInput.test.tsx` status and statusVariant suites                                                                                              | Each type; each placement; in group         | A missing icon, `aria-invalid`, or description fails. Evidence gap: no test asserts the status border paint.                                                                                                        | `audit:TextInput/accessibility` |
| FR10           | `TextInput.test.tsx` onEnter and onKeyDown suites                                                                                                 | Enter; IME commit; other keys               | `onEnter` during IME commit fails.                                                                                                                                                                                  | `audit:TextInput/behavior`      |
| FR11, FR15     | `TextInput.test.tsx` text-size and narrow-row cases                                                                                               | Outside the iOS gate; narrow filter bar     | A floor off iOS, or a field that overflows its row, fails. Evidence gap: no test asserts the height per size, the size precedence, or that end controls never overlap the text. No test asserts the grouped height. | `audit:TextInput/layout`        |
| FR12           | `TextInput.test.tsx` start-icon and click-to-focus cases                                                                                          | Icon; wrapper padding                       | Clicks that do not focus the input fail. Evidence gap: no test asserts the start icon's size or color.                                                                                                              | `audit:TextInput/behavior`      |
| FR13           | `TextInput.fr10.test.tsx`                                                                                                                         | Standalone and in group                     | A base prop off the input, or styling on the wrong part, fails.                                                                                                                                                     | `audit:TextInput/api`           |
| FR14           | `TextInput.test.tsx` theme-state suites                                                                                                           | Disabled and read-only                      | A missing state attribute fails. Evidence gap: no test asserts `data-size` or `data-status`.                                                                                                                        | `audit:TextInput/theming`       |
| AR4            | `TextInput.a11y.chromium.spec.ts` with its recorded known failure                                                                                 | Error without message                       | The known failure stops matching when the gap closes. Evidence gap: no test renders a `detached` status without a message.                                                                                          | `audit:TextInput/accessibility` |
| ORD1–ORD3, PR1 | ORD1 and ORD2 are covered by the FR3 and FR6–FR8 rows. Evidence gap: no test asserts the description order or the absence of measurement          | —                                           | —                                                                                                                                                                                                                   | `audit:TextInput/behavior`      |

## Current-state impact

- **Clear skips the Action (FR5).** The clear button calls `onChange('')`
  without running `changeAction` or showing the optimistic value, against
  `family:input-fields` FR6, and passes no event although the callback type
  declares one.
- **Error without text (AR4).** TextInput accepts an error status without a
  message, so the error is shown only by color and an icon, against WCAG 2.2
  3.3.1. The accessibility suite records this as a known failure.
- **Color-only detached status (AR4).** A `detached` status without a message
  shows only the colored border, against WCAG 2.2 1.4.1.
- **Grouped description (ORD3).** Inside InputGroup, TextInput's own
  `description` does not render, yet `aria-describedby` still references its
  id.
- **Clear press under reduced motion (FR5).** The clear button scales to 0.98 on
  a press when the person prefers reduced motion, as `component:Button` FR15
  records, against `design:reduced-motion` DR1.
- **Fixed height (FR11).** The control holds the fixed shared element height
  instead of growing with a set text size, against `spec:AST-102` FR4.
- **Source comment.** The `size` JSDoc in `TextInput.tsx` gives 18 px and 26 px
  heights; the shipped heights come from the shared element sizes (FR11).

## Decision log

No component-local decision. TextInput applies `family:input-fields` and
`spec:AST-085`.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
