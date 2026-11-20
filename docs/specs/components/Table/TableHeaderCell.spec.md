---
schema_version: 3
template_version: 7
kind: component
id: component:TableHeaderCell
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Table/TableHeaderCell.test.tsx,
    packages/core/src/Table/TableHeaderCell.truncationTooltip.test.tsx,
    packages/core/src/Table/__tests__/TableHeadingOverflow.a11y.chromium.spec.ts,
    packages/core/src/Table/tableContextMenu.test.tsx,
    packages/core/src/Table/Table.test.tsx,
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

# TableHeaderCell component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `children`, `scope`, `contextMenuActions`, `xstyle` (one style or a list), root `BaseProps`, and a `ref`.                                                                                                 |
| Behavior                | A native `th` carrying the `table-header-cell` target that takes the Table's density and column dividers, always draws its bottom divider, and wraps or truncates its text by the Table's `textOverflow`. |
| End-user impact         | People see column headings set apart by weight, color, and a rule, aligned with the cells below.                                                                                                          |
| Builder impact          | A heading follows the Table's `textOverflow`; under `truncate`, a cut heading shows in full in a tooltip on keyboard focus inside the cell (FR2).                                                         |
| Compatibility/readiness | Records shipped behavior, except FR2's heading overflow and cut-heading tooltip (Compatibility and migration); no API change.                                                                             |
| Review checks           | Reject a missing bottom divider, a `scope` the caller did not set, a lost target or density reflection, or caller `xstyle` that loses to context styling.                                                 |
| Governing rules         | `architecture:container-padding`; `architecture:public-component-api` INV5–INV8; `architecture:component-theming-surface`.                                                                                |

This table is a review projection; the body below is authoritative.

## Intent

TableHeaderCell is the header cell a caller composes inside a children-mode
Table, as a column header or, with `scope="row"`, a row header, and the column
header cell Table renders in data mode. It owns
the `th` and its header treatment; the caller owns the heading content.

Consumer syntax and examples belong in `TableHeaderCell.doc.mjs`.

## Compatibility and migration

- Released default preserved: `no` — under the default `textOverflow="wrap"`,
  a data-mode heading longer than its column wraps instead of ending in an
  ellipsis, and
  under `truncate` a cut heading shows its tooltip on keyboard focus inside the
  cell (FR2). No `scope` unless given.
- Compatibility class: nonbreaking behavior change (FR2); no public prop,
  default, DOM, or target changes. At rest, the only styling change is a
  data-mode heading under the default `wrap`, which wraps.
- Builder choice: `textOverflow="truncate"` keeps one-line headings; the
  tooltip shows only when such a heading is cut.
- Decider: josephfarina, 2026-11-16: keyboard focus opens the cut-heading
  tooltip at once, only when the heading is cut; a mouse or pen hover and a
  touch tap open nothing; header cells that are not interactive gain no tab
  stop.
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The `th` element, which carries the `table-header-cell` target that
  `component:Table` owns and maps.
- Header weight, color, bottom divider, wrapping or truncation, and the Table's density and
  column dividers on the header cell.

**Does not own / non-goals**

- Sorting, filtering, resizing, and selection controls in headers — owned by
  `component:Table` and its plugins.
- Heading content — owned by the caller.

## Public concepts

| Concept         | Closed values or states                     | Meaning                                        | Availability by variant/orientation/state | Default | Owner  | Stability | Invalid-value behavior         |
| --------------- | ------------------------------------------- | ---------------------------------------------- | ----------------------------------------- | ------- | ------ | --------- | ------------------------------ |
| Scope           | `col`, `row`, `colgroup`, `rowgroup`; unset | Native header scope.                           | Always                                    | unset   | caller | Stable    | Closed union.                  |
| Context actions | action list or getter; unset                | Actions shown in a context menu on the header. | Always                                    | none    | caller | Stable    | An empty list renders no menu. |
| Content         | ReactNode                                   | The heading.                                   | Always                                    | —       | caller | Stable    | —                              |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| FR1 | TableHeaderCell renders one `th` carrying the `table-header-cell` target, which reflects the Table's density, holding its content, with `scope` only when given. Outside a Table it adds no header treatment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current source and tests                                                |
| FR2 | Inside a Table, the header cell uses semibold `--color-text-secondary` text aligned to the start, pads by the Table's density, and wraps or truncates its text by the Table's `textOverflow` like `component:TableCell` FR2: under `wrap` the heading wraps and the header row grows taller, except in children mode, where its column grows to keep the heading on one line at full width (`component:Table` FR24); under `truncate` it stays on one line and ends in an ellipsis. It also aligns its outer edge cells to the container inset like `component:TableCell` FR3, and always draws a `--border-width` `--color-border` bottom divider, even when the Table's dividers are off. With `columns` or `grid` dividers it draws an inline-end divider that the last header cell omits. Under `truncate`, when its column cuts the heading short, and only then, keyboard focus inside the cell where the header is interactive (a sortable header's sort control) shows the full heading in a tooltip at once; a mouse or pen hover and a touch tap show nothing. A header cell that is not interactive takes no focus, so keyboard users reach the full heading through its accessible content (AR1). The tooltip text is the heading itself, so it adds no description. Nothing is measured until keyboard focus reaches the cell, and Escape or moving focus out of the cell closes the tooltip. | Current source and tests; `component:Text` truncation tooltip           |
| FR3 | With context actions, the content sits in a context menu trigger.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source and tests                                                |
| FR4 | `ref` reaches the `th`; supported DOM, data, ARIA, and event props reach it before the component's target and styles; `xstyle` (one style or a list) wins over the context styling, and `className` and `style` compose alongside the target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current source and tests; `architecture:public-component-api` INV5–INV8 |

