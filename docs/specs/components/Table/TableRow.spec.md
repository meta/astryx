---
schema_version: 3
template_version: 7
kind: component
id: component:TableRow
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/Table/Table.test.tsx,
    packages/core/src/Table/plugins/selection/useTableSelection.test.tsx,
    packages/core/src/Table/TableRowParity.test.tsx,
    packages/core/src/Table/plugins/rowExpansion/useTableRowExpansion.glide.test.tsx,
    packages/core/src/Table/__tests__/TableRowGlide.a11y.browser.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: []
---

# TableRow component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `children`, `isHeaderRow`, `xstyle` (a list of StyleX styles), root `BaseProps`, and a `ref`.                                                                                                                                                                      |
| Behavior                | A native `tr` carrying the `table-row` target that takes the enclosing Table's striping and hover treatment and holds its cells' divider during a glide.                                                                                                           |
| End-user impact         | People can follow a row across the table by its stripe or hover highlight, and assistive technology reads it as a row.                                                                                                                                             |
| Builder impact          | A theme styles a selected row through the `table-row` target's `selected` state (FR5), and either stripe of a data-driven table through `parity` and `striped` (FR6).                                                                                              |
| Compatibility/readiness | Additive: a selected row gains `data-selected="selected"` (FR5); body rows gain `data-parity`, and a striped table's non-header rows `data-striped="striped"` (FR6); no prop or default changes; a theme's `table-row` background also reaches pinned cells (FR6). |
| Review checks           | Reject striping that counts an expansion panel, hover or striping on a header row, a lost target, or caller props that miss the row.                                                                                                                               |
| Governing rules         | `architecture:public-component-api` INV5–INV8; `architecture:component-theming-surface`.                                                                                                                                                                           |

This table is a review projection; the body below is authoritative.

## Intent

TableRow is the row a caller composes inside a children-mode Table, and the row
Table renders in data mode. It owns the `tr` and the row treatment the Table
asks for; the caller owns the cells.

