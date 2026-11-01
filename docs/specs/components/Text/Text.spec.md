---
schema_version: 3
template_version: 7
kind: component
id: component:Text
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    .github/visual-baseline/manifest.json,
    packages/core/src/Text/Text.test.tsx,
    packages/core/src/Text/useTruncation.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/Text.stories.tsx,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-009]
---

# Text component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | A polymorphic text element with a semantic `type`, optional `size`, `color`, and `weight` overrides, an `as` element choice, and the text layout controls documented in `Text.doc.mjs`.    |
| Behavior                | `type` sets size, weight, and default color from the theme; theme-added types and colors fall back to the body and primary baselines; truncated text offers its full content in a Tooltip. |
| End-user impact         | Readers get consistent type across the product; clamped text keeps its full content available on hover and in the DOM.                                                                     |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                               |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. One implementation gap is listed under Current-state impact.                                                    |
| Review checks           | Reject a theme-added type or color that renders unstyled, a native `title` beside the truncation Tooltip, or measurement when the tooltip is off.                                          |
| Governing rules         | `architecture:component-theming-surface/INV6,INV14`; `architecture:public-component-api/INV5,INV6,INV8`.                                                                                   |

This table is a review projection; the body below is authoritative.

## Intent

Text renders themed body copy, labels, captions, and display text. It owns the
mapping from a semantic type to theme typography, the element it renders, and
the truncation behavior of that element. Heading is documented beside Text in
`Text.doc.mjs` but is a separate component with its own record.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Truncation tooltip not reachable by keyboard (FR4).** A truncated Text
  is not focusable, so Tooltip attaches no focus trigger and sighted keyboard
  users cannot reveal the clipped text, where WCAG 2.2 2.1.1 expects
  functionality to be keyboard operable. The full text stays in the DOM for
  assistive technology.

## Ownership boundary

**Owns**

- The polymorphic text element and its `text` theming target.
- Type-based size, weight, and default color; size, color, and weight
  overrides; and the text layout controls on that element.
- Measuring truncation and deciding when to compose the truncation Tooltip.

**Does not own / non-goals**

- Heading, its `h1`–`h6` element, and its `heading` target — owned by
  `component:Heading`. The `heading` target and Heading anatomy listed in
  `Text.doc.mjs` belong to that record.
- The truncation tooltip surface, layer, and `tooltip` target — owned by
  Tooltip.
- Typography token values — owned by the active theme.
- Text content — owned by the caller.

## Public concepts

| Concept    | Closed values or states                                                                                           | Meaning                                               | Availability by variant/orientation/state | Default                                                               | Owner            | Stability | Invalid-value behavior                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- | ---------------- | --------- | --------------------------------------------------------------------------------- |
| Type       | `body`, `large`, `label`, `supporting`, `code`, `display-1`, `display-2`, `display-3`, `inherit`; theme additions | Selects size, weight, line height, and default color. | Always                                    | `body`                                                                | `component:Text` | Stable    | A theme-added type is reflected on `text` and renders with body baseline styles.  |
| Color      | built-in text colors; theme additions                                                                             | Text color.                                           | Always                                    | `secondary` for `supporting`, `inherit` for `inherit`, else `primary` | `component:Text` | Stable    | A theme-added color is reflected on `text` and renders with the primary baseline. |
| Element    | `span`, `p`, `div`, `label`, `h1`, `h2`, `h3`                                                                     | The rendered element.                                 | Always                                    | `span`                                                                | `component:Text` | Stable    | TypeScript rejects other values.                                                  |
| Truncation | `maxLines` 0 (none), 1, or more; tooltip on, off, or at a placement                                               | Clamps lines and offers the full text in a Tooltip.   | Always                                    | 0; tooltip on                                                         | `component:Text` | Stable    | —                                                                                 |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Basis                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| FR1 | Text renders one element chosen by `as` (default `span`) carrying the `text` target, which reflects `type`, `size`, and the resolved `color`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current source and tests |
| FR2 | A built-in `type` applies its size, line height, and default weight; a theme-added type applies the body baseline. `size` overrides the type's size while keeping its other properties; `weight` overrides the type's default weight. The resolved color is `color`, else the type's default; a theme-added color applies the primary baseline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Current source and tests |
| FR3 | `hasCapsize` renders `block` and trims to cap height; otherwise `maxLines` above 1 renders the line-clamp box, `maxLines={1}` renders `block`, and otherwise `display` (default `inline`) applies. `justify` uses logical values; `start`, the default, sets no alignment, so the element follows its container's. `textWrap`, `hasStrikethrough`, and `hasTabularNumbers` apply their text treatments.                                                                                                                                                                                                                                                                                                                                                                                                            | Current source and tests |
| FR4 | `maxLines={1}` clips one line with an ellipsis; a larger value clamps to that many lines unless `hasCapsize` is set, whose `block` display removes the clamp. With truncation, `wordBreak` defaults to `break-all` for one line and `break-word` otherwise. When the text is measured as truncated and `hasTruncateTooltip` is not `false`, a lazily loaded Tooltip anchored to the element shows the full text at the given placement (default `above`), and Text adds no native `title`. `hasTruncateTooltip={false}` takes no measurement. A truncation tooltip can be opened from the keyboard (WCAG 2.2 2.1.1). Implementation gap: the tooltip opens on hover and touch only, because the element is not focusable (Current-state impact). Truncation re-measures when the content changes without a resize. | Current source and tests |
| FR5 | `ref` reaches the element. Supported DOM, ARIA, data, and event props reach it; `xstyle`, `className`, and `style` merge in that order after component styles, with the line clamp applied after `style`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source and tests |

