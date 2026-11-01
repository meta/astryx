---
schema_version: 3
template_version: 7
kind: component
id: component:CheckboxListItem
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
    packages/core/src/CheckboxList/CheckboxList.test.tsx,
    packages/core/src/CheckboxList/__tests__/CheckboxList.a11y.chromium.spec.ts,
    packages/core/src/CheckboxInput/__tests__/Checkbox.a11y.test.tsx,
    packages/core/src/CheckboxInput/__tests__/Checkbox.a11y.chromium.spec.ts,
    apps/storybook/rtl-audit/targets.json,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:component-test-sufficiency,
    architecture:interaction-modality,
  ]
contributing: []
system_specs: [spec:AST-011, spec:AST-021, spec:AST-038, spec:AST-085]
---

# CheckboxListItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | One option row: a native checkbox named by `label` or `aria-label`, described by `description`, with optional `endContent`, rendered through ListItem. Inside a CheckboxList with a `value` array (collection mode), checked state comes from membership and `value` is required. Inside List, or inside a CheckboxList without `value` (standalone mode), the item reads `isChecked` and calls `onCheck`. |
| Behavior                | The checkbox is the option's only tab stop. Row-surface clicks delegate to it when the item is editable and sits in a CheckboxList or has `onCheck`, or when it has `onClick`; an item `onClick` fires once per direct, keyboard, or row-surface click. Disabled, read-only, and busy states refuse toggling.                                                                                              |
| End-user impact         | People can operate each option by pointer, touch, and keyboard, hear its name, description, and checked, mixed, disabled, read-only, or busy state, and see a spinner while it saves.                                                                                                                                                                                                                      |
| Builder impact          | Where the item sits, and whether its parent list has `value`, selects the mode; `value` is required only in collection mode. Handlerless meaning, checked-row theming and pointer feedback, consumer DOM-prop targets, read-only click propagation, and focus-ring ownership stay open questions (OQ1–OQ6).                                                                                                |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Handlerless items, checked-row state reflection, and the double focus indicator are listed under Current-state impact.                                                                                                                                                                                                                           |
| Review checks           | Reject a second tab stop, a toggle while disabled, read-only, or busy, `isChecked` overriding a parent `value` array, an `onClick` that fires more than once per click, a dropped description relationship, or a new target, state, or event-routing API introduced without an owner decision.                                                                                                             |
| Governing rules         | `architecture:public-component-api/INV5–INV9`; `architecture:component-theming-surface/INV3–INV6`; `architecture:interaction-modality/INV1–INV5`; `architecture:component-test-sufficiency/INV1–INV7`; `spec:AST-021/FR8–FR10`; `spec:AST-085/FR1, FR7`; `spec:AST-011`; `spec:AST-038/FR7`; WCAG 2.2 1.3.1, 2.1.1, 4.1.2.                                                                                 |

This table is a review projection; the body below is authoritative.

## Intent

Present one independent choice as a full-width row whose checkbox, label,
description, and end content stay aligned with its checked, available,
read-only, and busy state, inside a CheckboxList or a plain List.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: controlled only — by the parent list's
  `value` in collection mode, by `isChecked` in standalone mode
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- One option row: its CheckboxInput, naming (string label, rich label through
  `aria-labelledby`, `aria-label` override), description relationship,
  end-content slot, and the checkbox size that follows list density.
- Mode resolution: collection membership versus standalone `isChecked` and
  `onCheck`, the error for a missing `value` in collection mode, and the next
  value the row proposes.
- Row-surface click delegation, the single-tab-stop rule, and item `onClick`
  routing.
- Item disabled and loading states, the busy rendering of a pending collection
  item, read-only rendering, and the checked-row fill.

**Does not own / non-goals**

- The group, its label, description, status, disabled reason, read-only and
  disabled inputs, pending-value set, and collection change ordering — owned by
  `component:CheckboxList`.
- Row presentation, density, dividers, hover and pressed overlays, the
  focus-within ring, the `list-item` target, and label and description
  truncation — owned by `component:List` and Item.
