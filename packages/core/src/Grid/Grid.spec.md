---
schema_version: 3
template_version: 7
kind: component
id: component:Grid
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    scripts/check-knowledge.mjs,
    packages/core/src/serverSafeComponents.test.ts,
    packages/core/src/Grid/Grid.test.tsx,
    apps/storybook/stories/Grid.stories.tsx,
    .github/scripts/story-play-guard.js,
    packages/core/src/theme/themingTargets.test.ts,
  ]
modules: []
families: [family:layout-primitives]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:public-component-api,
    architecture:component-test-sufficiency,
  ]
contributing: []
system_specs: []
---

# Grid component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Grid arranges children in two-dimensional tracks with `columns` (a fixed count or a responsive object), gaps, item alignment, `rowHeight`, and box sizing.                            |
| Behavior                | A positive number creates exactly N `1fr` tracks without reflow; an object creates fill/fit tracks from a pixel minimum and optional count cap; axis gaps override uniform gap.       |
| End-user impact         | Content keeps DOM order and logical direction while responsive object-form grids reduce their count to fit. Fixed tracks may narrow or overflow when their content cannot shrink.     |
| Builder impact          | None; the record describes shipped behavior. Builders choose fixed numeric tracks or responsive object tracks explicitly.                                                             |
| Compatibility/readiness | Released behavior recorded as current; no API, default, target, or runtime changes.                                                                                                   |
| Review checks           | Reject automatic reflow for numeric columns, equal-width promises that ignore minimum content, lost gap precedence, raw inline track templates, or caller-overridable owned metadata. |
| Governing rules         | `family:layout-primitives/FR1–FR7`; `architecture:public-component-api/INV5–INV9`; `architecture:component-theming-surface/INV2–INV6`.                                                |

This table is a review projection; the body below is authoritative.

## Intent

Grid arranges caller-supplied items in two-dimensional tracks. It owns track construction, gaps, item alignment, and its box size; it owns no content, surface, or structural page semantics.

## Compatibility and migration

- Released default preserved: yes; omitted, zero, or negative numeric `columns` resolves to one track.
- Compatibility class: records shipped behavior; no runtime, DOM, styling, target, or public API changes.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Grid's root container, `grid` target, track construction, axis gaps, item alignment, and explicit box dimensions.
- The `grid-span` target that GridSpan's wrapper carries, which `Grid.doc.mjs` declares and the anatomy map below lists.
- Root prop and style composition on the Grid root.

**Does not own / non-goals**

- Caller content, item semantics, surfaces, or interaction — owned by the product callsite or rendered child component.
- A shared breakpoint or automatic reflow for numeric columns — responsiveness is selected by Grid's object form.
- The GridSpan wrapper's behavior and one item's row and column participation —
  owned by `component:GridSpan`, which has its own consumer doc and record.

## Public concepts

