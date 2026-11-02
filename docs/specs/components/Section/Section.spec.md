---
schema_version: 3
template_version: 7
kind: component
id: component:Section
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
owners: [cixzhang]
review_triggers: [public-api, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Layout/overlayPaddingReset.test.tsx,
    .github/visual-baseline/manifest.json,
    packages/core/src/serverSafeComponents.test.ts,
    packages/core/src/Section/Section.test.tsx,
    apps/storybook/stories/Section.stories.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:layout-regions]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:container-padding,
    architecture:public-component-api,
  ]
contributing: []
system_specs: []
---

# Section component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A generic page region with `variant`, selected `dividers`, `padding` with axis and edge overrides, and box sizing.                                          |
| Behavior                | An outer wrapper takes sizing and caller inputs and escapes a parent's inset; an inner container paints the variant and dividers and publishes its padding. |
| End-user impact         | Readers see related content grouped in a region whose edges and spacing line up with the surrounding layout.                                                |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. One implementation gap is listed under Current-state impact.                     |
| Review checks           | Reject physical left/right dividers or padding, edge padding that does not move its matching container variable, or a nested Section that loses its escape. |
| Governing rules         | `family:layout-regions/FR2,FR4,FR5,FR7–FR9`; `architecture:container-padding`; `architecture:public-component-api/INV5,INV6,INV8`.                          |

This table is a review projection; the body below is authoritative.

## Intent

Section is the generic painted region of the layout-regions family. It owns
its variant, selected divider edges, component padding, and how a nested
Section escapes its parent's inset.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  styling, or target changes
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Painted region shorter than its minimum height (FR1).** With `minHeight`
  and no `height`, the wrapper reaches the minimum but the inner container,
  which carries the background, dividers, and padding, stays at its content
  height. A `muted` or `section` region then paints only its top part, and
  its bottom divider sits above the wrapper's bottom edge.

## Ownership boundary

**Owns**

- The outer wrapper and the inner painted container with its `section` target.
- Variant paint, selected divider edges, component padding and its publication,
  and the nested escape.

**Does not own / non-goals**

- Caller content inside the section.
- Slot arrangement — owned by `component:Layout` and its regions.
- Landmark semantics, scrolling, and responsive substitution — not provided by
  Section (`family:layout-regions` FR7–FR9).

## Public concepts

| Concept  | Closed values or states                              | Meaning                                  | Availability by variant/orientation/state | Default          | Owner               | Stability | Invalid-value behavior                                                                                  |
| -------- | ---------------------------------------------------- | ---------------------------------------- | ----------------------------------------- | ---------------- | ------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| Variant  | `section`, `transparent`, `muted`; theme additions   | Region background.                       | Always                                    | `section`        | `component:Section` | Stable    | A theme-added value with no matching theme rule renders no Section background and keeps `data-variant`. |
| Dividers | any of `top`, `bottom`, `start`, `end`               | Which edges draw a 1px border.           | Always                                    | none             | `component:Section` | Stable    | TypeScript rejects other values.                                                                        |
| Padding  | Spacing steps uniform, per axis, or per logical edge | Inner padding, published to descendants. | Always                                    | resolved per FR3 | `component:Section` | Stable    | TypeScript rejects other values.                                                                        |
| Sizing   | `width`, `height`, `maxWidth`, `minHeight`           | The wrapper's box size.                  | Always                                    | unset            | `component:Section` | Stable    | Strings pass through as CSS.                                                                            |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| FR1 | Section renders an outer `div` wrapper holding an inner `div` that carries the `section` target, reflects `variant`, and holds the children. The inner container fills the wrapper's height. Implementation gap: it fills only a set `height`; under `minHeight` alone the painted container stays at its content height inside a taller wrapper (Current-state impact).                                                                                                                                                                                                                                                                          | Current source and tests                 |
| FR2 | `section` paints `--color-background-surface`, `transparent` paints nothing, and `muted` paints `--color-background-muted`; a theme-added variant with no matching theme rule paints no background and still reflects `data-variant` (`architecture:component-theming-surface` INV14). Each selected divider draws a 1px solid `--color-border` border on that edge; `start` and `end` are logical inline edges.                                                                                                                                                                                                                                  | Current source and tests                 |
| FR3 | An omitted `padding` resolves per edge from the theme's per-edge and per-axis section padding, then the nearest ancestor Section's explicit `padding`, then the theme's single section padding, then spacing step 4. A step sets uniform padding and publishes it as the container-padding variables for descendants, and nested Sections without `padding` inherit it, except across an overlay boundary, where the inherited value stops (`architecture:container-padding` INV5). `paddingInline` and `paddingBlock` override one axis, and an edge prop overrides its edge alone; each override moves the matching container-padding variable. | Current source, tests, and family record |
| FR4 | The wrapper escapes its parent's published container padding: always on both inline edges, and on the block-start edge only as a first child and the block-end edge only as a last child. The inner container resets the inherited padding variables before publishing its own.                                                                                                                                                                                                                                                                                                                                                                   | Current source and family record         |
| FR5 | `ref`, `className`, `style`, `xstyle`, sizing, and DOM, data, ARIA, and event props reach the outer wrapper; numbers in sizing props are pixels. The inner painted container takes none of them; Toolbar relies on the wrapper routing.                                                                                                                                                                                                                                                                                                                                                                                                           | Current source and tests                 |