- The checkbox control, its indicator, focus ring, pressed overlay, and busy,
  disabled, and read-only semantics — owned by `component:CheckboxInput` and
  CheckboxIndicator.
- Loading-indicator presentation — owned by `component:Spinner`; delegation
  mechanics — owned by the shared clickable-container hook.
- New targets, reflected states, or event-routing API.

## Public concepts

| Concept       | Closed values or states                                                                         | Meaning                                                                                                                               | Availability by variant/orientation/state                                      | Default        | Owner                | Stability                              | Invalid-value behavior                       |
| ------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------- | -------------------- | -------------------------------------- | -------------------------------------------- |
| naming        | string `label`; node `label`; `aria-label`                                                      | Names the checkbox; a node label names it from its visible text; `aria-label` replaces the derived name on the checkbox, not the row. | All states.                                                                    | label required | caller and component | stable                                 | rejected by the public type                  |
| mode          | collection (parent has `value`); standalone in CheckboxList without `value`; standalone in List | Collection reads membership and reports through the parent; standalone reads `isChecked` and calls `onCheck`.                         | Chosen by placement; `isChecked` and `onCheck` are ignored in collection mode. | standalone     | component            | stable                                 | a collection item without `value` throws     |
| checked state | unchecked, checked, mixed (standalone only)                                                     | Native checkbox state; mixed uses the native `indeterminate` property and proposes `true`.                                            | All modes.                                                                     | unchecked      | caller               | stable                                 | rejected by the public type                  |
| change path   | parent `onChange`/`changeAction` (collection); `onCheck` (standalone); none                     | Proposes the next value array or boolean.                                                                                             | Enabled, editable, non-busy items.                                             | none           | caller and component | shipped; handlerless meaning unsettled | no handler means no component-owned mutation |
| availability  | enabled; item `isDisabled`; group disabled; group disabled with reason                          | Blocks toggling and the checked-row fill; the checkbox stays focusable through `aria-disabled`.                                       | Item and group.                                                                | enabled        | component            | stable                                 | boolean only                                 |
| read-only     | from the group's `isReadOnly`                                                                   | Keeps the value visible, focusable, and full-opacity while refusing toggles.                                                          | Inside CheckboxList only.                                                      | false          | component            | stable                                 | boolean only                                 |
| busy          | `isLoading`; pending parent `changeAction` for the item's `value`                               | Spinner in the checkbox, busy row and checkbox, toggling refused.                                                                     | Per item.                                                                      | idle           | component            | stable                                 | boolean/transition state only                |
| content       | `description`, `endContent`                                                                     | Description describes the checkbox; end content stays caller-owned and outside the name.                                              | All states.                                                                    | none           | caller               | stable                                 | typed values only                            |
| `onClick`     | fires on the checkbox for direct, keyboard, and row-surface clicks                              | Once per click, including read-only items; the public type names the row element.                                                     | All states.                                                                    | none           | caller and component | shipped; target unsettled              | —                                            |
| pass-through  | `ref`, `className`, `style`, `xstyle`, data, ARIA except `aria-label`, other events             | Reach the row `<li>`; consumer `xstyle` composes after the checked-row fill.                                                          | All states.                                                                    | none           | component            | shipped; ARIA target unsettled         | component-owned attributes win               |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                    | Basis                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| FR1  | The row MUST render one native CheckboxInput as ListItem start content; that checkbox MUST be the option's only focusable control, and the row itself MUST NOT be focusable.                                                                                                                                                                                 | shipped source; focused tests; WCAG 2.1.1 and 4.1.2                                                                   |
| FR2  | A string `label` MUST name the checkbox; a node `label` MUST name it from the visible label element through `aria-labelledby`; `aria-label` MUST replace the derived name on the checkbox and never reach the row.                                                                                                                                           | shipped source and focused tests                                                                                      |
| FR3  | A renderable `description` MUST describe the checkbox through `aria-describedby`; an absent or empty description MUST add none.                                                                                                                                                                                                                              | shipped source and focused tests; WCAG 1.3.1                                                                          |
| FR4  | Inside a CheckboxList with a `value` array, the item MUST read checked state from membership, throw without `value`, and propose the array with its `value` added or removed through the parent's change path; `isChecked` and `onCheck` MUST be ignored.                                                                                                    | shipped source and focused tests                                                                                      |
| FR5  | Inside List, or inside a CheckboxList without `value`, the item MUST read `isChecked` and call `onCheck` with the next boolean; a mixed item MUST propose `true`, and `value` MAY be omitted. The mixed-state gap `component:CheckboxInput` FR1 records applies when the mixed value is kept.                                                                | shipped source and focused tests                                                                                      |
| FR6  | Item `isDisabled` or a disabled group MUST make the checkbox focusable-disabled through `aria-disabled` (`component:CheckboxInput` FR4), refuse toggling, and omit the checked-row fill; a group reason adds the group tooltip (`component:CheckboxList` FR9).                                                                                               | shipped source, focused tests, and shared checkbox binding                                                            |
| FR7  | Item `isLoading`, or a pending parent `changeAction` for the item's `value`, MUST render Spinner inside the checkbox, mark the row and the checkbox busy, and refuse toggling.                                                                                                                                                                               | shipped source, focused tests, and the Chromium accessibility suite                                                   |
| FR8  | A read-only group MUST make the checkbox read-only, focusable, and full-opacity, refuse every toggle, and omit the checked-row fill; the row delegates clicks only when the item has `onClick`.                                                                                                                                                              | shipped source, focused tests, and shared checkbox binding; `spec:AST-011`                                            |
| FR9  | On an enabled, editable item inside a CheckboxList or with `onCheck`, a row-surface click outside interactive descendants MUST be delegated to the checkbox; links and buttons in the label, description, or end content MUST keep their own behavior.                                                                                                       | shipped source and focused tests                                                                                      |
| FR10 | An item `onClick` MUST fire once for each direct, keyboard, or row-surface click, including on read-only items.                                                                                                                                                                                                                                              | shipped source and focused tests; `architecture:public-component-api/INV5`                                            |
| FR11 | `compact` density MUST render the `sm` checkbox; other densities MUST render `md`.                                                                                                                                                                                                                                                                           | shipped source and focused test                                                                                       |
| FR12 | An enabled, editable, checked row MUST paint the `--color-accent-muted` fill, and consumer `xstyle` MUST compose after it.                                                                                                                                                                                                                                   | shipped source and the Chromium accessibility suite                                                                   |
| FR13 | `ref`, `className`, `style`, `xstyle`, data attributes, ARIA other than `aria-label`, and events other than `onClick` MUST reach the row `<li>`.                                                                                                                                                                                                             | shipped source and focused tests                                                                                      |
| FR14 | A standalone item with `isChecked` and no `onCheck` changes nothing on activation. Implementation gap: it declares no read-only state, so the checkbox is exposed as editable (WCAG 2.2 4.1.2); inside a CheckboxList without `value`, its row also delegates clicks and shows pointer feedback. Its meaning is OQ1.                                         | exact `spec:AST-021` known failure `list-item-handlerless-read-only`; WCAG 4.1.2                                      |
| FR15 | The item paints the checked-row fill itself and reflects no selection state on the row's `list-item` or `item` targets, so a theme cannot restyle checked rows apart from unchecked rows (OQ2). Selection state MUST be reflected on the owning target (`architecture:component-theming-surface` INV6). Implementation gap: no selection state is reflected. | `architecture:component-theming-surface/INV6`                                                                         |
| FR16 | Shipped behavior, not a requirement until its open question is ruled: consumer DOM inputs split between two elements: data attributes and ARIA reach the row, while `onClick` runs on the checkbox and is typed for the row, so `event.currentTarget` is the checkbox and does not carry the row's data attributes (OQ3).                                    | `architecture:public-component-api/INV5`; `INV9` for any retype or move                                               |
| FR17 | Shipped behavior, not a requirement until its open question is ruled: on a read-only item with `onClick`, the item stops the click's propagation, so React ancestors never receive those clicks, while they do for enabled items (OQ4). The item's own `onClick` still fires once per click (FR10).                                                          | Current source; shared clickable-container hook behavior                                                              |
| FR18 | Shipped behavior, not a requirement until its open question is ruled: on an enabled, editable, checked row, the checked-row fill replaces the row's hover and pressed overlays, so pointer hover and hold give no row feedback (OQ5).                                                                                                                        | the Chromium accessibility suite; `design:user-states` leaves hover and selection treatment outside its current claim |
| FR19 | One keyboard focus move paints two indicators: Item's row focus-within outline and CheckboxInput's indicator ring (OQ6). One focus move MUST have one owning indicator (`architecture:interaction-modality` INV3). Implementation gap: both indicators paint.                                                                                                | the Chromium accessibility suite; `architecture:interaction-modality/INV3`                                            |

