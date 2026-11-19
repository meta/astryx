---
schema_version: 3
template_version: 4
kind: module
id: module:OverflowList/useOverflow
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior]
verified_by: [packages/core/src/hooks/useOverflow.test.ts]
parent_component: component:OverflowList
references:
  [
    component:OverflowList/FR7,
    component:OverflowList/PR1,
    component:OverflowList/DEC-1,
    architecture:public-component-api,
  ]
---

# useOverflow module contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. `useOverflow(itemCount, options)` returns `containerRef`, `measureRef`, `visibleCount`, `hasOverflow`, `rows`, and `rowHeight`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Behavior                | The hook measures when a commit mounts or changes its list, with every list in that commit, in a microtask after the commit and before paint. A browser report of the size a list last measured from measures nothing for that list.                                                                                                                                                                                                                                                                                                                                                                                                  |
| End-user impact         | A page with many overflow containers lays out once per commit for all of them, and a container whose observed parent narrows always folds to the new width.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Builder impact          | A caller that reads the results in the same task as a synchronous render awaits one microtask first. `component:OverflowList` PR1's notes on resize timing apply to direct callers too.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Authority: `draft`. FR3 gap: the recorded box can differ from the reported one without a real size change, because the hook records a parent's whole-number `clientWidth` less its padding, and the `getBoundingClientRect()` box of the measure copy and, under `observeSelf`, of the list, which an ancestor zoom, scale, skew or rotation changes (a translation does not, and a quarter turn only swaps width and height, which FR3 still matches). The list then measures again on that report, and it renders nothing when the result is unchanged. ORD1 has no test. |
| Review checks           | Reject a measurement inside the commit, results that land after the frame paints where `component:OverflowList` PR1 does not allow it, and a measured-size record that one list shares with another.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Governing rules         | `component:OverflowList` FR7, ORD3, PR1, PR2, and DEC-1; `architecture:public-component-api`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

This table is a review projection; the body below is authoritative.

## Intent

`useOverflow` is the public measuring core behind `OverflowList`. Apps also
call it directly to build their own overflow layouts. It measures a hidden copy
of a list's children and reports how many fit. This record contracts one
semantic slice: when the hook measures and when its results land. The fit
arithmetic, collapse order, count limits, and the indicator stay with
`component:OverflowList`.

## Compatibility and migration

- Released default preserved: `yes`. The record describes current `main`.
- Compatibility class: records shipped behavior; no API, default, or DOM
  change.
- Migration decision: `component:OverflowList` DEC-1 covers the timing. A test
  that reads the results right after a synchronous render awaits one microtask
  first, for example with `await act(async () => {})`.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- When the hook measures after a commit, and when its results land.
- Which resize reports make the hook measure again.
- The size that each list records for each element it observes.

**Does not own / non-goals**

- Fit arithmetic, collapse order, `minVisibleItems` and `maxVisibleItems`, rows,
  and the indicator: `component:OverflowList` FR2 and FR4, and the
  `computeOverflow` helper they verify.
- Which resize results paint one frame late: `component:OverflowList` PR1.
- The shared resize observer's own delivery: `utils/sharedResizeObserver`.

## Public API and concepts

| Concept       | Closed values or states                                                             | Meaning                                                                                                                 | Default                      | Owner                             | Stability |
| ------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------- | --------- |
| results       | `visibleCount`, `hasOverflow`, `rows`, `rowHeight`                                  | what fits in the list, as last measured                                                                                 | every item, one row, `0`     | `module:OverflowList/useOverflow` | stable    |
| refs          | `containerRef`, `measureRef`                                                        | the visible list and its hidden measure copy; attaching either one starts its observation                               | none                         | `module:OverflowList/useOverflow` | stable    |
| observed box  | `observeSelf` (the list's border box), `observeParent` (the parent's content width) | the size the measurement reads for the available width                                                                  | `observeSelf`                | `component:OverflowList`          | stable    |
| measured size | per list, per observed element                                                      | the size the list last measured from: the border box of the list and of its measure copy, or the parent's content width | none until the first measure | `module:OverflowList/useOverflow` | stable    |