### Allowed variation

- **AV1 — Theme paint.** A theme may restyle `section` per `variant` and set
  the section padding.
- **AV2 — Content.** Any caller content fills the region.

### Representative states

| State         | Required invariant                                                          | Allowed variation |
| ------------- | --------------------------------------------------------------------------- | ----------------- |
| Default       | Surface paint; theme section padding; no dividers.                          | Content.          |
| Divided       | 1px borders on selected logical edges.                                      | Edges.            |
| Edge override | Only the named edge changes, with its container variable.                   | Step.             |
| Nested        | Inner Section escapes the outer inset inline and at first/last block edges. | Variant.          |

### Transformation and precedence order

- **ORD1 — Padding per edge.** Edge prop → axis prop → `padding` → theme
  per-edge and per-axis section padding → nearest ancestor Section's explicit
  `padding`, not across an overlay boundary → theme single section padding → spacing step 4.

### Performance and resources

- **PR1 — Static render.** Section holds no state and uses no hooks.

## Accessibility contract

- **AR1 — No semantics added.** Section adds no role, name, landmark, or tab
  stop (`family:layout-regions` FR8); callers supply a role and label when the
  context needs one.

## Design relationships

| Anatomy or state  | Design requirement                                     | Representation authority | Hierarchy role    | Component contract |
| ----------------- | ------------------------------------------------------ | ------------------------ | ----------------- | ------------------ |
| Section container | The painted region with optional dividers and padding. | Current source and docs  | Supporting        | FR1–FR4            |
| Consumer content  | Caller content inside the region.                      | Caller-supplied content  | Context-dependent | AR1                |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Section container": {"target": "section"},
  "Consumer content": {
    "none": {
      "reason": "intentional: caller content keeps its own theming ownership; Section applies no content target."
    }
  }
}
```

The outer wrapper is implementation structure and carries no target.

## Family and system relationships

- `family:layout-regions` names Section the generic region and a container
  publisher; FR2–FR4 apply its logical direction, padding, and boundary rules.
- `architecture:container-padding` owns the inset protocol Section publishes
  and escapes.
- `architecture:public-component-api` owns caller-input routing; FR5 names
  the outer wrapper as the element that receives caller inputs and `ref`
  under INV5 and INV8.

## Verification map

| Contract            | Verification                                                                                                                                     | Representative states               | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Audit section           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| FR1, FR2            | `Section.test.tsx` structure and variant tests; stable visual baseline `core-section--default`                                                   | Variants; default section           | A lost two-div structure, a lost `section` target on the inner `div`, or a lost variant reflection fails; a changed default surface comes back changed for review. Gap: the divider test asserts only that content renders, so divider borders and the `transparent` and `muted` paint have no automated check, and no check asserts the inner container fills the wrapper's height, including the `minHeight` gap. A theme-added variant with no matching rule also has no focused test. | `audit:Section/anatomy` |
| FR3, ORD1           | `Section.test.tsx` padding, propagation, and edge-override tests; `overlayPaddingReset.test.tsx`; `Section.stories.tsx` NestedPaddingInheritance | Uniform, axis, edge, nested         | Axis-as-two-edges drift, edge over axis on the end edges, a lost propagated value for nested Sections, an ancestor Section's padding that crosses an overlay boundary, or a container variable (inline or block) that does not move with an edge override fails. Gap: edge over axis on the start edges, axis over uniform, the theme per-edge and per-axis padding ahead of the inherited value, and a variable that stops moving on both the axis and edge paths have no check.         | `audit:Section/layout`  |
| FR4                 | `Section.stories.tsx` nested fixtures in a browser                                                                                               | Nested sections                     | Gap: no unit test asserts the escape margins; a lost escape is visible in the rendered fixture.                                                                                                                                                                                                                                                                                                                                                                                           | `audit:Section/layout`  |
| FR5                 | `Section.test.tsx` ref, className, style, and passthrough tests                                                                                  | Caller inputs                       | A `className` or `style` that misses the outer wrapper, or a dropped `data-testid`, fails. Gap: the ref test accepts either `div`, the passthrough test finds `data-testid` anywhere in the tree so the routing of DOM, data, ARIA, and event props has no check, and the sizing and `xstyle` tests assert only that content renders.                                                                                                                                                     | `audit:Section/api`     |
| AR1, PR1            | `serverSafeComponents.test.ts`; source review                                                                                                    | Every state                         | A client API (state, a hook) added without a client directive fails `serverSafeComponents.test.ts`. Gap: a client API added together with a client directive passes, and no automated check fails if Section adds a role, name, landmark, or tab stop.                                                                                                                                                                                                                                    | `audit:Section/a11y`    |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                    | Consumer anatomy and current target | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                                                                                                                                                                                                             | `audit:Section/theming` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