### Allowed variation

- **AV1 — Content.** Label, description, and end content may vary within their
  public types without becoming new targets.
- **AV2 — Composed presentation.** Density, dividers, row overlays, the focus
  ring, and the checkbox indicator remain capabilities of their owning
  components.
- **AV3 — Theme paint.** Semantic tokens and composed targets may change
  admitted visual properties without changing semantics, tab order, or state
  precedence.

### Representative states

| State                             | Required invariant                                                          | Allowed variation                     |
| --------------------------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| Collection option                 | Checked from membership; one tab stop; toggles through the parent           | Label, description, end content       |
| Standalone option (List or group) | Reads `isChecked`, calls `onCheck`; mixed proposes `true`                   | Placement                             |
| Busy option                       | Spinner, busy row and checkbox, toggling refused                            | Loading source (prop or pending save) |
| Read-only option                  | Visible, focusable, full-opacity, immutable; `onClick` fires once per click | Whether the item has `onClick`        |
| Disabled option                   | Inoperable; no checked-row fill                                             | Item or group source; group reason    |
| Handlerless standalone option     | Inert; declares no read-only state (FR14, OQ1)                              | —                                     |

### Transformation and precedence order

- **ORD1 — Checked state.** Parent `value` array (collection) → optimistic
  pending value → membership; otherwise `isChecked`; otherwise unchecked.
