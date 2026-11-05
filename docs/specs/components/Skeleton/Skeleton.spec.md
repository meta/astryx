---
schema_version: 3
template_version: 7
kind: component
id: component:Skeleton
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Skeleton/Skeleton.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/Skeleton.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-009]
---

# Skeleton component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | A placeholder block with `width`, `height`, `radius`, and a stagger `index`.                                                                           |
| Behavior                | The block is hidden from assistive technology, waits one second, then pulses its opacity in ten steps; reduced motion keeps it static.                 |
| End-user impact         | Sighted users see the shape of content that is loading; screen-reader users are not given empty placeholders; high-contrast users still see the block. |
| Builder impact          | None; the record describes shipped behavior.                                                                                                           |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. No implementation gap is recorded.                                          |
| Review checks           | Reject an exposed-by-default placeholder, a `steps()` timing function, a pulse under reduced motion, or a block that disappears under forced colors.   |
| Governing rules         | `architecture:component-theming-surface/INV2`; `architecture:public-component-api/INV5,INV6,INV8`.                                                     |

This table is a review projection; the body below is authoritative.

## Intent

Skeleton stands in for content while it loads, so a page keeps its layout and
shows where content will appear. It owns the placeholder's shape, paint, pulse,
and its exclusion from the accessibility tree.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  styling, or target output changes
- Controlled/uncontrolled behavior: not applicable; Skeleton holds no state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The placeholder block, its `skeleton` theming target, size, and radius.
- Its paint in normal, increased-contrast, and forced-color modes.
- The delayed, staggered opacity pulse and its reduced-motion suppression.
- Its default exclusion from the accessibility tree.

**Does not own / non-goals**

- The surrounding region's loading state, busy semantics, layout, and when real
  content replaces the placeholder — owned by the product callsite.
- Indeterminate progress without a known shape — owned by
  `component:Spinner`.

## Public concepts

| Concept | Closed values or states                                 | Meaning                                             | Availability by variant/orientation/state | Default | Owner                | Stability | Invalid-value behavior                      |
| ------- | ------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------- | ------- | -------------------- | --------- | ------------------------------------------- |
| Size    | `width` and `height`: a number of pixels or a CSS value | The block's dimensions.                             | Always                                    | `100%`  | `component:Skeleton` | Stable    | A string passes through as CSS.             |
| Radius  | `none`, `0`, `1`, `2`, `3`, `4`, `rounded`              | Corner radius from the radius scale.                | Always                                    | `3`     | `component:Skeleton` | Stable    | TypeScript rejects other values.            |
| Stagger | non-negative integer `index`                            | Delays the pulse so sequential placeholders ripple. | Always                                    | `0`     | `component:Skeleton` | Stable    | Any number is applied in the delay formula. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                   | Basis                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | Skeleton renders one childless `div` carrying the `skeleton` target, sized by `width` and `height` (numbers in pixels, strings as CSS), default `100%` each.                                                                                                                                                                                                                                                | Current source and tests |
| FR2 | `radius` maps `none` to no radius, `0` to `--radius-none`, `1` to `--radius-inner`, `2` to `--radius-element`, `3` and `4` to `--radius-container`, and `rounded` to `--radius-full`; the default is `3`.                                                                                                                                                                                                   | Current source           |
| FR3 | The block paints `--color-skeleton` at opacity 0.25. Under `prefers-contrast: more` it paints that color mixed 30% toward primary text. Under `forced-colors: active` it paints `GrayText`, which wins over the contrast rule, at full opacity while no pulse runs; with motion allowed the FR4 pulse still varies its opacity.                                                                             | Current source and tests |
| FR4 | The block pulses its opacity from 0.25 to 0.925 in ten equal held steps and back, alternating indefinitely, each climb and each fall taking `--duration-medium-max` as the theme sets it before `tempo` scales it (`spec:AST-108` FR4), with a linear timing function and no `steps()`. The pulse starts after 1000 ms plus 100 ms times `index`. Under `prefers-reduced-motion: reduce` there is no pulse. | Current source and tests |
| FR5 | `ref` reaches the block. Supported DOM, ARIA, data, and event props, including `data-testid`, reach the block after the default `aria-hidden`; `xstyle`, `className`, and `style` merge in that order after component styles.                                                                                                                                                                               | Current source and tests |

### Allowed variation

- **AV1 — Theme paint.** A theme may change the block's visual properties through
  `skeleton` without changing its anatomy or accessibility exclusion.
