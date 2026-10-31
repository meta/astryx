---
schema_version: 3
template_version: 7
kind: component
id: component:AspectRatio
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming]
verified_by:
  [
    .github/visual-baseline/manifest.json,
    packages/core/src/AspectRatio/AspectRatio.test.tsx,
    packages/core/src/AspectRatio/__tests__/AspectRatioFitLayers.a11y.browser.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/AspectRatio.stories.tsx,
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

# AspectRatio component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A box with a required `ratio`, a `shape` of `rectangle` or `ellipse`, and an optional `fit` of `cover`, `contain`, or `center` for its single child.            |
| Behavior                | The box takes its container's width and derives its height from `ratio` through a class-level `aspect-ratio`, clips overflow, and lays its child out per `fit`. |
| End-user impact         | Readers see media and placeholders at a stable shape that does not shift layout as content loads.                                                               |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                    |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes.                                                                                      |
| Review checks           | Reject an inline `aspect-ratio`, a `fit` that edits the child's own props, `fit` reflected on the theming target, or a box that stops clipping.                 |
| Governing rules         | `architecture:public-component-api/INV5,INV6,INV8`; `architecture:component-theming-surface/INV2,INV6`.                                                         |

This table is a review projection; the body below is authoritative.

## Intent

AspectRatio holds content at a fixed width-to-height ratio so media, embeds,
and placeholders reserve their space before they load. It owns the ratio box,
its optional elliptical clip, and how its child fills the box.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes. The content slot keeps the
  `data-astryx-aspect-ratio-override` attribute carrying `fit` for product CSS
  that targets it; no Astryx style keys on it
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The Ratio box: its width, derived height, clipping, and elliptical shape.
- The Content slot that fills the box and positions the child.
- Sizing and object-fit of the direct child when `fit` is set.

**Does not own / non-goals**

- The child's content, semantics, and alternative text — owned by the caller.
- Responsive ratio changes — owned by caller CSS through `xstyle` or an
  unlayered `aspect-ratio` rule.
- Avatar and thumbnail presentations — owned by `component:Avatar` and
  `component:Thumbnail`.

## Public concepts

| Concept | Closed values or states             | Meaning                                                                                                                                   | Availability by variant/orientation/state | Default     | Owner                   | Stability | Invalid-value behavior           |
| ------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------- | ----------------------- | --------- | -------------------------------- |
| Ratio   | A positive number, width ÷ height   | The box's `aspect-ratio`.                                                                                                                 | Always                                    | Required    | `component:AspectRatio` | Stable    | Passed to CSS as given.          |
| Shape   | `rectangle`, `ellipse`              | Whether the box is clipped to an ellipse (a circle at ratio 1).                                                                           | Always                                    | `rectangle` | `component:AspectRatio` | Stable    | TypeScript rejects other values. |
| Fit     | `cover`, `contain`, `center`; unset | How the child fills the box: stretched and cropped, stretched and letterboxed, or natural size centered; unset leaves the child unstyled. | Always                                    | unset       | `component:AspectRatio` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                 | Basis                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| FR1 | The Ratio box is a relative, full-width `div` with clipped overflow, zero minimum height, and no flex shrink, carrying the `aspect-ratio` target reflecting `shape`. Its `aspect-ratio` is `ratio`, emitted as a class-level declaration, so `xstyle`, an unlayered caller rule, or an inline `style` can override it.                                                                                    | Current source and tests                |
| FR2 | `shape="ellipse"` gives the Ratio box a 50% border radius, clipping it to a circle at ratio 1 and an oval otherwise.                                                                                                                                                                                                                                                                                      | Current source and tests                |
| FR3 | The Content slot is absolutely positioned at the box's top inline-start corner at full width and height, and carries `data-astryx-aspect-ratio-override` equal to `fit` when set.                                                                                                                                                                                                                         | Current source and tests                |
| FR4 | `fit="cover"` and `fit="contain"` size every direct child to the full box and give a direct `img` or `video` child `object-fit: cover` or `contain`; `fit="center"` centers the child at its natural size; unset `fit` applies no child styling. `fit` never edits the child's own props, and the child rules sit in the base cascade layer, so later layers, unlayered CSS, and inline child styles win. | Current source, tests, and browser test |
| FR5 | `fit` is not reflected on the theming target.                                                                                                                                                                                                                                                                                                                                                             | Current source and tests                |
| FR6 | `ref` reaches the Ratio box. Supported DOM, ARIA, data, and event props reach the Ratio box; `xstyle`, `className`, and `style` merge in that order after component styles.                                                                                                                                                                                                                               | Current source and tests                |

### Allowed variation

- **AV1 — Responsive ratio.** Callers may change the ratio per breakpoint or
  container size from CSS without changing the component.
- **AV2 — Theme paint.** A theme may restyle `aspect-ratio` per `shape`.

### Representative states

| State             | Required invariant                                              | Allowed variation |
| ----------------- | --------------------------------------------------------------- | ----------------- |
| Rectangle, no fit | Box at `ratio`; child unstyled inside the full-size slot.       | Ratio.            |
| Ellipse, cover    | Elliptical clip; media fills and crops.                         | Ratio.            |
| Contain           | Media fills and letterboxes.                                    | —                 |
| Center            | Child at natural size, centered.                                | —                 |
| Caller override   | A caller `aspect-ratio` rule or inline style wins over `ratio`. | Breakpoint.       |

### Transformation and precedence order

- **ORD1 — Ratio.** Component class `aspect-ratio` → `xstyle` → unlayered caller
  CSS → inline `style`.
- **ORD2 — Child sizing.** `fit` rules in the base layer → later layers,
  unlayered CSS, and inline child styles.

### Performance and resources

- **PR1 — CSS only.** AspectRatio holds no state and measures nothing; layout
  is resolved by CSS.

## Accessibility contract

- **AR1 — No semantics added.** The Ratio box and Content slot add no role or
  name; the child's semantics pass through unchanged.

## Design relationships

| Anatomy or state | Design requirement                                      | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Ratio box        | Holds the ratio, clips overflow, and carries the shape. | Current source and docs  | Supporting     | FR1, FR2, FR5      |
| Content slot     | Fills the box and positions or sizes the child.         | Current source and docs  | Supporting     | FR3, FR4           |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Ratio box": {"target": "aspect-ratio"},
  "Content slot": {"inherits": "aspect-ratio"}
}
```

## Family and system relationships

- `architecture:public-component-api` owns ref, passthrough, and styling-input
  rules; FR1 and FR6 apply them to the Ratio box.
- `architecture:component-theming-surface` owns target qualification; FR5 keeps
  the structural `fit` axis off the target.

## Verification map

| Contract            | Verification                                                                                    | Representative states               | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Audit section                |
| ------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| FR1, FR2, FR6       | `AspectRatio.test.tsx` ratio, shape, ref, passthrough, and merge tests; stable visual baselines | Several ratios, ellipse, overrides  | An inline ratio, a lost inline `style` override, a lost `data-shape` reflection, a lost ref, or a dropped caller prop fails. The stable visual baselines `core-aspectratio--default` (16:9, `cover`) and `core-aspectratio--with-placeholder-skeleton` (probe theme) return a changed box for review. Gap: no unit test asserts the full width, clipping, zero minimum height, no-shrink rules, the ellipse's 50% radius, or that an `xstyle` `aspectRatio` wins over `ratio`; neither baseline overflows the box or loads the default story's remote image, so clipping and the `cover` fill have no visual check; and the baselines render neither the ellipse nor a flex host. | `audit:AspectRatio/layout`   |
| FR3–FR5             | `AspectRatio.test.tsx` fit suite                                                                | Cover, contain, center, unset       | A marker on unset `fit`, a changed child `className` or inline `objectFit`, a wrapper missing its fill, cover, contain, or center style, or `fit` on the target fails. Gap: the unit tests check which styles the wrapper carries, not their declarations (child size, `object-fit`, centering), and miss props added to the child or sizing merged under its own `style`; the slot's inline-start anchoring has no automated check; the browser cascade test covers `cover` and `contain` sizing and `object-fit`, not `center`.                                                                                                                                                 | `audit:AspectRatio/layout`   |
| FR4 (cascade)       | `AspectRatioFitLayers.a11y.browser.spec.ts`                                                     | Tailwind v3 and v4 layer setups     | A preflight rule beating the `fit` sizing fails in a real browser.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `audit:AspectRatio/layout`   |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                   | Consumer anatomy and current target | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `audit:AspectRatio/theming`  |
| AR1, PR1            | Source review                                                                                   | Every state                         | Gap: no automated check fails if AspectRatio adds semantics, state, or measurement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `audit:AspectRatio/behavior` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