| Concept              | Closed values or states                    | Meaning                                                                 | Availability by variant/orientation/state | Default                     | Owner                      | Stability | Invalid-value behavior                       |
| -------------------- | ------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------- | --------------------------- | -------------------------- | --------- | -------------------------------------------- |
| column shape         | fixed number; responsive object; omitted   | Selects fixed `1fr` tracks or intrinsic fill/fit tracks.                | Every Grid                                | one track                   | `component:Grid`           | Stable    | zero/negative number falls back to one track |
| responsive repeat    | `fill`; `fit`                              | Keeps empty tracks or collapses them so present items stretch.          | Object-form columns                       | `fill`                      | `component:Grid`           | Stable    | Type-constrained                             |
| responsive count cap | absent; positive `max`; non-positive `max` | Caps the number of intrinsic tracks while allowing present tracks fill. | Object-form columns                       | absent                      | `component:Grid`           | Stable    | non-positive behaves as uncapped             |
| spacing              | shared `SpacingStep` values                | Separates rows/columns; axis values override uniform gap.               | Every Grid                                | browser grid gap default    | `family:layout-primitives` | Stable    | Type-constrained                             |
| item alignment       | `start`; `center`; `end`; `stretch`        | Sets `align-items` and `justify-items`.                                 | Every Grid                                | browser `normal`            | `component:Grid`           | Stable    | Type-constrained                             |
| box size             | number; CSS value string; absent           | Sizes the Grid box; numbers become pixels.                              | Every Grid                                | caller/container-determined | `family:layout-primitives` | Stable    | Browser validates strings                    |
| implicit row height  | number; absent                             | Sets pixel height for implicit rows used by row spans.                  | Every Grid                                | browser `auto`              | `component:Grid`           | Stable    | Browser validates the resulting CSS          |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                    | Basis                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| FR1 | A positive numeric `columns={N}` creates exactly N `1fr` tracks at every width and never reflows; minimum content may widen one track and overflow a narrow container. Omitted, zero, or negative `columns` gives one `1fr` track.                                           | DEC-1; released docs, source, and tests                         |
| FR2 | Object-form columns use auto-fill by default or auto-fit for `repeat: 'fit'`; `minWidth` is the track floor, while a positive `max` caps the count and lets a lone track shrink to the container.                                                                            | Released docs, source, and tests                                |
| FR3 | `rowGap` overrides `gap` only for rows, and `columnGap` overrides `gap` only for columns; the effective column gap participates in capped-track math. `rowHeight` sets the implicit row height in pixels.                                                                    | `family:layout-primitives/FR4`; source and tests                |
| FR4 | The track template is a class-level declaration, so caller `xstyle` and class rules, including media rules, can replace it. Caller `style` wins other inline declarations, and explicit `width`, `height`, `maxWidth`, and `minHeight` props override matching `style` keys. | `architecture:public-component-api/INV5–INV8`; source and tests |
| FR5 | `align` and `justify` set `align-items` and `justify-items` to `start`, `center`, `end`, or `stretch`; unset leaves the browser default (`normal`, which stretches items without a natural size or aspect ratio).                                                            | Source and tests                                                |
| FR6 | `ref`, DOM, data, ARIA, and event props, `xstyle`, class name, and inline style reach or compose on the root without replacing the `grid` target or its reflected `columns` (numeric form only), `gap`, `align`, and `justify`.                                              | `architecture:public-component-api/INV5–INV8`; source and tests |
| FR7 | Grid preserves caller DOM order and uses the document's logical inline direction; it creates no separate keyboard order.                                                                                                                                                     | Platform layout behavior                                        |

### Allowed variation

- **AV1 — Caller content.** Any caller-owned element may participate directly or inside GridSpan; Grid does not inspect or rewrite it.
- **AV2 — Track count.** Container width, minimum content, gaps, and object-form options may change the rendered responsive count within FR1–FR3.
- **AV3 — Root styling.** Caller styles may replace track templates or box presentation while preserving the component-owned target and metadata.

### Representative states

| State              | Required invariant                                                       | Allowed variation                                     |
| ------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| fixed Grid         | Exactly N explicit `1fr` tracks; no component-owned reflow.              | N, content minimums, gaps, and caller styling.        |
| responsive fill    | Empty tracks remain allocated while count responds to available width.   | Minimum width, cap, content count, and effective gap. |
| responsive fit     | Empty tracks collapse and present items stretch.                         | Minimum width, cap, content count, and effective gap. |
| capped narrow Grid | Count drops and one present track can fill a container below `minWidth`. | Container width and caller content.                   |
| direct item        | Caller content participates without a Grid-owned wrapper.                | Any caller-owned element and semantics.               |

### Transformation and precedence order

- **ORD1 — Track shape.** Responsive object with positive `max` → capped fill/fit template; responsive object without positive `max` → uncapped fill/fit template; positive number → fixed `repeat(N, 1fr)`; otherwise → one `1fr` track.
- **ORD2 — Gap.** Axis gap → uniform gap → no gap term in capped-track arithmetic.
- **ORD3 — Root composition.** Caller props apply first; the component-owned target, reflection, and StyleX compose next; `xstyle`, class name, and caller inline style keep their styling precedence; sizing props win over matching inline keys.

### Performance and resources

- **PR1 — CSS-owned layout.** Grid owns no state, effect, observer, listener, timer, or JavaScript measurement; layout and reflow are CSS-owned.

## Accessibility contract

