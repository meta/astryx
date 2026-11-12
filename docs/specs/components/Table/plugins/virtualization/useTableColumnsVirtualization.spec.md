---
schema_version: 3
template_version: 4
kind: module
id: module:Table/useTableColumnsVirtualization
authority: current
archive_reason: null
superseded_by: null
approved_by: humbertovirtudes
approved_at: 2026-11-10
owners: [cixzhang]
review_triggers:
  [
    public-api,
    behavior,
    layout,
    theming,
    accessibility,
    interaction,
    performance,
    react-runtime,
  ]
verified_by:
  [
    packages/core/src/Table/plugins/virtualization/useTableColumnsVirtualization.test.tsx,
    scripts/check-knowledge.mjs,
  ]
parent_component: component:Table
references:
  [
    architecture:list-windowing,
    architecture:interaction-modality,
    architecture:public-component-api,
    architecture:react-component-runtime,
    spec:AST-002,
    spec:AST-009,
    spec:AST-025,
  ]
---

# useTableColumnsVirtualization module contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `useTableColumnsVirtualization({initialViewportWidth})` returns an opaque `TableVirtualizationCapability`; `Table.virtualization` takes it alone or in a list beside the rows capability. Table retains data, columns, identity, widths and plugins.                             |
| Behavior                | Inline-axis windowing of the unpinned columns between the pinned start and end runs, with two internal overscan columns per side, at most one retained focused column, native table semantics and parent-owned pre-cell planning.                                                |
| End-user impact         | Mounted cells keep their controls, focus and full-table column positions; unmounted columns are not promised virtual-cursor discovery.                                                                                                                                           |
| Builder impact          | Callers keep their column definitions and widths and accept single-line content; a columns-only Table keeps its block sizing, and unsupported content or structure falls back to rendering every column.                                                                         |
| Compatibility/readiness | Additive capability; output without it is unchanged. Implementation and numerical verification remain separate release requirements.                                                                                                                                             |
| Review checks           | Reject render-then-hide, a second scroll owner, header/body column drift, lost focus, unbounded retention, window-relative column positions and unmeasured budget claims.                                                                                                        |
| Governing rules         | `component:Table` owns columns, widths, pinned runs, admission, render planning and the viewport. `module:Table/useTableRowsVirtualization` owns the block axis. `architecture:list-windowing` owns the shared window computation. `spec:AST-025` FR18/FR19 constrain scrolling. |

This table is a review projection; the body below is authoritative.

## Intent

`useTableColumnsVirtualization` bounds mounted cells for a Table with many
columns. Its capability carries only a seed width; the widths come from the
Table's own column layout, and Table owns the semantic rendering pipeline.

## Compatibility and migration

- Released default preserved: `yes`; without the capability, Table output is unchanged.
- Compatibility class: additive hook and capability. `Table.virtualization` widens from one capability to one capability or a list, which keeps every existing call valid.
- Migration decision: `module:Table/useTableColumnsVirtualization/DEC-1` and `component:Table` FR18.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The inline seed, the windowed run between the pinned runs and Table's admission into the shared list window.
- Table's retained-focus participation, the column anchor policy and column-windowed accessibility outcomes.
- Column-windowing admission and its performance targets.

**Does not own / non-goals**

- Columns, widths, pinned runs, resizing, column settings, identity, rendering mode and the viewport: `component:Table` and their plugin modules.
- Block-axis windowing: `module:Table/useTableRowsVirtualization`.
- The visible range, internal overscan, inline gap geometry, the first-visible-key anchor math, the focus-column retention and the offset helpers: the shared windowing module, `architecture:list-windowing`. This module supplies Table's column pitches, pinned runs and admission to it.
- Grouped or multi-row headers, cells that span columns, detail or custom rows, vertical writing modes, page-level horizontal scrolling, an overscan setting or a `scrollToColumn` API.

## Public API and concepts

The hook returns an opaque `TableVirtualizationCapability` from
`initialViewportWidth`, never columns or widths. The initial width only seeds the
first window; it sizes no element. After mount, the measured inline viewport sets
the window.

| Concept      | Values or states                                                      | Meaning                                                       | Default               | Owner                                               | Stability         |
| ------------ | --------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------- | --------------------------------------------------- | ----------------- |
| Seed         | Positive finite CSS-pixel `initialViewportWidth`                      | The inline viewport width the first window plans for          | Required              | This module                                         | Stable            |
| Capability   | Opaque Table-compatible value                                         | Carries inline intent, not sliced columns or an engine handle | Absent without opt-in | This module; parent consumption                     | Stable            |
| Column pitch | The width Table layout gives each column at the table's minimum width | One width per column, the same widths pinned offsets use      | Derived               | `component:Table`                                   | Parent dependency |
| Windowed run | The unpinned columns between the pinned start and end runs            | The only columns that can unmount                             | Derived               | This module                                         | Stable            |
| Range        | Half-open contiguous interval of the windowed run                     | Viewport-intersecting columns before overscan                 | Derived               | `architecture:list-windowing`                       | Stable            |
| Focus column | Absent or one retained column                                         | Keeps the focused cell's column mounted outside the range     | Absent                | `architecture:list-windowing`; existing focus owner | Stable            |
| Metadata     | Logical column index and column count                                 | One source for `aria-colindex` and `aria-colcount`            | Derived               | `component:Table`                                   | Parent dependency |

