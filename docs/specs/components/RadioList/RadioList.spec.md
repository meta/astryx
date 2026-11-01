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
    packages/core/src/RadioList/RadioList.focusableDisabled.test.tsx,
    packages/core/src/RadioList/__tests__/RadioListDisabledForm.interaction.browser.spec.ts,
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

| Area                    | Contract                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. RadioList takes `label`, `value`, `onChange`, `orientation`, `size`, `isDisabled`, `disabledMessage`, `isRequired`, `isOptional`, `status`, `htmlName`, Field props, part props, and RadioListItem children.                                    |
| Behavior                | A Field-labelled `role="radiogroup"` of native radios sharing one name. Selecting an option calls `onChange(value)`. The group sets the item size, the disabled state, and required semantics.                                                                |
| End-user impact         | People choose one option by pointer, touch, or the browser's arrow keys, with a predictable first Tab stop. A disabled option stays reachable by keyboard and announces as disabled; arrow keys skip an individually disabled option.                         |
| Builder impact          | None.                                                                                                                                                                                                                                                         |
| Compatibility/readiness | No API or default change. Disabled radios render `aria-disabled` instead of native `disabled` (`spec:AST-085` FR1, FR7), and a disabled group's radios take the generated name (FR2).                                                                         |
| Review checks           | Reject a group without a name, radios that lose their shared name, a selection while disabled, a native `disabled` attribute, an arrow key that lands on a disabled option, a first Tab stop that lands mid-group with an empty value, or root styling props. |
| Governing rules         | `family:input-fields` FR10, DEC-7; `spec:AST-085` FR1–FR7; `design:user-states` DR1, DR2 (through RadioListItem); WAI-ARIA radio group pattern.                                                                                                               |

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
- Arrow keys skipping individually disabled options.
- Where base, `container*`, and `control*` props land.

**Does not own / non-goals**

- Each option's radio, naming, description, row, disabled item state, and the
  `radio-list-item` target — owned by `component:RadioListItem`.
- Other arrow-key movement and selection between radios — the browser's native
  radio group behavior.
- The radio indicator — owned by the Indicator registry's radio indicator.
- Group-label and status-message presentation — owned by Field under `family:input-fields` (shared owner section) and
  `component:FieldStatus`.

## Public concepts