- **ORD2 — Toggle.** disabled, read-only, or busy guard → mode → parent
  `onChange` (collection) or `onCheck` (standalone).
- **ORD3 — Click routing.** Interactive descendants keep their clicks → other
  row-surface clicks delegate to the checkbox when the item is editable and sits
  in a CheckboxList or has `onCheck`, or has `onClick` → the checkbox's click
  runs `onClick` once.
- **ORD4 — Attributes.** Consumer rest props → row `<li>`; `aria-label` and
  `onClick` → checkbox; component-owned name, description, state, and busy
  attributes win.

### Performance and resources

- **PR1 — Bounded resources.** The item owns no observer, timer, or global
  listener; delegation listeners belong to the row and its lifetime.

Current measurements belong in the audit record; this subsection owns only
durable constraints and their verification target.

## Accessibility contract

- **AR1 — Option semantics.** Each option MUST remain a native checkbox whose
  name, description, checked or mixed state, and disabled, read-only, and busy
  states are programmatically determinable.
- **AR2 — Keyboard parity.** Tab MUST reach the checkbox exactly once, and Space
  MUST follow the same availability and change rules as pointer activation.
- **AR3 — Enlarged target.** The row surface MUST act as the checkbox's pointer
  and touch target without becoming a second control.
- **AR4 — Busy perception.** A busy option MUST expose busy state in the
  accessibility tree and visibly through Spinner.
- **AR5 — Focus visibility.** Keyboard focus on the checkbox MUST stay visible;
  two indicators paint today (FR19, OQ6).

## Design relationships