## Behavioral contract

These requirements define the complete normative contract. Implementation,
browser, accessibility and performance verification remain release requirements.

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                               | Basis                             | Verification state   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------- |
| FR1  | Unchanged seed preserves capability identity. Unchanged columns, widths, pinned runs, data and mounted range preserve output identities and do not invoke product renderers again.                                                                                                                                                                                      | Parent memoization                | Required for release |
| FR2  | Pinned start and end runs always mount. In the windowed run, mounted columns are one contiguous range with two overscan columns per side plus at most one discontiguous focused column. With no unpinned column, column windowing changes nothing.                                                                                                                      | DEC-2; bounded DOM                | Required for release |
| FR3  | Each column's pitch is the width Table layout gives it at the table's minimum width, the same width pinned offsets use, including a widened row-number column. When the inline viewport is at least the table's minimum width, every column mounts.                                                                                                                     | Parent FR13/FR19; DEC-3           | Required for release |
| FR4  | The header row and every body row render the same column structure: the pinned start cells, at most three inaccessible native spacer cells around the mounted range and focused column, the mounted cells and the pinned end cells. A spacer has the summed width of the columns it stands for and no content, padding, border, state, focus stop or product transform. | Native HTML; header association   | Required for release |
| FR5  | While columns are windowed, Table exposes `aria-colcount` equal to the full column count, and every mounted header and body cell carries `aria-colindex` for its full-table position. Without column windowing, neither attribute is added.                                                                                                                             | Parent FR23; full-table semantics | Required for release |
| FR6  | Server and first client use the same seed: the windowed columns whose start lies within `initialViewportWidth` less the widths of both pinned runs, plus overscan. There is no full-render-then-collapse or empty-then-repair.                                                                                                                                          | SSR; runtime architecture         | Required for release |
| FR7  | A focused cell whose column leaves the range keeps that column mounted with its original subtree. Real focus departure, removal or return releases it; focus transfer replaces it. Scrolling alone never moves focus.                                                                                                                                                   | Existing focus owner; DEC-4       | Required for release |
| FR8  | Column order, width, visibility and pinning changes preserve the first visible column's key and its fractional offset; a removed anchor resolves to the next surviving column, then the previous one, then the start.                                                                                                                                                   | Column settings and resize; DEC-4 | Required for release |
| FR9  | Inline geometry uses the parent's shared viewport measurement and pooled resize path; column windowing adds no subscription, observer or frame of its own. The pinned runs' widths are subtracted from the inline viewport once.                                                                                                                                        | Parent FR19; spec:AST-025         | Required for release |
| FR10 | With `useTableRowsVirtualization`, rows and columns window together: a row gap spans the mounted column structure, and a retained focused cell keeps both its row and its column.                                                                                                                                                                                       | Rows module FR2/FR7               | Required for release |
| FR11 | Before rendering, admission requires data mode, explicit valid identity (parent FR18), the Table-owned scroll wrapper, a single header row, flat rows and a declared Table minimum width no wider than the columns' sum; a spanning cell found after mount latches the same fallback. Any unsupported case renders every column with a development warning.             | Parent FR18; DEC-2                | Required for release |
| FR12 | A list passed to `Table.virtualization` holds at most one rows capability and one columns capability; any other list renders without windowing and warns once in development.                                                                                                                                                                                           | Parent FR18; DEC-1                | Required for release |
| FR13 | Mounting or unmounting a column changes no row's height: unspecified `textOverflow` defaults to single-line truncation, and explicit `wrap` or a custom cell renderer without fixed-height admission renders every column.                                                                                                                                              | Rows module FR14; DEC-2           | Required for release |
| FR14 | A columns-only Table keeps the block sizing and block scrolling it has without windowing; only a rows capability gives the Table a parent-sized block viewport (`component:Table` FR19).                                                                                                                                                                                | Parent FR1/FR19                   | Required for release |

### Performance and resources

- **PR1 — Structural bound.** With an unobscured inline viewport `W` and the narrowest windowed column width `w`, mounted windowed columns are at most `ceil(W/w)+1+4+1`; the last is the optional focused column. Cells scale with mounted rows times mounted columns, never with the total column count.
- **PR2 — Stable work.** A scroll within the current range invokes zero product renderers; a range change mounts and unmounts only the columns that enter or leave.
- **PR3 — Timing targets.** At 1,000 columns, the p95 range-plus-commit for an inline scroll is at most 4 ms with 20 mounted rows; a no-op scroll is at most 2 ms.
- **PR4 — Evidence.** Targets are release requirements, not measured results; verification records environment, browser, column count, widths and p50/p95/max.

