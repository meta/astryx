---
schema_version: 3
template_version: 7
kind: component
id: component:RadioList
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
owners: [cixzhang]
review_triggers:
  [
    public-api,
    behavior,
    layout,
    interaction,
    motion,
    theming,
    styling,
    accessibility,
    visual,
    react-runtime,
    compatibility,
  ]
verified_by:
  [
    packages/core/src/RadioList/RadioList.test.tsx,
    packages/core/src/RadioList/RadioList.fr10.test.tsx,
    packages/core/src/RadioList/__tests__/RadioGroup.a11y.test.tsx,
    packages/core/src/RadioList/__tests__/RadioGroup.a11y.chromium.spec.ts,
  ]
modules: []
families: [family:input-fields]
design_specs: [design:user-states]
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-085]
---

# RadioList component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. RadioList takes `label`, `value`, `onChange`, `orientation`, `size`, `isDisabled`, `disabledMessage`, `isRequired`, `isOptional`, `status`, `htmlName`, Field props, part props, and RadioListItem children. |
| Behavior                | A Field-labelled `role="radiogroup"` of native radios sharing one name. Selecting an option calls `onChange(value)`. The group sets the item size, the disabled state, and required semantics.                             |
| End-user impact         | People choose one option by pointer, touch, or the browser's arrow keys, with a predictable first Tab stop. A group disabled without a reason leaves the tab order, so keyboard users cannot find it.                      |
| Builder impact          | None.                                                                                                                                                                                                                      |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Native `disabled` on disabled radios conflicts with `spec:AST-085` FR1 and FR7; listed under Current-state impact.                                               |
| Review checks           | Reject a group without a name, radios that lose their shared name, a selection while disabled, a first Tab stop that lands mid-group with an empty value, or root styling props.                                           |
| Governing rules         | `family:input-fields` FR10, DEC-7; `spec:AST-085` FR1–FR7; `design:user-states` DR1, DR2 (through RadioListItem); WAI-ARIA radio group pattern.                                                                            |

This table is a review projection; the body below is authoritative.

## Intent

