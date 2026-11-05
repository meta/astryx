---
schema_version: 3
template_version: 7
kind: component
id: component:TableSelectionToolbar
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Table/TableSelectionToolbar.test.tsx,
    scripts/check-knowledge.mjs,
    apps/storybook/rtl-audit/targets.json,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:public-component-api,
    architecture:internationalization,
  ]
contributing: []
system_specs: [spec:AST-085]
---

# TableSelectionToolbar component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `selection` (from useTableSelectionState), `startContent`, `label`, `renderSelectionLabel`, `clearLabel`, `size`, `variant`, and the other Toolbar props except `endContent`. |
| Behavior                | A bulk-actions Toolbar that appears while rows are selected, showing the caller's actions, the selected count, and a command that clears the selection.                       |
| End-user impact         | People act on selected rows together, see how many are selected, and clear the selection in one step.                                                                         |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                  |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. One implementation gap is listed under Current-state impact.                                       |
| Review checks           | Reject a toolbar shown without a selection, an unlocalized default label, count, or clear label, or a clear command that leaves rows selected.                                |
| Governing rules         | `architecture:internationalization` INV1a; `spec:AST-085` FR4; `architecture:public-component-api`.                                                                           |

This table is a review projection; the body below is authoritative.

## Intent

TableSelectionToolbar is the bulk-actions bar for a Table with row selection.
It owns when the bar shows, the selection status, and the clear command; the
caller owns the actions.

Consumer syntax and examples belong in `TableSelectionToolbar.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — `sm`, `muted`, localized "Bulk
  actions", "{count} selected", and "Unselect All".
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: the selection is the shared state the
  caller passes.
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Focus lost after clearing (FR2).** Activating the clear command clears the
  selection, which removes the toolbar and the focused button with it; focus
  falls to the page, so keyboard users lose their place, where `spec:AST-085`
  FR4 has a component that removes a focused control name its destination.

## Ownership boundary

**Owns**

- Showing the toolbar only while rows are selected, the selected-count status,
  and the clear command.

**Does not own / non-goals**

- Toolbar layout, size, and variant — owned by `component:Toolbar`.
- The selection state — owned by useTableSelectionState.
- Bulk actions in `startContent` — owned by the caller.

## Public concepts

| Concept         | Closed values or states                       | Meaning                                                               | Availability by variant/orientation/state | Default            | Owner               | Stability | Invalid-value behavior               |
| --------------- | --------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------- | ------------------ | ------------------- | --------- | ------------------------------------ |
| Selection       | shared selection state                        | Whether to show and what to count and clear.                          | Always                                    | —                  | caller              | Stable    | —                                    |
| Labels          | `label`, `clearLabel`, `renderSelectionLabel` | The toolbar's name, the clear command's label, and the count content. | Always                                    | localized defaults | caller              | Stable    | A count renderer may return nothing. |
| Toolbar options | `size`, `variant`, other Toolbar props        | Passed to the Toolbar.                                                | Always                                    | `sm`, `muted`      | `component:Toolbar` | Stable    | —                                    |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | With no selection, TableSelectionToolbar renders nothing. With a selection, it renders a Toolbar named by `label` (localized "Bulk actions" by default) holding the caller's `startContent`, and at its end the selected-count content (localized "{count} selected" by default, or `renderSelectionLabel`'s result) and a ghost button labelled `clearLabel` (localized "Unselect All"). Default text comes from the catalog (`architecture:internationalization` INV1a). | Current source and tests |
| FR2 | The clear button clears the whole selection through the shared state, which removes the toolbar while the clear button holds focus. `spec:AST-085` FR4 has this record name where focus goes; the destination is open (OQ1). Implementation gap: focus is lost when the toolbar unmounts (Current-state impact).                                                                                                                                                           | Current source and tests |
| FR3 | `size` defaults to `sm` and `variant` to `muted`; other Toolbar props pass to the Toolbar, and `endContent` is not accepted.                                                                                                                                                                                                                                                                                                                                               | Current source           |

### Allowed variation

- **AV1 — Actions and labels.** Any actions and product-specific labels.

### Representative states

| State              | Required invariant                           | Allowed variation |
| ------------------ | -------------------------------------------- | ----------------- |
| No selection       | Nothing renders.                             | —                 |
| Selection          | Named toolbar, actions, count, clear button. | Labels.           |
| Custom empty count | The count renderer may render nothing.       | —                 |

### Transformation and precedence order

- **ORD1 — Labels.** Caller labels → catalog defaults.

### Performance and resources

- **PR1 — No resources.** TableSelectionToolbar holds no state of its own.

## Accessibility contract

- **AR1 — Named toolbar.** The bar is a Toolbar with an accessible name, and
  the clear command is a native button with its label.

## Design relationships

| Anatomy or state | Design requirement                                       | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Bulk actions bar | Actions, count, and clear command for the selected rows. | Current source and docs  | Supporting     | FR1–FR3            |

Theming: TableSelectionToolbar adds no target; the Toolbar and Button it
renders carry their own. `TableSelectionToolbar.doc.mjs` declares no anatomy,
so no anatomy-theming block is declared here.

## Family and system relationships

- `component:Toolbar` owns layout and theming.
- `spec:AST-085` FR4 owns focus after a focused control is removed; FR2
  records the gap.
- `architecture:internationalization` owns default text; FR1 applies INV1a.

## Verification map

| Contract       | Verification                                                                                             | Representative states                  | Mutation or failure expectation                                                                                                             | Audit section                          |
| -------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| FR1, ORD1, AR1 | `TableSelectionToolbar.test.tsx` no-selection, actions and status, empty count, and custom-label tests   | No selection; selection; custom labels | A toolbar without a selection, a missing name, count, action, or clear button, or ignored custom labels fail.                               | `audit:TableSelectionToolbar/behavior` |
| FR2            | `TableSelectionToolbar.test.tsx` clear test                                                              | Clear                                  | A clear that leaves rows selected fails. Gap: no test covers where focus goes after clearing.                                               | `audit:TableSelectionToolbar/a11y`     |
| FR3, PR1       | `TableSelectionToolbar.test.tsx` defaults test; source review                                            | Defaults                               | A toolbar that does not default to `sm` and `muted` fails. Gap: no automated check fails if TableSelectionToolbar adds state or a listener. | `audit:TableSelectionToolbar/api`      |
| RTL relation   | RTL audit curated D2 target (`apps/storybook/rtl-audit/targets.json`) on `TableSelection / Bulk actions` | One row selected; LTR and RTL          | A selected count that is not at the inline start of "Unselect All" fails D2.                                                                | `audit:TableSelectionToolbar/i18n-rtl` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

- **OQ1 — Where does focus go when Clear removes the toolbar?** (`human-api`)
  `spec:AST-085` FR4 has this record name the destination; until it does, a
  keyboard user who clears the selection loses their place.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or Table rules. It links to their owners.