### Allowed variation

- **AV1 — Theme paint.** A theme may restyle `text` per `type`, `size`, and
  `color`, and define added types and colors, without changing the element.
- **AV2 — Element.** Callers choose any supported `as` element.

### Representative states

| State                   | Required invariant                                      | Allowed variation |
| ----------------------- | ------------------------------------------------------- | ----------------- |
| Default                 | `span` with body type and primary color.                | Content.          |
| Supporting              | Supporting type with secondary color.                   | Color override.   |
| Theme-added type        | Body baseline; `data-type` names the added type.        | Theme paint.      |
| Truncated with tooltip  | Clamped element anchors one Tooltip; no native `title`. | Placement.        |
| Truncation, tooltip off | Clamped element; no measurement; no Tooltip.            | —                 |

### Transformation and precedence order

- **ORD1 — Color.** `color` → type default → `primary`; a theme-added value
  styles from the primary baseline.
- **ORD2 — Size and weight.** `size` and `weight` → type values → body baseline
  for a theme-added type.
- **ORD3 — Display.** `hasCapsize` (`block`) → `maxLines` above 1 (line-clamp
  box) → `maxLines={1}` (`block`) → `display` prop.

### Performance and resources

- **PR1 — Measured only when needed.** Truncation is measured only when
  `maxLines` is positive and the tooltip is enabled; re-measuring follows size
  and content changes without a per-element observer; the Tooltip module loads
  only when the text is truncated.

## Accessibility contract

- **AR1 — Caller-chosen semantics.** Text adds no role; its semantics are those
  of the `as` element. Heading semantics for section titles come from
  `component:Heading`.
- **AR2 — Truncated text.** The full text stays in the element's DOM; the
  truncation Tooltip is the only tooltip, and any description it adds is
  Tooltip's.

## Design relationships

| Anatomy or state   | Design requirement                           | Representation authority | Hierarchy role | Component contract |
| ------------------ | -------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Text               | Caller content in themed typography.         | Current source and docs  | Prominent      | FR1–FR3, AR1       |
| Heading            | A separate component documented beside Text. | `component:Heading`      | Prominent      | —                  |
| Truncation tooltip | The full text when the element is clamped.   | Tooltip                  | Supporting     | FR4, AR2           |

Theming: the element is the single `text` target. `Text.doc.mjs` also lists the
`heading` target and Heading anatomy, which `component:Heading` owns, so this
record declares no anatomy-theming block rather than assign `heading` to Text.

## Family and system relationships

- `component:Heading` shares Text's type styles and truncation mechanism and
  owns its own element, target, and accessibility.
- `architecture:component-theming-surface` sets the rules the `text` target
  follows (INV6) and the safe baseline for theme-added types and colors
  (INV14).
- `architecture:public-component-api` owns ref, passthrough, and styling-input
  rules; FR5 applies them.

## Verification map

| Contract      | Verification                                                                               | Representative states                                          | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Audit section         |
| ------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| FR1, AR1      | `Text.test.tsx` element, target, and reflection tests                                      | Default `span`; `p`, `div`, `label`                            | A wrong element, a lost `text` class, or a lost `data-type`, `data-size`, or `data-color` reflection fails. Gap: no test asserts that Text adds no role, and no accessibility-tree check proves the element's role (`spec:AST-009` FR3).                                                                                                                                                                                                                                                                                                                                                                                        | `audit:Text/behavior` |
| FR2           | `Text.test.tsx` theme-added type and color tests; stable visual baseline `core-text--body` | Theme-added type and color; built-in color; body default       | A theme-added type or color losing its reflection, a theme-added color losing its primary baseline, or a lost color override, fails; a changed body scale or color comes back changed for review. Gap: no test asserts a theme-added type's body baseline (the custom-type test checks only the class and `data-type`), and the built-in type tests assert presence only, so each type's size, line height, and weight, and the `size` and `weight` overrides in paint, have no automated check. Each type's default color and a built-in color's paint also have no automated check; the color tests assert `data-color` only. | `audit:Text/theming`  |
| FR3           | `Text.stories.tsx`                                                                         | Display, cap-height trim, wrap, strikethrough, tabular numbers | Gap: the prop tests assert presence only, so `display` precedence, `justify`, and every text treatment have no automated check.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `audit:Text/behavior` |
| FR4, AR2, PR1 | `Text.test.tsx` native-title and truncation-measurement tests; `useTruncation.test.tsx`    | Truncated with tooltip; tooltip off; content change            | A native `title`, measuring with the tooltip off, not measuring with it on, or a missed re-measure fails. Gap: the ellipsis and line clamp, the `wordBreak` defaults, and the tooltip's appearance and placement have no automated check.                                                                                                                                                                                                                                                                                                                                                                                       | `audit:Text/a11y`     |
| FR5           | `Text.test.tsx` ref and passthrough tests                                                  | Rerender; `data-testid`                                        | A detached ref or a lost test id fails. Gap: no test covers other DOM passthrough, the styling-input merge order, or the line clamp after `style`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `audit:Text/behavior` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