- **AV2 — Shape.** Width, height, and radius vary per callsite to match the
  content they stand in for.

### Representative states

| State             | Required invariant                                                                                                | Allowed variation |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------- |
| Default           | `aria-hidden` block at 0.25 opacity, pulsing after one second.                                                    | Size and radius.  |
| Staggered         | Each block's pulse starts 100 ms after the previous index.                                                        | Number of blocks. |
| Reduced motion    | Static block at 0.25 opacity.                                                                                     | —                 |
| Forced colors     | `GrayText` block at full opacity while no pulse runs; with motion allowed the FR4 pulse varies its opacity (AR2). | —                 |
| Exposed by caller | `aria-hidden={false}` reaches the block.                                                                          | —                 |

### Transformation and precedence order

- **ORD1 — Paint.** Default skeleton color → increased-contrast mix → forced
  colors `GrayText`.
- **ORD2 — Attributes.** `aria-hidden="true"` and `data-testid` → component
  class → component styles → `xstyle` → `className` → `style` → caller props.

### Performance and resources

- **PR1 — Off-main-thread pulse.** The pulse changes only opacity and uses no
  stepped timing function, so supported engines can run it without main-thread
  repaint. Skeleton adds no listener, observer, or timer.

## Accessibility contract

- **AR1 — Hidden by default.** The block is `aria-hidden="true"`, so
  assistive technology does not announce empty placeholders; a caller may pass
  `aria-hidden={false}`. The surrounding region conveys busy state.
- **AR2 — Forced-color and increased-contrast paint.** The placeholder is
  decorative. In forced-color mode it paints `GrayText` so it stays visible
  where the browser would strip its fill, at full opacity while no pulse runs;
  with motion allowed the FR4 pulse still varies its opacity from 0.25 to
  0.925. Under increased contrast its color moves 30% toward the primary text
  color.
- **AR3 — Reduced motion.** The pulse is removed when the reader asks for
  reduced motion.

## Design relationships

| Anatomy or state | Design requirement                                       | Representation authority       | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Placeholder      | Previews the shape of loading content with a soft pulse. | Current source and public docs | Supporting     | FR1–FR4, AR1–AR3   |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Placeholder": {"target": "skeleton"}
}
```

## Family and system relationships

- `architecture:component-theming-surface` owns target qualification for the
  `skeleton` target.
- `architecture:public-component-api` owns ref, passthrough, and styling-input
  rules; FR5 applies them to the block.

## Verification map

| Contract            | Verification                                                          | Representative states                             | Mutation or failure expectation                                                                                                                                                                                                                                               | Audit section            |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1, FR5, AR1       | `Skeleton.test.tsx` render and a11y tests                             | Default; caller `aria-hidden={false}`             | Removing the block, the default `aria-hidden`, or the caller override fails. Gap: no test covers the ref, the default `100%` size, or the styling-input order.                                                                                                                | `audit:Skeleton/a11y`    |
| FR4, PR1, AR3       | `Skeleton.test.tsx` pulse suite                                       | Compiled keyframes and timing                     | A `steps()` timing function or changed opacity steps fails. Gap: the duration, opacity-only keyframes, the start delay, the per-index stagger, and the reduced-motion removal have no automated check.                                                                        | `audit:Skeleton/motion`  |
| FR3, AR2            | `Skeleton.test.tsx` forced-colors suite                               | Forced colors                                     | Dropping the `GrayText` or full-opacity override from the compiled CSS fails. Gap: the increased-contrast mix, and which rule wins when both media features apply, have no automated check, forced-colors rendering, including the pulse there, is not verified in a browser. | `audit:Skeleton/a11y`    |
| FR1–FR3             | `Skeleton.stories.tsx` Shapes and StaggeredList fixtures in a browser | Radii `rounded`, `3`, `2`, `none`; staggered list | Gap: no unit test asserts size, radius, or the increased-contrast paint, and no fixed story renders radius `0`, `1`, or `4` or increased-contrast mode; other values are visible only in the rendered fixtures.                                                               | `audit:Skeleton/layout`  |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                         | Canonical anatomy and current target              | Missing, extra, prefixed, or stale mappings fail repository validation.                                                                                                                                                                                                       | `audit:Skeleton/theming` |
| AR1                 | Accessibility-tree evidence (`spec:AST-009` FR3)                      | Default and exposed placeholder                   | Gap: no accessibility-tree check proves the placeholder is absent from the tree; the unit test asserts the attribute.                                                                                                                                                         | `audit:Skeleton/a11y`    |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
