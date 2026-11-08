---
schema_version: 3
template_version: 7
kind: component
id: component:Card
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    .github/visual-baseline/manifest.json,
    packages/core/src/Card/Card.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    packages/core/src/theme/extensibleAxes.test.ts,
    apps/storybook/stories/Card.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
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

# Card component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A container with sizing props, `padding` on the spacing scale, a theme-extensible `variant`, and a resting `elevation`.                                                                                  |
| Behavior                | Card paints a rounded surface, publishes its padding to descendants through the container-padding protocol, and only the `default` variant draws a border.                                               |
| End-user impact         | Readers see grouped content on a consistent surface; with the default border and theme border width, content insets stay on the spacing scale whether or not a border is drawn, except at zero padding.  |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                                             |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. One implementation gap is listed under Current-state impact.                                                                  |
| Review checks           | Reject a card that holds its track at min-content width, a variant that falls through to another variant, a lost padding publication, or a published inset that drifts further from the applied padding. |
| Governing rules         | `architecture:container-padding` (container publisher); `architecture:component-theming-surface/INV6,INV14`; `architecture:public-component-api/INV5,INV6,INV8`.                                         |

This table is a review projection; the body below is authoritative.

## Intent

Card groups related content on a contained surface. It owns the surface's
paint, border, radius, and elevation, its sizing, and the padding it publishes
so Layout and other descendants align to it.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Published inset exceeds applied padding (FR3).** At nonzero padding a
  `default` card applies padding reduced by its border width but publishes
  border plus padding (at `padding={0}` the two match). Every child that bleeds
  to the published inset, on any edge — a full-bleed Divider, a Layout, or a
  List `outset` or `bleed` box — overshoots the padding edge by the border
  width. A fixed-height card holding such a child scrolls by that amount on
  each axis the child bleeds on (both for a Layout) and becomes an unnamed tab
  stop even when its content fits: in Chromium when it holds nothing
  focusable, in Firefox even when it holds a focusable child. `architecture:container-padding` INV11
  has a host publish its applied padding, and `component:List` FR8 counts a
  Card's content area as such a host, so a `default` card at nonzero padding
  does not yet meet List FR8: List `outset` and `bleed` lists cross its padding edge by the border width, and `bleed` rows with them.

## Ownership boundary

**Owns**

- The Container: surface paint, border, radius, elevation, sizing, and
  clipping.
- Resolving and publishing card padding as a container publisher.

**Does not own / non-goals**

- Content structure inside the card — owned by the caller and Layout.
- Interaction — owned by `component:ClickableCard` and
  `component:SelectableCard`, which compose Card.
- The padding protocol itself — owned by `architecture:container-padding`.

## Public concepts

| Concept   | Closed values or states                                                                                                                  | Meaning                                                 | Availability by variant/orientation/state | Default            | Owner            | Stability | Invalid-value behavior                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------- | ------------------ | ---------------- | --------- | --------------------------------------------------------------------------------------------------- |
| Variant   | `default`, `transparent`, `muted`, `blue`, `cyan`, `gray`, `green`, `orange`, `pink`, `purple`, `red`, `teal`, `yellow`; theme additions | Surface paint; only `default` draws a border.           | Always                                    | `default`          | `component:Card` | Stable    | A theme-added value is reflected on `card` and renders the base surface with no fill and no border. |
| Elevation | `none`, `low`, `med`, `high`                                                                                                             | Resting shadow from the shadow token scale.             | Always                                    | `none`             | `component:Card` | Stable    | TypeScript rejects other values.                                                                    |
| Padding   | Spacing steps 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10; omitted                                                                              | Uniform padding; omitted uses the theme's card padding. | Always                                    | theme card padding | `component:Card` | Stable    | TypeScript rejects other values.                                                                    |
| Sizing    | `width`, `height`, `maxWidth`, `minHeight`: numbers in pixels or CSS strings                                                             | The card's box size.                                    | Always                                    | unset              | `component:Card` | Stable    | Strings pass through as CSS.                                                                        |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | Card renders one `div` carrying the `card` target, which reflects `variant` and `elevation`, with `--radius-container` corners and a box shadow composed of the selection ring and the elevation shadow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source and tests |
| FR2 | `default` paints `--color-background-card` with a `--border-width` solid `--color-border` border; `transparent` paints nothing; `muted` paints `--color-background-muted`; each palette variant paints its `--color-background-<name>` tint. A theme-added variant falls through to the base surface, never to another variant.                                                                                                                                                                                                                                                                                                                                                                                                                                            | Current source and tests |
| FR3 | Card resolves padding as a container publisher: an omitted `padding` uses the theme's card padding (spacing step 4 with no theme), and a step applies uniformly to every edge. With the `default` border, each edge's padding is reduced by the global `--border-width` token (stopping at zero), so border plus padding matches the borderless inset. The published inset matches the padding the card applies (`architecture:container-padding` INV11). Implementation gap: at nonzero padding a `default` card publishes border plus padding, one border width more than its applied padding, so a full-bleed child overshoots the padding edge, a fixed-height card scrolls by that width, and the card does not yet meet `component:List` FR8 (Current-state impact). | Current source and tests |
| FR4 | Card has zero minimum width, so it yields to its track instead of holding it at its min-content width, and clips overflow without becoming a scroll container. A `height` other than `auto` makes it scroll. `width`, `height`, `maxWidth`, and `minHeight` apply as given, and a caller minimum can win over `width`.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests |
| FR5 | `elevation` sets the elevation shadow to none or the low, medium, or high shadow token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Current source and tests |
| FR6 | `ref` reaches the `div`. Supported DOM, ARIA, data, and event props reach the element carrying the target; `xstyle`, `className`, and `style` merge in that order after component styles, and a caller `className` joins the target class rather than replacing it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source and tests |