### Allowed variation

- **AV1 — Content.** Any heading content may fill the cell.

### Representative states

| State           | Required invariant                                 | Allowed variation |
| --------------- | -------------------------------------------------- | ----------------- |
| Standalone      | A `th` with the target and no treatment.           | —                 |
| Each density    | Density padding and `data-density`.                | —                 |
| Dividers off    | The bottom divider still draws.                    | —                 |
| Column dividers | Inline-end divider except on the last header cell. | —                 |

### Transformation and precedence order

- **ORD1 — Styles.** Header treatment → column divider → caller `xstyle`,
  `className`, and `style`.

### Performance and resources

- **PR1 — Few resources.** TableHeaderCell reads the Table's appearance. Its
  only state is FR2's cut-heading tooltip: the heading it measured on
  keyboard focus. It measures nothing and mounts no tooltip at rest; under
  `truncate`, the Tooltip module loads after the first render, as tooltip code
  does, and a wrapping header loads nothing.

## Accessibility contract

- **AR1 — Native header semantics.** The `th` keeps its native header role — a
  column header, or a row header under `scope="row"` or `"rowgroup"` — with the
  caller's `scope` when given; truncation is visual only, so the full heading
  remains its accessible content.

## Design relationships

| Anatomy or state   | Design requirement                                            | Representation authority | Hierarchy role | Component contract |
| ------------------ | ------------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Column header cell | A heading cell set apart by weight, color, and a bottom rule. | Current source and docs  | Supporting     | FR1, FR2           |

Theming: the `th` carries the `table-header-cell` target, which `Table.doc.mjs`
maps as the Column header cell part of `component:Table`.
`TableHeaderCell.doc.mjs` declares no anatomy of its own, so no anatomy-theming
block is declared here.

## Family and system relationships

- `component:Table` owns appearance settings, header controls, and the target
  mapping.
- `component:TableCell` FR3 defines the edge alignment the header cell shares.

## Verification map

| Contract     | Verification                                                                                                                                                                                                                                         | Representative states                                                                                                             | Mutation or failure expectation                                                                                                                                                                                                                                                 | Audit section                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| FR1, AR1     | `TableHeaderCell.test.tsx` element, scope, and outside-Table tests; `Table.test.tsx` density-reflection test; `themingTargets.test.ts`                                                                                                               | Default; `scope`; standalone; densities                                                                                           | A non-`th` element, an unrequested or missing `scope`, styling outside a Table, or a missing target or `data-density` fails. `themingTargets.test.ts` catches only a renamed or undocumented target.                                                                            | `audit:TableHeaderCell/anatomy`  |
| FR2          | `TableHeaderCell.test.tsx` density, weight and color, bottom divider, and column divider tests                                                                                                                                                       | Three densities; dividers off, rows, columns, grid                                                                                | Wrong density padding, weight, or color, a missing bottom divider, or a wrong column divider fails. Gap: edge alignment has no check.                                                                                                                                           | `audit:TableHeaderCell/layout`   |
| FR2 tooltip  | `TableHeaderCell.truncationTooltip.test.tsx` (cut heading on keyboard focus of a sortable header, no `aria-describedby`; blur closes; hover shows nothing; fitting heading; select-all cell; nothing measured at rest); real-browser focus and hover | Plain and sortable header cells, cut and fitting headings                                                                         | A cut heading without a tooltip, a fitting one with one, a duplicate description, or a layout read at rest.                                                                                                                                                                     | `audit:TableHeaderCell/layout`   |
| FR2 overflow | `TableHeaderCell.test.tsx` overflow-mode tests; `__tests__/TableHeadingOverflow.a11y.chromium.spec.ts` on the `HeadingOverflow` story (real browser at 390 px and 1280 px)                                                                           | Data mode and children mode; default `wrap` and `truncate`; a heading longer than its column                                      | Under `wrap`, a data-mode heading cut short or held on one line fails, and a children-mode table that does not keep its headings on one line fails; under `truncate`, a heading that wraps or a missing ellipsis fails; at 1280 px a fitting heading that changes height fails. | `audit:TableHeaderCell/layout`   |
| FR3          | `tableContextMenu.test.tsx` header context-menu tests                                                                                                                                                                                                | Header cell with actions                                                                                                          | A header cell with actions that does not open its menu, or one without actions that does, fails.                                                                                                                                                                                | `audit:TableHeaderCell/behavior` |
| FR4, ORD1    | `TableHeaderCell.test.tsx` xstyle, array xstyle, ref, attribute, and className and style tests                                                                                                                                                       | Caller inputs                                                                                                                     | A ref off the `th`, a dropped attribute, context styling that beats `xstyle`, or a lost caller class or style fails.                                                                                                                                                            | `audit:TableHeaderCell/api`      |
| PR1          | Source review                                                                                                                                                                                                                                        | Every state                                                                                                                       | Gap: no automated check fails if TableHeaderCell adds state beyond FR2's tooltip.                                                                                                                                                                                               | `audit:TableHeaderCell/behavior` |
| RTL relation | RTL audit curated D2 and D8 targets (`apps/storybook/rtl-audit/targets.json`) on the `In Card` story                                                                                                                                                 | A Card with `padding={0}`, where the first column's logical inline-start padding differs from its inline-end padding; LTR and RTL | A first column not at the inline start, or an edge padding that stays on the same physical side in RTL, fails D2 or D8.                                                                                                                                                         | `audit:TableHeaderCell/i18n-rtl` |

## Decision log

None recorded. FR2's heading overflow and cut-heading tooltip are the changes
from shipped behavior; Compatibility and migration records them.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or Table rules. It links to their owners.