| Anatomy or state   | Design requirement                                                          | Representation authority                                   | Hierarchy role  | Component contract |
| ------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------- | ------------------ |
| Option row         | Full-width row with start checkbox, label and description, and end content. | List and Item                                              | Supporting      | FR1, FR9, FR13     |
| Checkbox           | Presents the option's selection indicator.                                  | CheckboxInput owner and `design:user-states` for its press | Prominent       | FR1, FR6–FR8, FR11 |
| Label, description | Name and describe the checkbox.                                             | Item                                                       | Primary content | FR2, FR3           |
| Checked-row fill   | Supplements the checkbox state on enabled, editable checked rows.           | unsettled (FR15, FR18)                                     | Supporting      | FR12               |
| Spinner            | Replaces the mark while the option is busy.                                 | Spinner                                                    | Supporting      | FR7                |

This record carries no anatomy-theming map. The composed option anatomy and its
target dispositions are recorded in `component:CheckboxList`'s theming anatomy,
and CheckboxListItem owns no target of its own.

## Family and system relationships

- `component:CheckboxList` composes this contract: it supplies the collection
  value, availability, read-only, and pending values the option reads through
  context, and owns the group around it.
- `architecture:public-component-api` owns pass-through preservation, event
  composition, refs, and released-change rules.
- `architecture:component-theming-surface` owns target placement and state
  reflection.
- `architecture:interaction-modality` owns focus visibility and the one-indicator
  rule.
- `spec:AST-021` owns the reusable checkbox accessibility binding for
  CheckboxListItem and its exact known-failure lifecycle.
- `spec:AST-011` records `isReadOnly` as the name for visible, focusable,
  non-editable values.
- `spec:AST-038/FR7` stops CheckboxList context at a layer boundary; an item
  inside a layer needs its own provider.
- List, Item, CheckboxInput, CheckboxIndicator, and Spinner retain their
  existing target and behavior contracts when composed here.

## Verification map

| Contract           | Verification                                                                                                                                                                   | Representative states                                                                | Mutation or failure expectation                                                                                                                 | Audit section                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| FR1, FR9, AR2, AR3 | `CheckboxList.test.tsx` single-tab-stop, row-click, link-in-label, and interactive end-content cases                                                                           | Collection option; row-surface click; link in a rich label; interactive end content  | A second tab stop, lost delegation, or a toggle from an interactive descendant fails.                                                           | `audit:CheckboxListItem/interaction`   |
| FR2, FR3, AR1      | `CheckboxList.test.tsx` accessible-name and description cases; shared checkbox bindings                                                                                        | String and rich label; `aria-label`; string and node description; absent description | A wrong name or description, or `aria-label` on the row, fails.                                                                                 | `audit:CheckboxListItem/accessibility` |
| FR4, FR5           | `CheckboxList.test.tsx` collection, standalone, and select-all cases                                                                                                           | Add, remove, missing `value`, mixed, select-all, `isChecked` with a parent array     | A wrong array or boolean, a missing error, or `isChecked` overriding membership fails.                                                          | `audit:CheckboxListItem/behavior`      |
| FR6–FR8, AR4       | `CheckboxList.test.tsx` disabled, loading, pending, and read-only cases; `CheckboxList.a11y.chromium.spec.ts` `disabled-*`, `loading-item`, `pending-*`, and `read-only` cases | Item and group disabled; reason; loading; pending; read-only                         | A toggle while disabled, read-only, or busy, or a lost busy state, fails.                                                                       | `audit:CheckboxListItem/accessibility` |
| FR10, FR17         | `CheckboxList.test.tsx` item `onClick` and read-only click cases                                                                                                               | Enabled and read-only; direct, keyboard, and row-surface clicks                      | An `onClick` that fires zero or several times per click fails. Evidence gap: no test asserts the stopped propagation on read-only items (FR17). | `audit:CheckboxListItem/behavior`      |
| FR11               | `CheckboxList.test.tsx` density case                                                                                                                                           | Compact and balanced                                                                 | A wrong checkbox size fails.                                                                                                                    | `audit:CheckboxListItem/layout`        |
| FR12, FR18         | `CheckboxList.a11y.chromium.spec.ts` `checked`, `hover-*`, and `pressed-*` cases                                                                                               | Light and dark; unchecked and checked                                                | A missing or misplaced fill fails the row-paint check. Evidence gap: no assertion that `xstyle` composes after the fill.                        | `audit:CheckboxListItem/visual`        |
| FR13, FR16         | `CheckboxList.test.tsx` ref and styling, data-testid, and ARIA cases                                                                                                           | Row ref, class, style, data, ARIA                                                    | A dropped or misrouted input fails. Evidence gap: no test asserts `event.currentTarget` for `onClick` (FR16).                                   | `audit:CheckboxListItem/api`           |
| FR14               | `Checkbox.a11y.test.tsx` known failure `list-item-handlerless-read-only`; `CheckboxList.a11y.chromium.spec.ts` `handlerless` case                                              | Standalone with `isChecked` and no `onCheck`                                         | The recorded known failure stops matching when its gap closes.                                                                                  | `audit:CheckboxListItem/accessibility` |
| FR15, FR19, AR5    | `CheckboxList.a11y.chromium.spec.ts` `focus-visible` and `forced-colors-focus` cases                                                                                           | Keyboard focus; forced colors                                                        | A lost focus indicator fails. Evidence gap: no test asserts the absent selection state (FR15) or counts focus indicators (FR19).                | `audit:CheckboxListItem/visual`        |
| Direction          | RTL audit target `core-checkboxlist--rich-descriptions` (`apps/storybook/rtl-audit/targets.json`); `CheckboxList.a11y.chromium.spec.ts` `rtl` case                             | LTR and RTL                                                                          | The checkbox and end content fail to swap inline order.                                                                                         | `audit:CheckboxListItem/layout`        |
| ORD1–ORD4, PR1     | Covered by the FR4–FR10 and FR13 rows. Evidence gap: no test asserts the absence of observers, timers, or global listeners                                                     | —                                                                                    | —                                                                                                                                               | `audit:CheckboxListItem/behavior`      |