## Behavioral contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Basis                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| FR1 | After a commit that mounts the list or its measure copy, or that changes the item count or an option, the hook measures in a microtask after the commit, with every other list in that commit. Every list reads its sizes, then one render applies every result, before the frame paints. The results do not change inside the commit.                                                                                                                                                                                                                                                                    | `component:OverflowList` FR7 and DEC-1 |
| FR2 | A resize report of a size the list has not recorded for that element (FR3) measures the list again in the same kind of microtask, with every list that the delivery reports. Its result renders before the frame paints, except where `component:OverflowList` PR1 renders it one frame later.                                                                                                                                                                                                                                                                                                            | `component:OverflowList` PR1           |
| FR3 | A list records, for each element it observes, the box it last measured from. A later report that matches that record within 0.01 px measures nothing for that list; a border box matches with its width and height in either order, because the report gives logical sizes and the record physical ones. Any other report measures. With `observeParent`, the record is the parent's content width, so a change of the parent's padding alone still measures. Each list keeps its own record, so a list measures a size it did not measure itself, also when another list on the same parent measured it. | Current source and tests               |

### Transformation and precedence order

- **ORD1 — Commit, then resize.** A list that a commit and a resize report both
  name in one microtask measures once, as a commit measurement (FR1).

### Performance and resources

- **PR1 — One layout per commit.** Lists mounted or changed in one commit read
  their sizes in one pass after it (`component:OverflowList` PR2).
- **PR2 — No measurement for a recorded size.** A report that matches the
  record (FR3) measures nothing. That is the only measurement the hook skips:
  any other report, including the browser's first report after a result that
  changed an observed box and the cases in FR3's gap, measures again and renders
  nothing when the result is unchanged.

## Accessibility contract

No accessibility semantics are owned by this hook.

## Design relationships

No visual representation is owned by this hook.

## Parent and system relationships

- `component:OverflowList` owns the aggregate behavior, the collapse rules, and
  the timing of its collapse and `onOverflowChange` (FR7, PR1).
- This record owns the hook's own measurement timing and its measured-size
  records, which `OverflowList` and direct callers share.

## Verification map

| Contract | Verification                                                                                                                                                                                                                                                                 | Representative states                                                 | Mutation or failure expectation                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| FR1, PR1 | `useOverflow.test.ts` "measures every list of a commit after it, then renders every result once"                                                                                                                                                                             | Two lists in one commit                                               | A measurement inside the commit, or a render between two lists' size reads, fails.                       |
| FR2      | `useOverflow.test.ts` "measures every list that one delivery reports, then renders once" and the "renders before paint" and "renders after paint" cases                                                                                                                      | One delivery for two lists; single-row and multi-row folds            | A resize result that renders at the wrong time for its case, or a second render for one delivery, fails. |
| FR3, PR2 | `useOverflow.test.ts` "measures nothing for a report of the size the list measured", "measures again when an observed parent's content box changes and its border box does not", and "measures each of two lists on one parent when only one of them measured the new width" | Same-size report; padding-only parent change; two lists on one parent | A measurement for a same-size report, a skipped padding change, or a record shared between lists fails.  |
| ORD1     | None. Gap: no test covers a commit and a resize report that name one list in one microtask.                                                                                                                                                                                  | A commit and a resize report in one microtask                         | A resize measurement that replaces a pending commit measurement would go unnoticed.                      |

## Decision log

None recorded. The timing decision is `component:OverflowList` DEC-1.

## Open questions

None.

## Content boundary

This record does not duplicate consumer signatures or examples, the parent's
aggregate protocol or ordering, current audit results, implementation steps, or
family, design, or system rules. It links to their canonical owners.