- **AR1 — Layout remains nonsemantic.** Grid renders a `<div>` without grid, list, group, or landmark semantics of its own; callers provide semantics when their composition needs them.
- **AR2 — Order remains perceivable.** DOM order remains the reading and keyboard order in LTR and RTL; visual tracks do not create a second sequence.

## Design relationships

| Anatomy or state | Design requirement                                      | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Grid container   | Two-dimensional tracks for caller items; geometry only. | Current source and docs  | Supporting     | FR1–FR6            |
| Spanning item    | An optional wrapper documented beside Grid.             | `component:GridSpan`     | Supporting     | —                  |

Theming: the root is the `grid` target, reflecting `align`, numeric `columns`,
`gap`, and `justify`. `Grid.doc.mjs` documents the Spanning item part and its
`grid-span` target, so the map below lists both; `component:GridSpan` owns the
wrapper's behavior.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Grid container": {"target": "grid"},
  "Spanning item": {"target": "grid-span"}
}
```

## Family and system relationships

- `family:layout-primitives` owns shared spacing, sizing, alignment, and item-participation vocabulary; Grid owns the two-dimensional realization, and `component:GridSpan` the participation modifier.
- `architecture:public-component-api` owns root prop, styling, event, ref, and released-type composition.
- `architecture:component-theming-surface` sets the rules the `grid` target and its reflected axes follow.
- `architecture:component-test-sufficiency` owns bounded, mutation-sensitive evidence selection.

## Verification map

| Contract            | Verification                                                                                                      | Representative states                                                         | Mutation or failure expectation                                                                                                                                                                                                                                                                                         | Audit section         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| FR1–FR3, ORD1, ORD2 | `Grid.test.tsx` track-template, row-height, and capped-gap tests; `Grid.stories.tsx` AuditMatrix play guard       | Fixed; zero and negative; fill; fit; capped with and without gaps; row height | A changed track template (count, fill or fit, floor, cap, or the gap in the cap) or row height fails exact assertions; a grid that overflows its host fails the play guard. Gap: the gap and axis-gap tests assert only that the grid renders, so `rowGap` and `columnGap` overriding `gap` on their axis has no check. | `audit:Grid/behavior` |
| FR4, FR6, ORD3      | `Grid.test.tsx` raw-inline-template, sizing, ref, passthrough, and owned-metadata tests; `themingTargets.test.ts` | DOM, data, ARIA, events; class, style, xstyle; reflected axes                 | A dropped `aria-label`, replaced owned metadata, a raw inline track, or a wrong width or height fails. Gap: the ref test accepts any element, and the `xstyle`, `className`, `style` merge order and size props winning over `style` have no check.                                                                     | `audit:Grid/api`      |
| FR5                 | `Grid.test.tsx` alignment and owned-metadata tests                                                                | `align` and `justify`                                                         | A lost `data-align` or `data-justify` reflection fails. Gap: the alignment test asserts only that the grid renders, so the `align-items` and `justify-items` values have no check.                                                                                                                                      | `audit:Grid/behavior` |
| FR7, AR1, AR2       | `Grid.stories.tsx` AuditMatrix play guard in LTR and RTL                                                          | Fixed tracks in both directions                                               | Items that do not run start to end in the document direction fail the play guard. Gap: no automated check asserts that Grid adds no role or keeps DOM order.                                                                                                                                                            | `audit:Grid/a11y-rtl` |
| PR1                 | `serverSafeComponents.test.ts`; source review                                                                     | Every state                                                                   | A client API (state, an effect) added without a client directive fails `serverSafeComponents.test.ts`. Gap: a client API added together with a client directive passes, and no automated check fails if Grid adds layout measurement.                                                                                   | `audit:Grid/behavior` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                     | Consumer anatomy and current targets                                          | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                                           | `audit:Grid/theming`  |

## Decision log

### DEC-1 — Numeric `columns` stays fixed; reflow uses the existing object form

**Reference:** `component:Grid/DEC-1`
**Decider:** `cixzhang`, `2026-10-11`

`columns={N}` means exactly N `1fr` tracks at every width, and a grid that reflows on small screens uses `{minWidth, max?, repeat?}`. The number is the fixed contract; the object form is the responsive contract.

Rejected: redefining the number as "at most N" would break released numeric grids; a `{count, isFixed}` shape would duplicate the number and the `max` cap.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