## Current-state impact

- **Handlerless item (FR14).** A standalone item with `isChecked` and no
  `onCheck` is exposed as an editable checkbox though activation changes
  nothing (WCAG 2.2 4.1.2). The shared checkbox suite records this as a known
  failure; the meaning is OQ1.
- **Mixed state after activation (FR5).** A standalone mixed item whose value
  stays mixed loses its native mixed state on activation, as
  `component:CheckboxInput` records.
- **Checked-row state (FR15).** No selection state is reflected on the row
  targets, against `architecture:component-theming-surface` INV6.
- **Two focus indicators (FR19).** Keyboard focus paints both the row outline
  and the checkbox ring, against `architecture:interaction-modality` INV3.

## Decision log

No component-local decision. CheckboxListItem applies `spec:AST-021` and
`spec:AST-085`.

## Open questions

- **OQ1 — What does a standalone item with `isChecked` and no `onCheck`
  mean?** (`human-api`) Choose read-only, unavailable, or invalid usage,
  consistent with the matching CheckboxInput question.
- **OQ2 — How should a theme reach the checked-row fill?** (`human-api`)
  Exposing it needs a target or reflected-state decision.
- **OQ3 — Which element owns consumer DOM inputs?** (`human-api`) Data and ARIA
  reach the row while `onClick` runs on the checkbox under a row-typed handler.
- **OQ4 — Should read-only item clicks propagate?** (`human-api`) No current
  authority owns ancestor propagation. The stop exists because the shared
  clickable-container hook would otherwise re-delegate a click that came from
  its `aria-readonly` delegate target back to it.
- **OQ5 — What hover and pressed feedback should a checked row show?**
  (`human-design`) The checked-row fill currently replaces both overlays.
- **OQ6 — Which element paints the option's focus ring?** (`human-design`)
  `architecture:interaction-modality/INV3` requires one indicator; RadioList
  composes the same two painters.

## Content boundary

This file does not duplicate consumer prop tables and examples, current audit
results, implementation steps, or the group contract. It links to their
owners.