### Allowed variation

- **AV1 — Theme paint and padding.** A theme may restyle `card` per `variant`
  and `elevation`, including border width and color, and set the card padding.
- **AV2 — Content.** Any content may fill the card.

### Representative states

| State               | Required invariant                                                                                 | Allowed variation |
| ------------------- | -------------------------------------------------------------------------------------------------- | ----------------- |
| Default             | Card surface with border; inset equals the theme card padding.                                     | Content.          |
| Borderless variant  | No border; same inset as `default` except at `padding={0}`, where `default` adds its border width. | Variant.          |
| Theme-added variant | Base surface; `data-variant` names the added value.                                                | Theme paint.      |
| Fixed height        | Scrolls its content; still yields in its track.                                                    | Height.           |
| Elevated            | Elevation shadow alongside any ring.                                                               | Elevation.        |

### Transformation and precedence order

- **ORD1 — Padding.** `padding` step → theme card padding → spacing step 4;
  then subtract the border width per edge for `default`, stopping at zero.
- **ORD2 — Shadow.** Ring and elevation compose in one shadow list; neither
  replaces the other.

### Performance and resources

- **PR1 — Static render.** Card holds no state and uses no hooks.

## Accessibility contract

- **AR1 — No semantics added.** Card adds no role, name, or tab stop of its own;
  its content's semantics pass through. Exception: a fixed-height card whose
  content overflows is a scroll container (FR4), and browsers may make it an
  unnamed tab stop so keyboard users can scroll it (Chromium when it holds
  nothing focusable; Firefox even when it holds a focusable child).

## Design relationships

| Anatomy or state | Design requirement                                           | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------ | ------------------------ | -------------- | ------------------ |
| Container        | A rounded surface with background, optional border, padding. | Current source and docs  | Supporting     | FR1–FR5            |
| Content          | Caller content inside the published inset.                   | Current source and docs  | Prominent      | FR3, AR1           |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Container": {"target": "card"},
  "Content": {
    "none": {
      "reason": "intentional: caller content keeps its own styling and has no component-owned paint target"
    }
  }
}
```

## Family and system relationships

- `architecture:container-padding` names Card a container publisher; FR3 records
  how Card resolves and publishes its padding.
- `component:ClickableCard` and `component:SelectableCard` compose Card; a
  selection ring composes with Card's elevation shadow (ORD2).
- `architecture:component-theming-surface` sets the rules the `card` target
  follows (INV6) and qualifies `variant` as a theme-extensible axis (INV14).

## Verification map

| Contract            | Verification                                                                                                                                                                            | Representative states                                         | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                  | Audit section         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| FR1, FR2, FR5, ORD2 | `Card.test.tsx` reflection, built-in variant, elevation, and theme-added variant tests; stable visual baselines `core-card--default` and `core-card--theme-added-variant` (probe theme) | Every built-in variant; elevations; added value; default card | A lost reflection, an elevation without its own class, or a theme-added value falling through to another variant fails; a changed default surface, border, radius, or rest shadow, or a theme-added card that loses its theme paint, comes back changed for review. Gap: the palette tints, the elevation shadow values, and the ring-and-shadow composition have no automated check beyond those two baselines. | `audit:Card/theming`  |
| FR3                 | `Card.stories.tsx` in a browser                                                                                                                                                         | Default and borderless variants; padding steps                | Gap: no unit test asserts padding publication or the border subtraction; an inset mismatch is visible only in the rendered fixture. The full-bleed overshoot in a default card has no automated check.                                                                                                                                                                                                           | `audit:Card/layout`   |
| FR4                 | `Card.test.tsx` sizing suite                                                                                                                                                            | Every variant; fixed height; caller minimum                   | A held min-content width, a scroll container without fixed height, or a lost caller minimum fails.                                                                                                                                                                                                                                                                                                               | `audit:Card/layout`   |
| FR6                 | `Card.test.tsx` ref, passthrough, and className tests                                                                                                                                   | Ref; extra props; className                                   | A ref on another element, a prop on an element other than the target, or a replaced target class fails. Gap: no test asserts the `xstyle`, `className`, `style` merge order.                                                                                                                                                                                                                                     | `audit:Card/behavior` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                           | Consumer anatomy and current target                           | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                                                                                                                                    | `audit:Card/theming`  |
| AR1, PR1            | Source review                                                                                                                                                                           | Every variant                                                 | Gap: no automated check fails if Card adds a role, tab stop, state, or hook. No test covers the fixed-height overflow tab stop, with or without focusable content. No test covers the tab stop a fixed-height default card gains from a bleeding child's overshoot.                                                                                                                                              | `audit:Card/behavior` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