| Concept     | Closed values or states                         | Meaning                                                                                                                       | Availability by variant/orientation/state | Default      | Owner                 | Stability | Invalid-value behavior                         |
| ----------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------ | --------------------- | --------- | ---------------------------------------------- |
| Value       | string; `''` for none                           | The selected option's value.                                                                                                  | Always.                                   | required     | `component:RadioList` | Stable    | A value no item carries selects nothing.       |
| Orientation | `vertical`, `horizontal`                        | Layout of the options.                                                                                                        | Always.                                   | `vertical`   | `component:RadioList` | Stable    | TypeScript rejects other values.               |
| Size        | `sm`, `md`                                      | Radio circle size for every item.                                                                                             | Always.                                   | `md`         | `component:RadioList` | Stable    | TypeScript rejects other values.               |
| Disabled    | off, on, on with reason                         | Blocks selection on every item.                                                                                               | A reason applies only with `isDisabled`.  | off          | `component:RadioList` | Stable    | A reason without `isDisabled` renders nothing. |
| Status      | `error`, `warning`, `success`, optional message | Group validation state.                                                                                                       | Always; the message is detached.          | none         | `family:input-fields` | Stable    | TypeScript rejects other types.                |
| Name        | string                                          | The shared radio `name` and form field name. A disabled group, which submits nothing, names its radios with the generated id. | Always.                                   | generated id | `component:RadioList` | Stable    | Not applicable.                                |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Basis                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| FR1 | RadioList renders a Field in group-label mode (label rendered as a span, visible unless `isLabelHidden`, description, optional or required marker, label tooltip, detached status) around one `role="radiogroup"` element. The radiogroup is labelled by the group label plus any caller `aria-labelledby`, and described by any caller description, then the description, status message, and disabled reason that exist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | WAI-ARIA radio group pattern; current tests               |
| FR2 | Every item's radio shares one `name`: `htmlName` when supplied, otherwise a generated id, so the radios form one native group. A disabled group, whose radios have no form owner and submit nothing, uses the generated id even with `htmlName`, so it stays apart from a disabled group with the same `htmlName` in another form. The checked radio is the one whose `value` equals the group `value`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current tests                                             |
| FR3 | Selecting an enabled option calls `onChange(value)` once; RadioList holds no selection of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current tests                                             |
| FR4 | With no checked radio (an empty `value`, or one that matches no option), keyboard focus entering the group lands on the first radio that is not disabled, or on the last one when entering backward; in a wholly disabled group, on its first or last radio, keeping the enabled focus order (`spec:AST-085` FR1). Focus moving between radios inside the group is not redirected. With a selection, the selected radio is the Tab stop, even when it is disabled; no other disabled option is a Tab stop. In a group with no disabled option, arrow keys move and select through the browser's native radio behavior. In a group with any disabled option, RadioList moves focus and selection itself: Down and the inline-end arrow go to the next enabled radio and Up and the inline-start arrow to the previous one (mirrored in right-to-left), wrapping, or focus stays put when there is none. | WAI-ARIA radio group pattern; Decision log; current tests |
| FR5 | `isDisabled` MUST disable every item: each radio stays focusable with `aria-disabled="true"`, submits no value and does not block a submit, and refuses selection (`spec:AST-085` FR1–FR3, FR7), while the radios stay one native group apart from any other group with the same field name; a radio focused when the group becomes disabled keeps focus (`spec:AST-085` FR4). With `disabledMessage`, a reason tooltip also opens on group hover and keyboard focus, and the reason MUST describe each focusable radio (`spec:AST-085` FR5, FR7).                                                                                                                                                                                                                                                                                                                                                     | `spec:AST-085` FR1–FR5, FR7; current tests                |
| FR6 | `status.type === 'error'` sets `aria-invalid` on the radiogroup. The radiogroup exposes the effective required state (including a form-level default) with `aria-required`, while each radio's native `required` follows only the explicit `isRequired` and drops on a disabled radio; a natively required radio's `aria-invalid` follows the same status, so the browser's own invalid state never shows before an error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source and tests                                  |
| FR7 | The radiogroup lays options in a column with a small gap, or a row with a wider gap when horizontal, and passes `size` to every item.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests                                  |
| FR8 | Base props (`ref`, `id`, `aria-*`, `data-*`, `hidden`, `inert`, `dir`, DOM handlers) reach the radiogroup; a caller `onFocus` runs after FR4's entry handling. `container*` reaches the Field box where one renders (in a `horizontal-labels` FormLayout none renders, and `container*` has no effect and warns), and `control*` the radiogroup; root `xstyle`, `className`, and `style` are not accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `family:input-fields` FR10; current tests                 |
| FR9 | The radiogroup carries `astryx-radio-list` and reflects `data-orientation` and `data-size`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `architecture:component-theming-surface`; current tests   |

### Allowed variation

- **AV1 — Options.** Item content varies under `component:RadioListItem`.
- **AV2 — Theme paint.** Themes may restyle the group through `radio-list`.

### Representative states

| State                | Required invariant                                                 | Allowed variation |
| -------------------- | ------------------------------------------------------------------ | ----------------- |
| Empty value          | Forward Tab enters on the first radio that is not disabled.        | Orientation.      |
| One selected         | The selected radio is checked and is the Tab stop.                 | Size.             |
| Error status         | `aria-invalid`; detached message describes the group.              | Message.          |
| Disabled with reason | Radios focusable, refuse selection, not submitted; reason tooltip. | —                 |
| Disabled, no reason  | Same as with a reason, without the tooltip.                        | —                 |

### Transformation and precedence order

- **ORD1 — Item availability.** Group disabled or item disabled; every
  disabled radio stays focusable.
- **ORD2 — Required.** Effective required on the radiogroup; explicit required
  on each radio.

### Performance and resources

- **PR1 — Entry handling.** FR4 runs only on focus events with an empty `value`
  and adds no global listener.

## Accessibility contract

- **AR1 — Group semantics.** `role="radiogroup"` with a name, description,
  invalid and required state (FR1, FR6).
- **AR2 — Keyboard.** Tab reaches the group once (FR4); arrow keys move and
  select through native radio behavior and skip individually disabled options.
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
- `spec:AST-085` owns disabled focusability; RadioList meets its FR1–FR4 and
  FR7, and FR5 records the reason gap.
- `component:RadioListItem` owns each option and reads the group through
  context.

## Verification map

