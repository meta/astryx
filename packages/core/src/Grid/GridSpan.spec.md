---
schema_version: 3
template_version: 7
kind: component
id: component:GridSpan
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
owners: [cixzhang]
review_triggers: [public-api, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/serverSafeComponents.test.ts,
    packages/core/src/Grid/Grid.test.tsx,
    apps/storybook/stories/Grid.stories.tsx,
    packages/core/src/theme/themingTargets.test.ts,
  ]
modules: []
families: [family:layout-primitives]
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: []
---

# GridSpan component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | An optional wrapper for one Grid item with `columns` (a count or `'full'`) and `rows`.                                                                 |
| Behavior                | A count spans that many tracks; `'full'` spans every explicit column; the wrapper keeps a zero minimum width so shrinkable content stays in its track. |
| End-user impact         | Readers see featured or tall items occupy several tracks without breaking the grid's order.                                                            |
| Builder impact          | None; the record describes shipped behavior.                                                                                                           |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes.                                                                             |
| Review checks           | Reject `'full'` described as covering implicit tracks, a lost zero minimum width, or a wrapper that adds semantics.                                    |
| Governing rules         | `family:layout-primitives/FR6`; `architecture:public-component-api/INV5,INV6,INV8`; `architecture:component-theming-surface/INV2`.                     |

This table is a review projection; the body below is authoritative.

## Intent

GridSpan changes how one item participates in a Grid: how many columns or rows
it covers. It owns that wrapper and nothing about the content inside it.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The wrapper `div`, which carries the `grid-span` target that
  `component:Grid` publishes and maps, and its column and row spans.
- The wrapper's single-track inner grid and zero minimum width.

**Does not own / non-goals**

- Track construction, gaps, and alignment — owned by `component:Grid`.
- Implicit tracks the browser creates when a numeric span exceeds the explicit
  grid.
- Caller content and its semantics.

## Public concepts

| Concept | Closed values or states        | Meaning                                    | Availability by variant/orientation/state | Default             | Owner                | Stability | Invalid-value behavior                                         |
| ------- | ------------------------------ | ------------------------------------------ | ----------------------------------------- | ------------------- | -------------------- | --------- | -------------------------------------------------------------- |
| Columns | positive number; `full`; unset | Spans N columns, or every explicit column. | Inside a Grid                             | intrinsic placement | `component:GridSpan` | Stable    | The browser resolves numeric spans, including implicit tracks. |
| Rows    | positive number; unset         | Spans N rows.                              | Inside a Grid                             | intrinsic placement | `component:GridSpan` | Stable    | The browser validates the resulting CSS.                       |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                        | Basis                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | GridSpan renders one `div` carrying the `grid-span` target, displayed as a grid with one `minmax(0, 1fr)` column, zero minimum width, and full height, holding its children.                                     | Current source and tests |
| FR2 | `columns={N}` sets `grid-column: span N`; `columns="full"` sets `grid-column: 1 / -1`, covering the explicit columns only; `rows={N}` sets `grid-row: span N`. Unset spans leave browser placement intrinsic.    | Current source and tests |
| FR3 | The span declarations are inline styles applied after the caller's `style`. `ref` reaches the `div`; supported DOM, ARIA, data, and event props reach it; `xstyle` and `className` merge after component styles. | Current source and tests |

### Allowed variation

- **AV1 — Caller content.** Any content may fill the wrapper.

### Representative states

| State        | Required invariant                            | Allowed variation |
| ------------ | --------------------------------------------- | ----------------- |
| Numeric span | Spans N tracks; may create implicit tracks.   | N.                |
| Full span    | Covers explicit columns from line 1 to -1.    | Column count.     |
| Row span     | Spans N rows, often with Grid's `rowHeight`.  | N.                |
| Long content | Shrinkable descendants stay inside the track. | Content.          |

### Transformation and precedence order

- **ORD1 — Span.** `'full'` → `1 / -1`; a number → `span N`; unset → intrinsic.
- **ORD2 — Inline style.** Caller `style` → span declarations.

### Performance and resources

- **PR1 — Static render.** GridSpan holds no state and uses no hooks.

## Accessibility contract

- **AR1 — Nonsemantic wrapper.** GridSpan adds no role, name, or tab stop of
  its own and keeps DOM order.
- **AR2 — Content stays reachable.** The zero minimum width lets shrinkable
  descendants stay inside their track; content that cannot shrink may still
  overflow under `component:Grid` FR1.

## Design relationships

| Anatomy or state | Design requirement                               | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------ | ------------------------ | -------------- | ------------------ |
| Spanning item    | One item covering several tracks; geometry only. | Current source and docs  | Supporting     | FR1, FR2, AR2      |

Theming: the wrapper carries the `grid-span` target, which `Grid.doc.mjs`
declares and `component:Grid` maps. `GridSpan.doc.mjs` declares no anatomy of
its own, so no anatomy-theming block is declared here.

## Family and system relationships

- `family:layout-primitives` FR6 names GridSpan the participation modifier for
  Grid; its behavior outside a Grid is this record's.
- `component:Grid` owns the tracks GridSpan spans.
- `architecture:public-component-api` owns ref, passthrough, and styling-input
  rules; FR3 applies them.

## Verification map

| Contract | Verification                                                         | Representative states              | Mutation or failure expectation                                                                                                                                                                             | Audit section             |
| -------- | -------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| FR1, FR2 | `Grid.test.tsx` GridSpan suite                                       | Numeric, full, row, combined, none | A wrong inline `grid-column` or `grid-row`, or a span set when none is given, fails. Gap: the `grid-span` target, the one-track inner grid, the zero minimum width, and the full height have no unit check. | `audit:GridSpan/layout`   |
| FR3      | `Grid.test.tsx` GridSpan ref and passthrough tests                   | Ref; extra props                   | A dropped ref or `aria-label` fails. Gap: the ref test accepts any element, and spans winning over caller `style` and the styling-input merge have no check.                                                | `audit:GridSpan/api`      |
| AR2      | `Grid.stories.tsx` long-content play and AuditMatrix full-span check | Long shrinkable child; full span   | Content escaping its track or a full span missing explicit columns fails the play.                                                                                                                          | `audit:GridSpan/layout`   |
| AR1, PR1 | `serverSafeComponents.test.ts`; source review                        | Every state                        | A client API added without a client directive fails `serverSafeComponents.test.ts`. Gap: a client API added together with a client directive passes, and no automated check fails if GridSpan adds a role.  | `audit:GridSpan/behavior` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
