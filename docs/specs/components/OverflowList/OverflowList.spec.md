---
schema_version: 3
template_version: 7
kind: component
id: component:OverflowList
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/OverflowList/OverflowList.test.tsx,
    packages/core/src/hooks/useOverflow.test.ts,
    packages/core/src/hooks/computeOverflow.test.ts,
    packages/core/src/theme/themingTargets.test.ts,
    .github/visual-baseline/manifest.json,
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

# OverflowList component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `children`, `overflowRenderer`, `onOverflowChange`, `gap`, `minVisibleItems`, `maxVisibleItems`, `maxRows`, `collapseFrom`, `behavior`, root `BaseProps`, `ref`. |
| Behavior                | Shows as many caller items as fit the measured width, row count, and count limits, and hands the rest to a caller-rendered indicator and callback.               |
| End-user impact         | People see a single tidy row (or a few rows) of items, with a caller's "more" control standing in for the ones that do not fit.                                  |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                     |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes.                                                                                       |
| Review checks           | Reject a measurement copy that is exposed or focusable, an indicator on the wrong edge, a callback that fires before measurement or repeats an unchanged set.    |
| Governing rules         | `architecture:component-theming-surface`; `architecture:public-component-api` INV5–INV8.                                                                         |

This table is a review projection; the body below is authoritative.

## Intent

OverflowList renders a measured subset of caller-supplied items in a visible
list and lets the caller show the collapsed remainder. It owns measurement and
the choice of visible items; the caller owns the items and the indicator.

Consumer syntax and examples belong in `OverflowList.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — `gap` 2, one row, collapse from the end,
  observe self, no count limits.
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: not applicable; the visible count is
  measured.
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The visible list container and its `overflow-list` target.
- The hidden measurement copy, measuring available space, applying count and
  row limits, and choosing which items stay visible.
- When the overflow callback fires.

**Does not own / non-goals**

- The items supplied through `children` — owned by the caller.
- The indicator returned by `overflowRenderer`, and any menu it opens — owned
  by the caller.

## Public concepts

| Concept          | Closed values or states                | Meaning                                                                  | Availability by variant/orientation/state | Default       | Owner                    | Stability | Invalid-value behavior             |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- | ------------- | ------------------------ | --------- | ---------------------------------- |
| Collapse edge    | `start`; `end`                         | Which end loses items first and holds the indicator.                     | Always                                    | `end`         | `component:OverflowList` | Stable    | Closed union; rejected by types.   |
| Gap              | spacing step                           | Space between items and the indicator.                                   | Always                                    | 2             | `component:OverflowList` | Stable    | Closed union; rejected by types.   |
| Count limits     | `minVisibleItems`; `maxVisibleItems`   | A floor and a cap on visible items.                                      | Always                                    | 0; no cap     | `component:OverflowList` | Stable    | The floor wins over a smaller cap. |
| Rows             | positive number; unset                 | How many wrapped rows may show.                                          | Always                                    | one row       | `component:OverflowList` | Stable    | 1 or unset is a single line.       |
| Measured box     | `observeSelf`; `observeParent`         | Whether the list measures its own width or its parent's.                 | Always                                    | `observeSelf` | `component:OverflowList` | Stable    | Closed union; rejected by types.   |
| Overflow outputs | `overflowRenderer`; `onOverflowChange` | An indicator for the collapsed items; a callback with the collapsed set. | Optional                                  | none          | caller                   | Stable    | —                                  |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                        | Basis                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| FR1 | OverflowList renders a hidden measurement copy of every item, plus the indicator rendered for all items, and a visible container carrying the `overflow-list` target. The copy is `aria-hidden`, `inert`, invisible, zero-height, and takes no pointer input, so it is neither read, focused, nor clicked.                                                                                                                                       | Current source and tests                                                |
| FR2 | Once measured, the visible container shows the items that fit the measured width (its own, or its parent's with `observeParent`), at least `minVisibleItems` and at most `maxVisibleItems`, with the floor winning over a smaller cap. Before measurement, including a server render, it shows every item and no indicator. With `collapseFrom="end"` it keeps the leading items; with `start`, the trailing ones. Items render in caller order. | Current source and tests                                                |
| FR3 | When items collapse, the indicator `overflowRenderer` returns for the collapsed items renders after the visible items with `end`, or before them with `start`; without a renderer, collapsed items are dropped and no indicator renders.                                                                                                                                                                                                         | Current source and tests                                                |
| FR4 | One row is a non-wrapping flex line that clips overflow. `maxRows` above 1 wraps items and limits the container's height to that many measured rows plus gaps. `gap` sets the spacing between items. With `observeParent` and items collapsed, the container fills its parent's width.                                                                                                                                                           | Current source and tests                                                |
| FR5 | `onOverflowChange` receives the collapsed items, by original index, once the current content is measured: once on mount while overflowing, then only when the collapsed set's membership or order changes, including back to empty; never while nothing has overflowed, and never after unmount.                                                                                                                                                 | Current source and tests                                                |
| FR6 | `ref`, DOM, data, ARIA, and event props, `xstyle`, `className`, and `style` reach or compose on the visible container.                                                                                                                                                                                                                                                                                                                           | Current source and tests; `architecture:public-component-api` INV5–INV8 |

### Allowed variation

- **AV1 — Content.** Item and indicator content may vary without becoming
  OverflowList-owned targets.

### Representative states

| State              | Required invariant                                                    | Allowed variation  |
| ------------------ | --------------------------------------------------------------------- | ------------------ |
| All fit            | Every item, no indicator, no callback.                                | Gap.               |
| Collapse end       | Leading items; indicator after them.                                  | Indicator content. |
| Collapse start     | Trailing items; indicator before them.                                | Indicator content. |
| Capped             | Once measured, at most `maxVisibleItems`, unless the floor is larger. | —                  |
| Before measurement | Every item; no indicator.                                             | Server render.     |
| Multi-row          | Wrapped items within `maxRows` rows.                                  | Rows.              |

### Transformation and precedence order

- **ORD1 — Visible count.** Before measurement, every item; once measured, the
  measured fit → at most `maxVisibleItems` → at least `minVisibleItems`.
- **ORD2 — Reporting.** Measure the current content first; report only a
  changed collapsed set.

### Performance and resources

- **PR1 — Measurement.** OverflowList observes the measured box's size, renders
  every item in the hidden copy and the visible ones again in the list, and
  reports collapsed sets after measurement, before the frame paints.

## Accessibility contract

- **AR1 — One readable copy.** Only the visible container's items reach
  assistive technology and keyboard focus; the measurement copy is hidden and
  inert (FR1).
- **AR2 — Caller-owned access to collapsed items.** Collapsed items leave the
  visible list; the caller's indicator is the way to reach them, and its
  semantics are the caller's.

## Design relationships

| Anatomy or state   | Design requirement                                                  | Representation authority | Hierarchy role    | Component contract |
| ------------------ | ------------------------------------------------------------------- | ------------------------ | ----------------- | ------------------ |
| List               | The visible list container.                                         | Current source and docs  | Supporting        | FR1, FR4           |
| Items              | Caller items selected for display by width, rows, and count limits. | Caller-supplied content  | Context-dependent | FR2                |
| Overflow indicator | Caller-rendered access to, or a count of, collapsed items.          | Caller-supplied content  | Context-dependent | FR3                |

The hidden measurement copy is implementation structure, not consumer anatomy.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "List": {"target": "overflow-list"},
  "Items": {
    "none": {
      "reason": "intentional: Caller-supplied items retain their own theming ownership; OverflowList applies no target to them."
    }
  },
  "Overflow indicator": {
    "none": {
      "reason": "intentional: The caller-rendered overflow indicator retains its own theming ownership; OverflowList applies no target to it."
    }
  }
}
```

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification and the
  `none` dispositions for caller content.
