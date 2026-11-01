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

| Area                    | Contract                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `children`, `isHeaderRow`, `xstyle` (a list of StyleX styles), root `BaseProps`, and a `ref`.                                                            |
| Behavior                | A native `tr` carrying the `table-row` target that takes the enclosing Table's striping and hover treatment and holds its cells' divider during a glide. |
| End-user impact         | People can follow a row across the table by its stripe or hover highlight, and assistive technology reads it as a row.                                   |
| Builder impact          | None; the record describes shipped behavior.                                                                                                             |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes.                                                                               |
| Review checks           | Reject striping that counts an expansion panel, hover or striping on a header row, a lost target, or caller props that miss the row.                     |
| Governing rules         | `architecture:public-component-api` INV5–INV8; `architecture:component-theming-surface`.                                                                 |

This table is a review projection; the body below is authoritative.

## Intent

TableRow is the row a caller composes inside a children-mode Table, and the row
Table renders in data mode. It owns the `tr` and the row treatment the Table
asks for; the caller owns the cells.

Consumer syntax and examples belong in `TableRow.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — a body row.
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
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
- Cells, which draw the row divider — owned by `component:Table` and the caller.

## Public concepts

| Concept  | Closed values or states | Meaning                              | Availability by variant/orientation/state | Default | Owner                | Stability | Invalid-value behavior |
| -------- | ----------------------- | ------------------------------------ | ----------------------------------------- | ------- | -------------------- | --------- | ---------------------- |
| Row kind | body; header            | Header rows skip striping and hover. | Inside a Table                            | body    | `component:TableRow` | Stable    | —                      |
| Content  | ReactNode (cells)       | The row's cells.                     | Always                                    | —       | caller               | Stable    | —                      |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                      | Basis                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| FR1 | TableRow renders one `tr` carrying the `table-row` target and holding its children. Outside a Table it adds no row treatment.                                                                                                                                                                                                                                                                                                  | Current source and tests                                                |
| FR2 | Inside a Table, a body row takes the Table's treatment: with striping, every even body row paints `--color-background-muted`, counting body rows only, so an expansion panel row does not shift the stripes; with hover, a hover-capable pointer paints `--color-overlay-hover`; with both, the hover color replaces the stripe; a row with `aria-disabled="true"` takes no hover. A header row (`isHeaderRow`) takes neither. | Current source and tests                                                |
| FR3 | Inside a Table with `rows` or `grid` dividers, every row, header rows included, is the containing block for its cells' stand-in divider while a glide moves it; the cells draw the divider (`component:Table` FR14).                                                                                                                                                                                                           | Current source; `component:Table` FR14                                  |
| FR4 | `ref` reaches the `tr`; supported DOM, data, ARIA, and event props reach it before the component's target and styles; `xstyle`, `className`, and `style` compose on it.                                                                                                                                                                                                                                                        | Current source and tests; `architecture:public-component-api` INV5–INV8 |

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

| Contract  | Verification                                                                                  | Representative states                                          | Mutation or failure expectation                                                                                                                                                                                                                                                                        | Audit section             |
| --------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| FR1, AR1  | `Table.test.tsx` row-count, row-class, and standalone-row tests; `themingTargets.test.ts`     | Data mode; standalone                                          | A missing row or lost `table-row` class fails. `themingTargets.test.ts` catches only a renamed or undocumented target; no check fails if a standalone row stops carrying its target.                                                                                                                   | `audit:TableRow/anatomy`  |
| FR2, ORD1 | `Table.test.tsx` header-hover and striped tests                                               | Hover on; striped                                              | A header row that takes hover styling fails. Gap: the striped test asserts only that rows render, and no test covers stripe parity around an expansion panel or the stripe and hover colors. No test covers the hover color replacing the stripe or a row with `aria-disabled="true"` taking no hover. | `audit:TableRow/visual`   |
| FR3       | Source review                                                                                 | Rows and grid dividers; a glide; a header row                  | Gap: no test covers the row as its cells' divider containing block during a glide; `component:Table` FR14's real-browser divider checks are pending.                                                                                                                                                   | `audit:TableRow/visual`   |
| FR4       | `Table.test.tsx` row className and style tests, and the TableRow ref and HTML-attribute tests | Inside a Table; standalone; `ref`; `aria-label`, `data-testid` | A caller class, style, ref, or DOM attribute that misses the row fails. Gap: no test covers `xstyle` or the order in which caller styles follow the Table's treatment.                                                                                                                                 | `audit:TableRow/api`      |
| PR1       | Source review                                                                                 | Every state                                                    | Gap: no automated check fails if TableRow adds state or a listener.                                                                                                                                                                                                                                    | `audit:TableRow/behavior` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or Table rules. It links to their owners.