| Contract       | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                     | Representative states                                                                              | Mutation or failure expectation                                                                                                                                                                                                                                                                                  | Audit section                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1, AR1       | `RadioList.test.tsx` label, span-label, hidden-label, required and optional marker, status, and group-description cases; `RadioGroup.a11y.test.tsx` and `RadioGroup.a11y.chromium.spec.ts`                                                                                                                                                                                                                                                       | Visible and hidden label; each status; description                                                 | A missing group name or description fails. Evidence gap: no test asserts the caller description first or the disabled reason last, or the label tooltip.                                                                                                                                                         | `audit:RadioList/accessibility` |
| FR2, FR3       | `RadioList.test.tsx` selection and form cases                                                                                                                                                                                                                                                                                                                                                                                                    | Radio, label, and description clicks; `htmlName`; no name                                          | A wrong value, lost grouping, wrong form value, or a second `onChange` on a radio click fails. Evidence gap: no test counts `onChange` calls on delegated label and description clicks.                                                                                                                          | `audit:RadioList/behavior`      |
| FR4, AR2, PR1  | `RadioList.test.tsx` focus-management cases; `RadioList.focusableDisabled.test.tsx` arrow-key and entry cases; `RadioGroup.a11y.chromium.spec.ts` `radio-group.focus.entry-and-exit` rule on every `radio-list-group-*` state                                                                                                                                                                                                                    | Backward entry; intra-group movement; disabled options; RTL; wholly disabled group                 | A redirected intra-group move, entry on a disabled radio in a group with an enabled one, Tab entry off the selected or first option, or an arrow key that lands on or selects a disabled option fails. Evidence gap: no test asserts a caller `onFocus` after entry handling or the absence of global listeners. | `audit:RadioList/accessibility` |
| FR5, ORD1, AR3 | `RadioList.test.tsx` disabled, disabledMessage, and form cases; `RadioList.focusableDisabled.test.tsx` focusability, focus-kept, required, and form-owner cases; `RadioListDisabledForm.interaction.browser.spec.ts` submitted entries, validity, and a shared field name in two forms; `RadioGroup.a11y.test.tsx` and `RadioGroup.a11y.chromium.spec.ts` `radio-list-group-disabled-with-message` and `radio-list-option-group-disabled` states | Group and item disabled; with reason; selected option disabled; every option disabled and required | A native `disabled` attribute, a selection while disabled, a submitted disabled value, a blocked submit, or two disabled groups merged by a shared field name fails; the binding expects `radio-list-option-group-disabled` to be reached by Tab.                                                                | `audit:RadioList/accessibility` |
| FR6, ORD2      | `RadioGroup.a11y.test.tsx` and `RadioGroup.a11y.chromium.spec.ts` `radio-list-group-required-invalid-described` state                                                                                                                                                                                                                                                                                                                            | Required, invalid, described group                                                                 | A missing required or invalid state on the group fails. Evidence gap: no test asserts that a form-level required default reaches only `aria-required`.                                                                                                                                                           | `audit:RadioList/accessibility` |
| FR7, FR9       | `RadioList.test.tsx` theme-target case                                                                                                                                                                                                                                                                                                                                                                                                           | `size="sm"`                                                                                        | A missing row size fails. Evidence gap: the orientation case asserts only rendering; no test asserts the gaps, horizontal layout, `data-orientation`, `data-size`, or `astryx-radio-list` on the radiogroup.                                                                                                     | `audit:RadioList/layout`        |
| FR8            | `RadioList.fr10.test.tsx`; `RadioList.test.tsx` data-testid case                                                                                                                                                                                                                                                                                                                                                                                 | Caller labelledby; hidden, inert, dir; `horizontal-labels` FormLayout                              | A base prop off the radiogroup, or `container*` off the Field box, fails. Evidence gap: no test asserts a caller `onFocus` runs after entry handling.                                                                                                                                                            | `audit:RadioList/api`           |

## Current-state impact

- **Consumer docs.** `RadioList.doc.mjs` anatomy lists Header, Children, and
  Label/Value parts; RadioList renders a group label, options, and a status
  message, and has no header.

## Decision log

- **Keyboard model (FR4).** RadioList keeps the browser's native radio arrow
  keys and its shipped Tab entry rule; `spec:AST-085` leaves which radios a
  composite's arrow keys visit to the composite.
- **Disabled options under arrow keys (FR4).** Arrow keys skip individually
  disabled options, which stay focusable under `spec:AST-085`, as a native radio
  group skips disabled radios. ButtonGroup FR8, Calendar's constrained days, and
  the shared list focus hook skip `aria-disabled` items the same way.

RadioList otherwise applies `family:input-fields` FR10 and the WAI-ARIA radio
group pattern.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
