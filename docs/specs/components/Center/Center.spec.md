---
schema_version: 3
template_version: 7
kind: component
id: component:Center
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
    .github/visual-baseline/manifest.json,
    packages/core/src/Center/Center.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/rtl-audit/targets.json,
    apps/storybook/stories/Center.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:layout-primitives]
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:container-padding,
  ]
contributing: []
system_specs: [spec:AST-002]
---

# Center component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A flex container that centers its children on `axis` (`both`, `horizontal`, `vertical`), with `isInline`, box sizing, and per-edge logical `padding`.            |
| Behavior                | `both` centers on both axes; the single-axis values are physical-axis names that the source maps to flex main and cross axes; padding resolves per logical edge. |
| End-user impact         | Readers see content centered in its box, with padding that follows the writing direction.                                                                        |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                     |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. One implementation gap is listed under Current-state impact.                          |
| Review checks           | Reject physical left/right padding, padding that publishes container inset, a caller `data-axis` that replaces the reflected axis, or added semantics.           |
| Governing rules         | `family:layout-primitives/FR1–FR5,FR7,FR8`; `architecture:container-padding/INV8`; `architecture:public-component-api/INV5,INV6,INV8`.                           |

This table is a review projection; the body below is authoritative.

## Intent

Center places caller content at the horizontal center, vertical center, or both
within its own box. It owns the centering axis, its display mode, box sizing,
and local padding.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public type, default,
  supported value, DOM element, or theme target changes
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Single-axis values in vertical writing (FR2).** `family:layout-primitives`
  lists `horizontal` and `vertical` as physical-axis alignment aliases. Center
  maps `horizontal` to flex main-axis centering and `vertical` to cross-axis
  centering, which matches the physical axes in horizontal writing but swaps
  them in vertical writing modes.

## Ownership boundary

**Owns**

- The `div` container, its flex or inline-flex display, and its `center` target
  with the reflected `axis`.
- Centering on the selected axis or axes.
- Box sizing and logical padding precedence.

**Does not own / non-goals**

- The semantics, paint, interaction, size, or order of caller content.
- Page and region layout — owned by Layout and the product callsite.
- Gap between children, breakpoints, and overflow.
- Container inset publication and descendant bleed — Center padding is local
  under `architecture:container-padding`.

## Public concepts

| Concept  | Closed values or states                                                      | Meaning                                | Availability by variant/orientation/state | Default | Owner                      | Stability | Invalid-value behavior           |
| -------- | ---------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------- | ------- | -------------------------- | --------- | -------------------------------- |
| Axis     | `both`, `horizontal`, `vertical`                                             | Which axis or axes are centered (FR2). | Always                                    | `both`  | `component:Center`         | Stable    | TypeScript rejects other values. |
| Display  | flex; inline-flex                                                            | Block-level or inline-level container. | Every axis                                | flex    | `component:Center`         | Stable    | —                                |
| Box size | `width`, `height`, `maxWidth`, `minHeight`: numbers in pixels or CSS strings | Center's own box size.                 | Always                                    | unset   | `family:layout-primitives` | Stable    | Strings pass through as CSS.     |
| Padding  | Spacing steps per edge, per axis, or uniform                                 | Local inner padding.                   | Always                                    | unset   | `family:layout-primitives` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                      | Basis                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| FR1 | Center renders one `div`, `display: flex` by default and `inline-flex` with `isInline`, holding its children in caller order.                                                                                                                                                                                                                                                                                                                  | Current source and tests                 |
| FR2 | `both` centers on both axes. `horizontal` and `vertical` center the physical horizontal and vertical axes in every writing mode (`family:layout-primitives` physical-axis aliases). Center sets main- and cross-axis centering for `both`, main-axis only for `horizontal`, and cross-axis only for `vertical`. Implementation gap: in vertical writing modes the single-axis values center the opposite physical axis (Current-state impact). | Current source, tests, and family record |
| FR3 | `width`, `height`, `maxWidth`, and `minHeight` apply numbers as pixels and strings as given.                                                                                                                                                                                                                                                                                                                                                   | Current source and tests                 |
| FR4 | Padding resolves per logical edge: the edge prop, then its axis prop (`paddingInline` or `paddingBlock`), then `padding`; zero is an explicit step. Inline edges follow the writing direction.                                                                                                                                                                                                                                                 | Current source, tests, and family record |
| FR5 | Center padding publishes no container-padding variables.                                                                                                                                                                                                                                                                                                                                                                                       | Current source and family record         |
| FR6 | The root carries the `center` target and reflects `axis`; a caller `data-axis` does not replace it. `ref` reaches the `div`; supported DOM, ARIA, data, and event props reach it before the component's target and styles; `xstyle`, `className`, and `style` merge in that order.                                                                                                                                                             | Current source and tests                 |
| FR7 | Center adds no breakpoint, overflow behavior, gap, or structural region. It renders on the server without a client boundary.                                                                                                                                                                                                                                                                                                                   | Current source and tests                 |

### Allowed variation

- **AV1 — Caller content.** Any content may appear inside Center and keeps its
  own semantics and theming.
- **AV2 — Available space.** Parent layout and size inputs change the box
  without changing the axis contract.