- `architecture:public-component-api` owns caller-input routing; FR6 applies
  it.

## Verification map

| Contract            | Verification                                                                                                                                                                                                                           | Representative states                                                                                                                             | Mutation or failure expectation                                                                                                                              | Audit section                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| FR1, AR1            | `OverflowList.test.tsx` measurement-container and rendering-contract tests                                                                                                                                                             | Hidden copy; indicator measured against all items; visible class                                                                                  | A measurement copy that is not `aria-hidden` and `inert`, an indicator measured against fewer items, or a target off the visible container fails.            | `audit:OverflowList/theming`  |
| FR2, ORD1           | `OverflowList.test.tsx` fit, overflow, `minVisibleItems`, and cap tests; `useOverflow.test.ts` (including `observeParent`); `computeOverflow.test.ts`; stable visual baselines `core-overflowlist--default` (neutral and probe themes) | All fit; end and start; floor; cap; floor over cap                                                                                                | Wrong visible items, too few under a floor, too many under a cap, or a cap beating the floor fails; a changed default row comes back changed for review.     | `audit:OverflowList/behavior` |
| FR3                 | `OverflowList.test.tsx` indicator-placement and no-renderer tests                                                                                                                                                                      | End; start; no renderer                                                                                                                           | An indicator on the wrong side, or one rendered without a renderer, fails.                                                                                   | `audit:OverflowList/anatomy`  |
| FR4                 | `OverflowList.test.tsx` gap and `maxRows` tests                                                                                                                                                                                        | Gap change; `maxRows` 2 and 1                                                                                                                     | No class change for a new gap or for wrapping, or wrapping at `maxRows={1}`, fails. Gap: the row height limit and the `observeParent` fill have no check.    | `audit:OverflowList/layout`   |
| FR5, ORD2           | `OverflowList.test.tsx` `onOverflowChange` suite                                                                                                                                                                                       | Silent fit; mount; original indices; back to empty; unchanged; reorder; content change; count change; callback swap; state update; unmount; start | A callback that fires without overflow, repeats an unchanged set, misses a change, reports unmeasured content, loops on state, or fires after unmount fails. | `audit:OverflowList/behavior` |
| FR6                 | `OverflowList.test.tsx` ref and passthrough tests                                                                                                                                                                                      | Ref; DOM props                                                                                                                                    | A ref on another element or a dropped DOM prop fails. Gap: no test covers `className`, `style`, or the `xstyle` merge order.                                 | `audit:OverflowList/api`      |
| AR2, PR1            | Source review                                                                                                                                                                                                                          | Collapsed items                                                                                                                                   | Gap: no automated check covers keyboard reach to collapsed items or the observer lifecycle.                                                                  | `audit:OverflowList/a11y`     |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                          | Canonical anatomy and current target                                                                                                              | Missing, extra, or stale mappings fail repository validation.                                                                                                | `audit:OverflowList/theming`  |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, overflow
measurement mechanics, implementation steps, or system rules. It links to their
owners.