Consumer syntax and examples belong in `TableRow.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — a body row.
- Compatibility class: additive; a selected row gains `data-selected="selected"`
  and the `table-row` target gains the `selected` theme state (FR5); body rows
  gain the `parity` visual prop, and body and footer rows the `striped` state
  (FR6); no prop or
  default changes; a theme's `table-row` background also reaches pinned
  cells (FR6).
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The `tr` element, which carries the `table-row` target that `component:Table`
  owns and maps.
- Applying the Table's striping and hover treatment to the row, and holding its
  cells' stand-in divider while a glide moves it.

**Does not own / non-goals**

- Whether the Table is striped, hoverable, or divided — owned by
  `component:Table`.
- Cells, which draw the row divider — owned by `component:TableCell`,
  `component:TableHeaderCell`, and the caller.

## Public concepts

| Concept  | Closed values or states | Meaning                                                                                                       | Availability by variant/orientation/state        | Default      | Owner                | Stability | Invalid-value behavior |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------ | -------------------- | --------- | ---------------------- |
| Row kind | body; header            | Header rows skip striping and hover.                                                                          | Inside a Table                                   | body         | `component:TableRow` | Stable    | —                      |
| Content  | ReactNode (cells)       | The row's cells.                                                                                              | Always                                           | —            | caller               | Stable    | —                      |
| Selected | selected                | A row the selection plugin has selected carries the `table-row` target's `selected` theme state.              | Inside a Table with `useTableSelection`          | not selected | `component:TableRow` | Stable    | —                      |
| Parity   | odd; even               | A body row's stripe, counted from 1 over body rows: the first is `odd`. Core's own stripe paints `even` rows. | Body rows of a data-driven Table                 | —            | `component:TableRow` | Stable    | —                      |
| Striped  | striped                 | A row of a Table with `isStriped` that is not a header row.                                                   | Body and footer rows of a Table with `isStriped` | not striped  | `component:TableRow` | Stable    | —                      |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Basis                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| FR1 | TableRow renders one `tr` carrying the `table-row` target and holding its children. Outside a Table it adds no row treatment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Current source and tests                                                |
| FR2 | Inside a Table, a body or footer row takes the Table's treatment: with striping, every even row of its section paints `--color-background-muted`, counting rows only, so an expansion panel row does not shift the stripes and a footer's second row is striped too; with hover, a hover-capable pointer paints `--color-overlay-hover`; with both, the hover color replaces the stripe; a row with `aria-disabled="true"` takes no hover. A header row (`isHeaderRow`) takes neither.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source and tests                                                |
| FR3 | Inside a Table with `rows` or `grid` dividers, every row, header rows included, is the containing block for its cells' stand-in divider while a glide moves it; the cells draw the divider (`component:Table` FR14).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests; `component:Table` FR14                        |
| FR4 | `ref` reaches the `tr`; supported DOM, data, ARIA, and event props reach it before the component's target and styles; `xstyle`, `className`, and `style` compose on it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests; `architecture:public-component-api` INV5–INV8 |
| FR5 | A row `useTableSelection` selects carries the `table-row` target's `selected` theme state (`data-selected="selected"`, written as every theme state is) beside `aria-selected`, and loses it when it is unselected, whatever `hasRowHighlight` is. The state is public theme surface (`architecture:public-component-api` DEC-2): it is how a theme styles a selected row, because the selection wash is an inline style a theme rule cannot replace; a theme recolors the wash by setting `--color-accent-muted` in that state, which the inline background reads.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current source and tests; `component:Table` FR6                         |
| FR6 | Inside a Table, a body row a data-driven table renders carries the `table-row` target's `parity` visual prop (`data-parity="odd"` or `"even"`), counted from 1 in display order from the row's own index, so an expansion panel row never counts, a windowed table counts logical rows, and re-sorted or reordered data takes the stripe of its new place. Every row of a Table with `isStriped` that is not a header row (`isHeaderRow`), footer rows included, carries the `striped` state (`data-striped="striped"`): the rows FR2's striping may paint. Header and footer rows carry no `parity`, and a row outside a Table carries neither; a Table nested in a body cell starts outside any body. A children-mode row (a `TableRow` the caller places in a `TableBody`) carries `striped` but no `parity`: its position is the caller's, which Core reads only through the rendered tree, and a guessed stripe would be wrong. Both attributes are public theme surface (`architecture:public-component-api` DEC-2): a theme styles one stripe with `parity:odd` or `parity:even`, and only striped tables with `+striped`. A pinned column (`useTableStickyColumns`) follows the row: its cells paint an opaque base plus the row's `--table-row-overlay`, and a theme's `backgroundColor` on `table-row` (at rest, under `parity`/`striped`, or in `:hover`) also sets that variable (a derived variable, `component:Table` theming), so a themed stripe or hover reaches pinned cells with nothing more to set. | Current source and tests                                                |

### Allowed variation

- **AV1 — Cells.** Any cells may fill the row.

### Representative states

| State            | Required invariant                                  | Allowed variation |
| ---------------- | --------------------------------------------------- | ----------------- |
| Standalone       | A `tr` with the target and no treatment.            | —                 |
| Striped body row | Even body rows muted; expansion panels not counted. | —                 |
| Hover body row   | Hover overlay under a hover-capable pointer.        | —                 |
| Header row       | No striping or hover.                               | —                 |

### Transformation and precedence order

- **ORD1 — Treatment.** Header row → no striping or hover; otherwise striping,
  then hover, from the Table; every row → the glide's containing block for its
  cells' divider; then the caller's `xstyle`, `className`, and `style`.

### Performance and resources

- **PR1 — No resources.** TableRow reads the Table's appearance and holds no
  state.

## Accessibility contract

- **AR1 — Native row semantics.** The `tr` keeps its native row role; striping
  and hover are visual only.

## Design relationships

| Anatomy or state | Design requirement                          | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Row              | A table row with optional stripe and hover. | Current source and docs  | Supporting     | FR1–FR3            |

Theming: the `tr` carries the `table-row` target, which `Table.doc.mjs` maps as
the Row part of `component:Table`. `TableRow.doc.mjs` declares no anatomy of
its own, so no anatomy-theming block is declared here.

## Family and system relationships

- `component:Table` owns striping, hover, and divider settings and the target
  mapping.
- `architecture:public-component-api` owns caller-input routing; FR4 applies
  it.

## Verification map

| Contract  | Verification                                                                                  | Representative states                                                                                                                                                                     | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Audit section             |
| --------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| FR1, AR1  | `Table.test.tsx` row-count, row-class, and standalone-row tests; `themingTargets.test.ts`     | Data mode; standalone                                                                                                                                                                     | A missing row or lost `table-row` class fails. `themingTargets.test.ts` catches only a renamed or undocumented target; no check fails if a standalone row stops carrying its target.                                                                                                                                                                                                                                                                                                                                                 | `audit:TableRow/anatomy`  |
| FR2, ORD1 | `Table.test.tsx` header-hover and striped tests                                               | Hover on; striped                                                                                                                                                                         | A header row that takes hover styling fails. Gap: the striped test asserts only that rows render, and no test covers stripe parity around an expansion panel or the stripe and hover colors. No test covers the hover color replacing the stripe or a row with `aria-disabled="true"` taking no hover.                                                                                                                                                                                                                               | `audit:TableRow/visual`   |
| FR3       | `TableRowGlide.a11y.browser.spec.ts`; `useTableRowExpansion.glide.test.tsx`                   | Mid-glide; pinned cells; themed and overridden dividers                                                                                                                                   | A divider that does not move with its gliding row, or the line on the wrong cell, fails. Gap: no check isolates a header row as the containing block during a glide.                                                                                                                                                                                                                                                                                                                                                                 | `audit:TableRow/visual`   |
| FR4       | `Table.test.tsx` row className and style tests, and the TableRow ref and HTML-attribute tests | Inside a Table; standalone; `ref`; `aria-label`, `data-testid`                                                                                                                            | A caller class, style, ref, or DOM attribute that misses the row fails. Gap: no test covers `xstyle` or the order in which caller styles follow the Table's treatment.                                                                                                                                                                                                                                                                                                                                                               | `audit:TableRow/api`      |
| FR5       | `plugins/selection/useTableSelection.test.tsx` selected-state tests                           | Select; unselect; `hasRowHighlight={false}`; a theme `selected` rule                                                                                                                      | A row that keeps the state after it is unselected, an unselected row that carries it, a row without it while `hasRowHighlight` is false, or a theme `selected` rule that does not match a selected row fails.                                                                                                                                                                                                                                                                                                                        | `audit:TableRow/api`      |
| FR6       | `TableRowParity.test.tsx`                                                                     | First row odd; re-sort; open expansion panel; windowed; pinned column; striped and plain; header, footer, nested table, outside a Table; children mode; a theme `parity:odd+striped` rule | A wrong or missing `data-parity` on a data-driven body row, a stripe shifted by an expansion panel or a re-sort, `data-striped` on a plain table or a header row, `data-parity` on a header or footer row, the outer table's stripe on a nested table's rows, a guessed parity in children mode, or a theme rule that matches the wrong rows fails. Gap: no browser check paints a pinned cell under a theme stripe; the test pins that a theme's row fill, at rest and in `:hover`, also writes the variable a pinned cell replays. | `audit:TableRow/api`      |
| PR1       | Source review                                                                                 | Every state                                                                                                                                                                               | Gap: no automated check fails if TableRow adds state or a listener.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `audit:TableRow/behavior` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or Table rules. It links to their owners.