### Representative states

| State                      | Required invariant                                                                             | Allowed variation |
| -------------------------- | ---------------------------------------------------------------------------------------------- | ----------------- |
| Both axes                  | Main- and cross-axis centering.                                                                | Box size.         |
| Horizontal only            | The physical horizontal axis is centered; no physical vertical centering is added.             | Height.           |
| Vertical only              | The physical vertical axis is centered; no physical horizontal centering is added.             | Width.            |
| Vertical writing           | Single-axis values still name physical axes (today they center the opposite one, the FR2 gap). | —                 |
| Inline                     | `inline-flex` with the selected axis.                                                          | —                 |
| Asymmetric logical padding | Start and end keep their meaning; physical edges swap with direction.                          | —                 |

### Transformation and precedence order

- **ORD1 — Padding per edge.** Edge prop → axis prop → `padding`.
- **ORD2 — Root attributes.** Caller props → component target, reflected axis,
  and styles → `xstyle` → `className` → `style`.

### Performance and resources

- **PR1 — Static render.** Center holds no state and uses no hooks.

## Accessibility contract

- **AR1 — Passive container.** Center adds no role, name, state, focus
  behavior, or live region of its own; caller ARIA and role props reach the
  root.
- **AR2 — Reading order.** Children render in caller order and are not visually
  reordered.

## Design relationships

| Anatomy or state | Design requirement                                                | Representation authority                             | Hierarchy role    | Component contract |
| ---------------- | ----------------------------------------------------------------- | ---------------------------------------------------- | ----------------- | ------------------ |
| Container        | One- or two-axis centering with optional local inset, no surface. | Current source, docs, and `family:layout-primitives` | Supporting layout | FR1–FR7            |
| Content          | Caller content inside the container.                              | Caller-owned content                                 | Context-dependent | AV1, AR1, AR2      |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Container": {"target": "center"},
  "Content": {
    "none": {
      "reason": "intentional: Caller-supplied content retains its own theming ownership; Center applies no content target."
    }
  }
}
```

## Family and system relationships

- `family:layout-primitives` owns the shared size and padding vocabulary,
  padding precedence, and the physical-axis meaning of `horizontal` and
  `vertical`; FR2 records Center's gap against it.
- `architecture:container-padding` records Center padding as local (FR5).
- `architecture:public-component-api` owns passthrough, styling composition, ref
  reachability, and the owned-attribute boundary (FR6).
- `spec:AST-002` owns admission of any change to this public surface.

## Verification map

| Contract            | Verification                                                                                                                                      | Representative states                                  | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                         | Audit section           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| FR1, FR2            | `Center.test.tsx` axis and inline tests; stable visual baselines `core-center--default` (neutral and probe themes)                                | Both, horizontal, vertical; inline; default            | A wrong computed display, `align-items`, or `justify-content` fails; a changed default centering comes back changed for review. Gap: no automated check runs a vertical writing mode or asserts child order.                                                                                                                                                                                            | `audit:Center/behavior` |
| FR3                 | `Center.test.tsx` sizing tests                                                                                                                    | Width, height, both                                    | Gap: the sizing tests assert only that the element renders, so the pixel conversion and string pass-through have no automated check.                                                                                                                                                                                                                                                                    | `audit:Center/layout`   |
| FR4                 | `Center.test.tsx` padding-precedence suite; `@astryx/no-physical-properties` lint rule; RTL audit dimension D8 on `core-center--padding-per-edge` | Uniform, axis, edge, zero, all four edges; LTR and RTL | Edge over axis on the end edges, and edge over uniform on inline-start, inline-end, and block-start, fails; a physical left/right padding property fails lint; the RTL audit fails unless logical start and end padding swap physical sides. Gap: edge over axis on the start edges, edge over uniform on block-end, and axis over uniform have no check, and CI keeps RTL audit findings non-blocking. | `audit:Center/layout`   |
| FR5, FR7            | `serverSafeComponents.test.ts`; `Center.test.tsx` server-render test; source review                                                               | Padded container                                       | A client boundary fails `serverSafeComponents.test.ts`; a server-render error fails the Center test. Gap: a hook added together with a client directive passes every check; publishing container-padding variables, or adding a breakpoint, overflow rule, gap, or region, has no automated check.                                                                                                      | `audit:Center/layout`   |
| FR6                 | `Center.test.tsx` ref, passthrough, xstyle, and owned-attribute tests; `themingTargets.test.ts`                                                   | Every axis; colliding `data-axis`                      | A lost target or a caller `data-axis` winning fails. Gap: the ref test accepts any `div`, so a ref on a wrapper passes, and the styling-input merge order has no check.                                                                                                                                                                                                                                 | `audit:Center/theming`  |
| AR1, AR2, PR1       | `serverSafeComponents.test.ts`; source review                                                                                                     | Multiple children                                      | A hook added without a client directive fails `serverSafeComponents.test.ts`. Gap: a hook added together with a client directive passes, and no automated check fails if Center adds semantics or reorders children.                                                                                                                                                                                    | `audit:Center/a11y`     |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                     | Consumer anatomy and current target                    | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                                                                                                                           | `audit:Center/theming`  |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