## Accessibility contract

- **AR1 — Native semantics.** Header association stays positional and native; spacers have no accessible name, role as data, control or state.
- **AR2 — Positions.** `aria-colindex` and `aria-colcount` report full-table positions (FR5); claims cover mounted cells only.
- **AR3 — Keyboard access.** The parent's named viewport keeps native arrow scrolling on both axes and Tab through mounted controls; Tab does not claim to reach unmounted columns.
- **AR4 — Focus retention.** FR7 keeps the focused cell's column; focus never jumps because a column unmounted.

## Design relationships

| Anatomy/state | Design requirement                                | Representation authority                | Module contract |
| ------------- | ------------------------------------------------- | --------------------------------------- | --------------- |
| Product cell  | Same appearance and controls as without windowing | Existing Table targets and state owners | FR4; FR11       |
| Spacer cells  | Geometry only; inaccessible and unpainted         | This module; no theme target            | FR4             |
| Pinned runs   | Always mounted, offsets unchanged                 | `useTableStickyColumns`                 | FR2; FR3        |
| Viewport      | One coordinated Table-owned scroll region         | Parent FR19                             | FR9             |

The module adds no theme target.

## Parent and system relationships

- `component:Table` FR13 owns column widths and floors; FR18 owns admission and the `Table.virtualization` prop; FR19 owns the both-axis viewport and shared geometry.
- `useTableStickyColumns` owns pinned runs and their offsets, which this module reads and never moves.
- `useTableColumnResize` and column settings own width, order and visibility changes; FR8 keeps the inline anchor across them.
- `module:Table/useTableRowsVirtualization` owns the block axis; FR10 governs the combination.
- `architecture:list-windowing` owns the shared windowing module. It computes the column range, the retained focus column and the anchor from the pitches, pinned runs and inline geometry that Table supplies, as it does for rows.

## Verification map

| Contract          | Verification                                               | Representative states                                                                                               | Mutation/failure expectation                                                                          |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| FR1-FR6; PR1-PR2  | Actual Table renderer-count, native DOM and geometry tests | No unpinned column, start/middle/end, pinned start and end, widened row number, wide viewport mounting every column | Header/body drift, a spacer with content, window-relative `aria-colindex` or an unbounded range fails |
| FR7-FR10; AR3-AR4 | Real-browser focus and anchor integration                  | Focused input scrolled out and back, resize, reorder, hide, pin, rows and columns together                          | Lost focus, a jump in the first visible column or a row gap that misspans fails                       |
| FR11-FR14         | Admission tests                                            | Grouped header, spanning cell, wrapped content, duplicate capabilities                                              | Windowing an unsupported case, or a fallback without its warning, fails                               |
| PR3-PR4           | Browser frame traces                                       | 1,000 columns, 20 rows, inline scroll and no-op                                                                     | Budget overrun without a recorded decision fails                                                      |

## Decision log

### DEC-1 — A sibling capability in the same prop

**Reference:** `module:Table/useTableColumnsVirtualization/DEC-1`
**Decider:** `humbertovirtudes`, `2026-11-10`

Column windowing is its own hook beside `useTableRowsVirtualization`, and
`Table.virtualization` takes one capability or a list of them.
Rejected: a second Table prop, and one combined hook that makes rows expressible two ways.

### DEC-2 — Unpinned columns window; pinned runs stay

**Reference:** `module:Table/useTableColumnsVirtualization/DEC-2`
**Decider:** `humbertovirtudes`, `2026-11-10`

Pinned start and end runs always mount, so their offsets and paint stay with the
sticky-columns owner. Only the run between them windows.
Rejected: windowing pinned columns.

### DEC-3 — Layout widths, not a declared width

**Reference:** `module:Table/useTableColumnsVirtualization/DEC-3`
**Decider:** `humbertovirtudes`, `2026-11-10`

Columns already declare `pixel()` or `proportional()` widths with floors, and an
overflowing Table renders at its minimum width. The window uses the widths
layout gives each column there, so callers add no width.
Rejected: a uniform `columnWidth`, and measuring offscreen columns.

### DEC-4 — One focus column and a first-visible-key anchor

**Reference:** `module:Table/useTableColumnsVirtualization/DEC-4`
**Decider:** `humbertovirtudes`, `2026-11-10`

One retained column keeps focus; the first visible column's key and fractional
offset anchor inline scrolling across column changes.
Rejected: stretching the range to a remote focused column.

## Open questions

None. The normative contract is complete. Implementation and release
verification remain separate from contract approval.

## Content boundary

This record does not duplicate consumer signatures/examples, parent protocol,
research, measured results, implementation steps or general virtualizer algorithms.
