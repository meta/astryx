---
schema_version: 3
template_version: 7
kind: component
id: component:TableCell
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Table/Table.test.tsx,
    packages/core/src/Table/tableContextMenu.test.tsx,
    packages/core/src/Table/plugins/rowExpansion/useTableRowExpansion.test.tsx,
    packages/core/src/Table/plugins/rowExpansion/useTableRowExpansion.glide.test.tsx,
    packages/core/src/Table/__tests__/TableRowGlide.a11y.browser.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
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
    architecture:container-padding,
  ]
contributing: []
system_specs: []
---

# TableCell component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `children`, `scope`, `headers`, `colSpan`, `rowSpan`, `contextMenuActions`, `xstyle` (one style or a list), root `BaseProps`, and a `ref`.                                         |
| Behavior                | A native `td` carrying the `table-cell` target that takes the enclosing Table's density, overflow, alignment, and divider treatment, optionally inside a context menu.             |
| End-user impact         | People read cell content with consistent spacing that lines up with the surrounding container, and can open row or cell actions from the cell.                                     |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                       |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. One implementation gap is listed under Current-state impact.                                            |
| Review checks           | Reject a lost target or density reflection, edge padding that ignores the container inset, a context menu trigger that does not fill the cell, or caller props that miss the cell. |
| Governing rules         | `architecture:container-padding`; `architecture:public-component-api` INV5–INV8; `architecture:component-theming-surface`.                                                         |

This table is a review projection; the body below is authoritative.

## Intent

TableCell is the body cell a caller composes inside a children-mode Table, and
the cell Table renders in data mode. It owns the `td` and the cell treatment
the Table asks for; the caller owns the content.