RadioList presents a small set of mutually exclusive options as one labelled
radio group. It owns the group's name, selection value, shared radio name,
group-level disabled, required, and status semantics, and the entry Tab stop.
Each option is `component:RadioListItem`. Consumer usage lives in
`RadioList.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; `orientation="vertical"`, `size="md"`,
  not disabled
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: controlled only; `value` is required and
  `''` means nothing is selected
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The group Field and the `role="radiogroup"` element, its name, description,
  status, invalid and required state, and the `radio-list` target.
- The shared radio name, the selected value, and `onChange`.
- Group disabled and the group disabled-reason tooltip.
- The entry Tab stop when nothing is selected.
- Where base, `container*`, and `control*` props land.

**Does not own / non-goals**

- Each option's radio, naming, description, row, disabled item state, and the
  `radio-list-item` target — owned by `component:RadioListItem`.
- Arrow-key movement and selection between radios — the browser's native radio
  group behavior.
- The radio indicator — owned by the Indicator registry's radio indicator.
- Group-label and status-message presentation — owned by Field under `family:input-fields` (shared owner section) and
  `component:FieldStatus`.

## Public concepts

| Concept     | Closed values or states                         | Meaning                                      | Availability by variant/orientation/state | Default      | Owner                 | Stability | Invalid-value behavior                         |
| ----------- | ----------------------------------------------- | -------------------------------------------- | ----------------------------------------- | ------------ | --------------------- | --------- | ---------------------------------------------- |
| Value       | string; `''` for none                           | The selected option's value.                 | Always.                                   | required     | `component:RadioList` | Stable    | A value no item carries selects nothing.       |
| Orientation | `vertical`, `horizontal`                        | Layout of the options.                       | Always.                                   | `vertical`   | `component:RadioList` | Stable    | TypeScript rejects other values.               |
| Size        | `sm`, `md`                                      | Radio circle size for every item.            | Always.                                   | `md`         | `component:RadioList` | Stable    | TypeScript rejects other values.               |
| Disabled    | off, on, on with reason                         | Blocks selection on every item.              | A reason applies only with `isDisabled`.  | off          | `component:RadioList` | Stable    | A reason without `isDisabled` renders nothing. |
| Status      | `error`, `warning`, `success`, optional message | Group validation state.                      | Always; the message is detached.          | none         | `family:input-fields` | Stable    | TypeScript rejects other types.                |
| Name        | string                                          | The shared radio `name` and form field name. | Always.                                   | generated id | `component:RadioList` | Stable    | Not applicable.                                |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| FR1 | RadioList renders a Field in group-label mode (label rendered as a span, visible unless `isLabelHidden`, description, optional or required marker, label tooltip, detached status) around one `role="radiogroup"` element. The radiogroup is labelled by the group label plus any caller `aria-labelledby`, and described by any caller description, then the description, status message, and disabled reason that exist.                                                                                                                                                                                                                                                              | WAI-ARIA radio group pattern; current tests             |
| FR2 | Every item's radio shares one `name`: `htmlName` when supplied, otherwise a generated id, so the radios form one native group. The checked radio is the one whose `value` equals the group `value`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current tests                                           |
| FR3 | Selecting an enabled option calls `onChange(value)` once; RadioList holds no selection of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current tests                                           |
| FR4 | With an empty `value`, keyboard focus entering the group lands on the first radio that is not natively disabled (in a group disabled with a reason, that is its first `aria-disabled` radio, keeping the enabled focus order under `spec:AST-085` FR1), or stays on the last one when entering backward. Focus moving between radios inside the group is not redirected. With a selection, the selected radio is the Tab stop. Arrow keys follow the browser's native radio behavior, which stops on `aria-disabled` radios.                                                                                                                                                            | WAI-ARIA radio group pattern; current tests             |
| FR5 | `isDisabled` MUST disable every item: each radio stays focusable with `aria-disabled="true"`, is detached from the form so it does not submit, and refuses selection (`spec:AST-085` FR1–FR3, FR7). With `disabledMessage`, a reason tooltip also opens on group hover and keyboard focus, and the reason MUST describe each focusable radio (`spec:AST-085` FR5, FR7). Implementation gap: the reason describes only the radiogroup, so a focused radio is not described by it; and without a `disabledMessage`, each radio gets native `disabled` instead, which removes it from the tab order, and a radio focused when the group becomes disabled loses focus (`spec:AST-085` FR4). | `spec:AST-085` FR1–FR5, FR7; current tests              |
| FR6 | `status.type === 'error'` sets `aria-invalid` on the radiogroup. The radiogroup exposes the effective required state (including a form-level default) with `aria-required`, while each radio's native `required` follows only the explicit `isRequired`.                                                                                                                                                                                                                                                                                                                                                                                                                                | Current source and tests                                |
| FR7 | The radiogroup lays options in a column with a small gap, or a row with a wider gap when horizontal, and passes `size` to every item.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source and tests                                |
| FR8 | Base props (`ref`, `id`, `aria-*`, `data-*`, `hidden`, `inert`, `dir`, DOM handlers) reach the radiogroup; a caller `onFocus` runs after FR4's entry handling. `container*` reaches the Field box where one renders (in a `horizontal-labels` FormLayout none renders, and `container*` has no effect and warns), and `control*` the radiogroup; root `xstyle`, `className`, and `style` are not accepted.                                                                                                                                                                                                                                                                              | `family:input-fields` FR10; current tests               |
| FR9 | The radiogroup carries `astryx-radio-list` and reflects `data-orientation` and `data-size`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `architecture:component-theming-surface`; current tests |

### Allowed variation

- **AV1 — Options.** Item content varies under `component:RadioListItem`.
- **AV2 — Theme paint.** Themes may restyle the group through `radio-list`.

### Representative states

| State                | Required invariant                                                                                                                        | Allowed variation |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Empty value          | Forward Tab enters on the first radio that is not natively disabled.                                                                      | Orientation.      |
| One selected         | The selected radio is checked and is the Tab stop.                                                                                        | Size.             |
| Error status         | `aria-invalid`; detached message describes the group.                                                                                     | Message.          |
| Disabled with reason | Radios focusable, refuse selection, not submitted; reason tooltip. Implementation gap: a caller `onClick` still runs (RadioListItem FR6). | —                 |
| Disabled, no reason  | Same as with a reason, without the tooltip. Implementation gap: native `disabled` (FR5).                                                  | —                 |

### Transformation and precedence order

- **ORD1 — Item availability.** Group disabled or item disabled; the group
  reason keeps only group-disabled radios focusable.
- **ORD2 — Required.** Effective required on the radiogroup; explicit required
  on each radio.

### Performance and resources

- **PR1 — Entry handling.** FR4 runs only on focus events with an empty `value`
  and adds no global listener.

## Accessibility contract

- **AR1 — Group semantics.** `role="radiogroup"` with a name, description,
  invalid and required state (FR1, FR6).
- **AR2 — Keyboard.** Tab reaches the group once (FR4); arrow keys move and
  select through native radio behavior.
- **AR3 — Disabled reason.** A group reason stays reachable by keyboard focus
  and assistive technology (FR5).

## Design relationships

| Anatomy or state | Design requirement                   | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------ | ------------------------ | -------------- | ------------------ |
| Group label      | Field group label above the options. | Current source           | Prominent      | FR1                |
| Options          | Column or row of RadioListItem rows. | Current source           | Prominent      | FR7                |
| Status message   | Detached message after the group.    | Current source           | Supporting     | FR1, FR6           |

`design:user-states` governs the pressed overlay its options paint
(`component:RadioListItem` FR8); no other design record governs RadioList. The radiogroup carries `radio-list`.

## Family and system relationships

- `spec:AST-085` owns disabled reasons and `family:input-fields` FR10 and DEC-7
  own prop targets; RadioList
  meets FR10.
- `spec:AST-085` owns disabled focusability; FR5 records the gap.
- `component:RadioListItem` owns each option and reads the group through
  context.

## Verification map

| Contract       | Verification                                                                                                                                                                                                             | Representative states                                                 | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                            | Audit section                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1, AR1       | `RadioList.test.tsx` label, span-label, hidden-label, required and optional marker, status, and group-description cases; `RadioGroup.a11y.test.tsx` and `RadioGroup.a11y.chromium.spec.ts`                               | Visible and hidden label; each status; description                    | A missing group name or description fails. Evidence gap: no test asserts the caller description first or the disabled reason last, or the label tooltip.                                                                                                                                                                                                                   | `audit:RadioList/accessibility` |
| FR2, FR3       | `RadioList.test.tsx` selection and form cases                                                                                                                                                                            | Radio, label, and description clicks; `htmlName`; no name             | A wrong value, lost grouping, wrong form value, or a second `onChange` on a radio click fails. Evidence gap: no test counts `onChange` calls on delegated label and description clicks.                                                                                                                                                                                    | `audit:RadioList/behavior`      |
| FR4, AR2, PR1  | `RadioList.test.tsx` focus-management cases; `RadioGroup.a11y.chromium.spec.ts` `radio-group.focus.entry-and-exit` rule on every `radio-list-group-*` state                                                              | Backward entry; intra-group movement; disabled radios                 | A redirected intra-group move, entry on a natively disabled radio, or Tab entry off the selected or first option fails. Evidence gap: no test enters an empty group disabled with a reason, or asserts a caller `onFocus` after entry handling or the absence of global listeners.                                                                                         | `audit:RadioList/accessibility` |
| FR5, ORD1, AR3 | `RadioList.test.tsx` disabled, disabledMessage, and form cases; `RadioGroup.a11y.test.tsx` and `RadioGroup.a11y.chromium.spec.ts` `radio-list-group-disabled-with-message` and `radio-list-option-group-disabled` states | Group and item disabled; with reason                                  | A selection while disabled, or a submitted value from a group disabled with a reason, fails; the binding expects `tabReachable: false` for `radio-list-option-group-disabled`, which fails when that gap closes. Evidence gap: no form case submits an item-disabled option or a group disabled without a reason, and no test disables the group while a radio is focused. | `audit:RadioList/accessibility` |
| FR6, ORD2      | `RadioGroup.a11y.test.tsx` and `RadioGroup.a11y.chromium.spec.ts` `radio-list-group-required-invalid-described` state                                                                                                    | Required, invalid, described group                                    | A missing required or invalid state on the group fails. Evidence gap: no test asserts that a form-level required default reaches only `aria-required`.                                                                                                                                                                                                                     | `audit:RadioList/accessibility` |
| FR7, FR9       | `RadioList.test.tsx` theme-target case                                                                                                                                                                                   | `size="sm"`                                                           | A missing row size fails. Evidence gap: the orientation case asserts only rendering; no test asserts the gaps, horizontal layout, `data-orientation`, `data-size`, or `astryx-radio-list` on the radiogroup.                                                                                                                                                               | `audit:RadioList/layout`        |
| FR8            | `RadioList.fr10.test.tsx`; `RadioList.test.tsx` data-testid case                                                                                                                                                         | Caller labelledby; hidden, inert, dir; `horizontal-labels` FormLayout | A base prop off the radiogroup, or `container*` off the Field box, fails. Evidence gap: no test asserts a caller `onFocus` runs after entry handling.                                                                                                                                                                                                                      | `audit:RadioList/api`           |

## Current-state impact

- **Group reason (FR5).** A group `disabledMessage` describes only the
  radiogroup, so a focused disabled radio is not described by it, against
  `spec:AST-085` FR5 and FR7.
- **Caller onClick while disabled (FR5).** A radio kept focusable by a group
  reason still runs a caller's `onClick` on a click or an arrow key onto it,
  against `spec:AST-085` FR2.
- **Disabled focusability (FR5).** A group disabled without a reason gives its
  radios native `disabled`, so they leave the tab order, against `spec:AST-085`
  FR1 and FR7.
- **Consumer docs.** `RadioList.doc.mjs` anatomy lists Header, Children, and
  Label/Value parts; RadioList renders a group label, options, and a status
  message, and has no header.

## Decision log

- **Keyboard model (FR4).** RadioList keeps the browser's native radio arrow
  keys and its shipped Tab entry rule; `spec:AST-085` leaves which radios a
  composite's arrow keys visit to the composite.

RadioList otherwise applies `family:input-fields` FR10 and the WAI-ARIA radio
group pattern.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