Consumer syntax and examples belong in `TableCell.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Edge cells with actions keep their edge padding outside the trigger (FR3,
  FR4).** In the first and last cells of a row, the container-inset padding
  stays on the `td` while the context menu trigger carries its own density
  padding, so a secondary click on that strip opens the browser's menu and the
  content sits one density padding inside the inset.

## Ownership boundary

**Owns**

- The `td` element, which carries the `table-cell` target that `component:Table`
  owns and maps.
- Applying the Table's density, overflow, vertical alignment, and dividers, and
  wrapping content in a context menu when actions are given.

**Does not own / non-goals**

- Density, overflow, alignment, and divider settings — owned by
  `component:Table`.
- The context menu's behavior — owned by `component:ContextMenu`.
- Cell content — owned by the caller.

## Public concepts

| Concept             | Closed values or states                  | Meaning                                      | Availability by variant/orientation/state | Default | Owner  | Stability | Invalid-value behavior         |
| ------------------- | ---------------------------------------- | -------------------------------------------- | ----------------------------------------- | ------- | ------ | --------- | ------------------------------ |
| Table relationships | `scope`, `headers`, `colSpan`, `rowSpan` | Native cell associations and spans.          | Always                                    | none    | caller | Stable    | —                              |
| Context actions     | action list or getter; unset             | Actions shown in a context menu on the cell. | Always                                    | none    | caller | Stable    | An empty list renders no menu. |
| Content             | ReactNode                                | The cell's content.                          | Always                                    | —       | caller | Stable    | —                              |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Basis                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| FR1 | TableCell renders one `td` carrying the `table-cell` target, which reflects the Table's density, and holds its content. Outside a Table it adds no cell treatment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source and tests                                                |
| FR2 | Inside a Table, the cell pads by density (`compact` `--spacing-1` by `--spacing-2`, `balanced` `--spacing-2` by `--spacing-3`, `spacious` `--spacing-3` by `--spacing-4`) at body size, wraps or truncates text per the Table's `textOverflow`, aligns vertically per its `verticalAlign`, and draws dividers per its `dividers`: with `rows` or `grid`, a `--border-width` bottom border in `--color-border`, none in the section's last row; with `columns` or `grid`, an inline-end border, none on the row's last cell. While a glide moves its row, the bottom border goes transparent and one cell of the row draws a stand-in across the row's bottom edge (`component:Table` FR14). | Current source and tests                                                |
| FR3 | The first and last cells of a row pad their outer inline edge to the enclosing container's published inset, at least `--spacing-2`, falling back to the density padding outside a container. Implementation gap: in a first or last cell with context actions, the edge padding stays on the `td` outside the trigger, so the content sits one density padding inside the inset (FR4; Current-state impact).                                                                                                                                                                                                                                                                                | Current source; `architecture:container-padding`                        |
| FR4 | With context actions (a non-empty list or a getter), the content sits in a context menu trigger that fills the cell and carries the density padding, so the whole cell opens the menu; a getter resolves the actions when the menu opens. Implementation gap: in the first and last cells, the edge padding stays on the `td` outside the trigger, so a secondary click on that strip opens the browser's menu instead (Current-state impact).                                                                                                                                                                                                                                              | Current source and tests                                                |
| FR5 | `ref` reaches the `td`; supported DOM, data, ARIA, and event props reach it before the component's target and styles; `xstyle` (one style or a list), `className`, and `style` compose after component styles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current source and tests; `architecture:public-component-api` INV5–INV8 |

### Allowed variation

- **AV1 — Content.** Any content may fill the cell.

### Representative states

| State          | Required invariant                             | Allowed variation |
| -------------- | ---------------------------------------------- | ----------------- |
| Standalone     | A `td` with the target and no treatment.       | —                 |
| Each density   | Density padding and `data-density`.            | —                 |
| In a container | Outer edge cells align to the container inset. | —                 |
| With actions   | A full-cell context menu trigger.              | Actions.          |

### Transformation and precedence order

- **ORD1 — Styles.** Table treatment → context-menu adjustment → the glide's
  divider handling → caller `xstyle`, `className`, and `style`.

### Performance and resources

- **PR1 — No resources.** TableCell reads the Table's appearance; a context
  menu loads only when actions are given.

## Accessibility contract

- **AR1 — Native cell semantics.** The `td` keeps its native cell role and the
  caller's `scope`, `headers`, and spans; TableCell adds no role.

## Design relationships

| Anatomy or state | Design requirement                             | Representation authority | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Cell             | A body cell with density padding and dividers. | Current source and docs  | Supporting     | FR1–FR4            |

Theming: the `td` carries the `table-cell` target, which `Table.doc.mjs` maps as
the Cell part of `component:Table`. `TableCell.doc.mjs` declares no anatomy of
its own, so no anatomy-theming block is declared here.

## Family and system relationships

- `component:Table` owns appearance settings and the target mapping.
- `architecture:container-padding` owns the published inset FR3 reads.
- `component:ContextMenu` owns the context menu.

## Verification map

| Contract     | Verification                                                                                                                                           | Representative states                                                                                                             | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                           | Audit section              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| FR1, AR1     | `Table.test.tsx` children-mode and density-reflection tests; `themingTargets.test.ts`                                                                  | Children mode; each density                                                                                                       | A missing cell, a lost target, or a missing `data-density` fails. `themingTargets.test.ts` catches only a renamed or undocumented target.                                                                                                                                                                                                                                 | `audit:TableCell/anatomy`  |
| FR2          | `Table.test.tsx` density, overflow, divider, and vertical-alignment tests; `TableRowGlide.a11y.browser.spec.ts`; `useTableRowExpansion.glide.test.tsx` | Densities; wrap and truncate; dividers; mid-glide, pinned cells, themed and overridden dividers                                   | A mid-glide divider that does not move with its row, or the line on the wrong cell, fails in the glide checks. A truncating Table whose data-mode cells lose their truncating text wrapper, or a cell without the requested `vertical-align`, fails. Gap: the density and divider tests assert only that the table renders, and no test covers the cell's own truncation. | `audit:TableCell/layout`   |
| FR3          | Source review                                                                                                                                          | Inside Card, Section, Layout                                                                                                      | Gap: no test covers edge cells aligning to the container inset.                                                                                                                                                                                                                                                                                                           | `audit:TableCell/layout`   |
| FR4          | `tableContextMenu.test.tsx` body-cell row-actions and full-cell tests; `useTableRowExpansion.test.tsx` context-menu action test                        | Body cell with a list; body cell with a getter (expandable rows); full-cell trigger                                               | A body cell that ignores its action list or getter fails. Gap: the full-cell test checks only that the trigger has a class, so a trigger that does not fill the cell passes; no test covers an empty list or the edge-cell padding outside the trigger.                                                                                                                   | `audit:TableCell/behavior` |
| FR5, ORD1    | `Table.test.tsx` TableCell ref, `colSpan`, and `rowSpan` tests                                                                                         | `ref`; `colSpan`, `rowSpan`                                                                                                       | A ref off the `td` or a dropped `colSpan` or `rowSpan` fails. Gap: no TableCell test covers event props, `xstyle`, `className`, `style`, or the order in which caller styles follow the Table's treatment.                                                                                                                                                                | `audit:TableCell/api`      |
| PR1          | Source review                                                                                                                                          | Every state                                                                                                                       | Gap: no automated check covers lazy context-menu loading.                                                                                                                                                                                                                                                                                                                 | `audit:TableCell/behavior` |
| RTL relation | RTL audit curated D2 and D8 targets (`apps/storybook/rtl-audit/targets.json`) on the `In Card` story                                                   | A Card with `padding={0}`, where the first column's logical inline-start padding differs from its inline-end padding; LTR and RTL | A first column not at the inline start, or an edge padding that stays on the same physical side in RTL, fails D2 or D8.                                                                                                                                                                                                                                                   | `audit:TableCell/i18n-rtl` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or Table rules. It links to their owners.
