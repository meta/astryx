---
schema_version: 3
template_version: 7
kind: component
id: component:Heading
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
    packages/core/src/Heading/Heading.test.tsx,
    packages/core/src/Text/useTruncation.test.tsx,
    packages/core/src/Text/__tests__/TextReflow.a11y.chromium.spec.ts,
    scripts/text-overflow-wrap-anywhere.test.mjs,
    packages/core/src/theme/themingTargets.test.ts,
    packages/core/src/theme/extensibleAxes.test.ts,
    apps/storybook/stories/Heading.stories.tsx,
    packages/core/src/Heading/__tests__/HeadingAudit.a11y.chromium.spec.ts,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-009, spec:AST-024]
---

# Heading component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A semantic heading with a required `level`, an optional theme-extensible visual `type`, `weight`, `accessibilityLevel`, and the shared text controls documented in `Heading.doc.mjs`.                                                                                                   |
| Behavior                | `level` picks `h1`–`h6` and the default visual scale; `type` and `weight` change only appearance; `accessibilityLevel` sets `aria-level` when it differs.                                                                                                                               |
| End-user impact         | Screen-reader users navigate a document outline that matches the page's sections, whatever size each heading is drawn at.                                                                                                                                                               |
| Builder impact          | A long unbroken token in non-truncated Heading wraps. Inside a flex row, the flex child needs `min-width: 0` for the wrap to apply, and a caller's own container that sets `overflow-wrap: anywhere` does not reach Heading's text; Core's `anywhere` containers pass their wrap to it. |
| Compatibility/readiness | Released behavior recorded as current, with one styling output change: non-truncated Heading sets `overflow-wrap` (`break-word`, or `anywhere` inside Core's `anywhere` containers). No API change. One implementation gap is listed under Current-state impact.                        |
| Review checks           | Reject a visual `type` or `weight` that changes the element or level, a heading that renders without a level baseline, or a duplicate native tooltip for truncation.                                                                                                                    |
| Governing rules         | `spec:AST-024` (custom visual types, weight precedence, unchanged accessibility); `architecture:component-theming-surface/INV6,INV14`; `architecture:public-component-api/INV5,INV6,INV8`.                                                                                              |

This table is a review projection; the body below is authoritative.

## Intent

Heading marks a section or page title with native heading semantics and themed
type. It keeps the document outline (`level`, `accessibilityLevel`) separate
from appearance (`type`, `weight`). Its consumer documentation lives in
`Text/Heading.doc.mjs`, as a member of the Text documentation; this record is
Heading's own contract.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: one styling output change, with no public prop,
  default, or DOM change: non-truncated Heading sets `overflow-wrap`
  (`break-word`, or `anywhere` inside Core's `anywhere` containers), so a long
  unbroken token wraps (FR3)
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Truncation tooltip not reachable by keyboard (FR4).** A truncated Heading
  is not focusable, so Tooltip attaches no focus trigger and sighted keyboard
  users cannot reveal the clipped text, where WCAG 2.2 2.1.1 expects
  functionality to be keyboard operable. The full text stays in the DOM for
  assistive technology.

## Ownership boundary

**Owns**

- The `h1`–`h6` element, its `heading` theming target, and `aria-level`.
- Level-based and built-in display-type sizing, weight defaults, color, and the
  shared text layout controls on the heading element.
- Measuring truncation and deciding when to compose the truncation Tooltip.

**Does not own / non-goals**

- Theme enrollment and generated declarations for custom visual types — owned
  by `spec:AST-024` and the theme build.
- Non-heading text — owned by `component:Text`.
- The truncation tooltip surface, layer, and `tooltip` target — owned by
  Tooltip.
- Heading content — owned by the caller.

## Public concepts

| Concept             | Closed values or states                                             | Meaning                                                       | Availability by variant/orientation/state | Default               | Owner               | Stability | Invalid-value behavior                                                                             |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- | --------------------- | ------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| Level               | 1–6                                                                 | Selects `h1`–`h6` and the level's visual scale.               | Always                                    | Required              | `component:Heading` | Stable    | TypeScript rejects other values.                                                                   |
| Visual type         | `display-1`, `display-2`, `display-3`; theme additions              | Replaces the level's visual scale without changing semantics. | Always                                    | unset                 | `component:Heading` | Stable    | A theme-added value is reflected on `heading` and keeps the level's baseline (`spec:AST-024` FR4). |
| Weight              | `normal`, `medium`, `semibold`, `bold`                              | Overrides the type or level default weight.                   | Always                                    | type or level default | `component:Heading` | Stable    | TypeScript rejects other values.                                                                   |
| Accessibility level | 1–6                                                                 | The outline level exposed to assistive technology.            | Always                                    | `level`               | `component:Heading` | Stable    | TypeScript rejects other values.                                                                   |
| Truncation          | `maxLines` 0 (none), 1, or more; tooltip on, off, or at a placement | Clamps lines and offers the full text in a Tooltip.           | Always                                    | 0; tooltip on         | `component:Heading` | Stable    | —                                                                                                  |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Basis                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | `level` renders `h1`–`h6`. `accessibilityLevel` adds `aria-level` only when it differs from `level`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests |
| FR2 | The heading carries the `heading` target reflecting `level`, `color`, and any supplied `type` and `weight`. A built-in `type` applies its display scale and default weight; otherwise the level's scale applies. A theme-added `type` keeps the level's scale as its baseline. An explicit `weight` wins over the type and level defaults.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Current source and tests |
| FR3 | `color` defaults to `primary`; a theme-added color keeps the primary baseline until a theme paints it. `hasCapsize` renders `block` and trims to cap height; otherwise `maxLines` above 1 renders the line-clamp box, `maxLines={1}` renders `block`, and otherwise `display` (default `block`) applies. `justify` uses logical values; `start`, the default, sets no alignment, so the element follows its container's. `textWrap` and `hasStrikethrough` apply their text treatments. Without truncation, a token longer than its line wraps, so in ordinary flow the text does not force horizontal scrolling at 320 CSS px (`spec:AST-020` FR1, WCAG 2.2 1.4.10 Reflow). The heading's `overflow-wrap` is `break-word`, which keeps min-content, so tables and auto-sized columns lay out ordinary words unchanged; inside a Core container that wraps its content with `anywhere` (CommandPaletteEmpty, Toast, FieldStatus, Banner), it is `anywhere`, as the container's own text is. A flex child needs `min-width: 0` from its container, and a caller's own container that sets `overflow-wrap: anywhere` does not reach the heading's text. | Current source and tests |
| FR4 | `maxLines={1}` clips one line with an ellipsis; a larger value clamps to that many lines unless `hasCapsize` is set, whose `block` display removes the clamp. With truncation, `wordBreak` defaults to `break-all` for one line and `break-word` otherwise. When the text is measured as truncated and `hasTruncateTooltip` is not `false`, a lazily loaded Tooltip anchored to the heading shows the full text at the given placement (default `above`); no native `title` is added. `hasTruncateTooltip={false}` takes no measurement. A truncation tooltip can be opened from the keyboard (WCAG 2.2 2.1.1). Implementation gap: the tooltip opens on hover and touch only, because the heading is not focusable (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                           | Current source and tests |
| FR5 | `ref` reaches the heading element. Supported DOM, ARIA, data, and event props reach it after the derived `aria-level`, so a caller `aria-level` wins; `xstyle`, `className`, and `style` merge in that order after component styles, with the line clamp applied after `style`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests |

### Allowed variation

- **AV1 — Theme paint.** A theme may restyle `heading` per `level`, `color`,
  `type`, and `weight` without changing the element or level.
- **AV2 — Visual reuse.** Any level may use any visual type.

### Representative states

| State                   | Required invariant                                             | Allowed variation |
| ----------------------- | -------------------------------------------------------------- | ----------------- |
| Level only              | `h{level}` at the level's scale.                               | Level.            |
| Display type            | Same element; display scale and weight; `data-type` reflected. | Type.             |
| Theme-added type        | Same element; level baseline; `data-type` reflected.           | Theme paint.      |
| Accessibility override  | `aria-level` differs from the element's level.                 | —                 |
| Truncated with tooltip  | Clamped heading anchors one Tooltip with the full text.        | Placement.        |
| Truncation, tooltip off | Clamped heading; no measurement; no Tooltip.                   | —                 |

### Transformation and precedence order

- **ORD1 — Weight.** Explicit `weight` → built-in type default → level default
  (`spec:AST-024` FR8).
- **ORD2 — Scale.** Built-in `type` → level scale (also the baseline for a
  theme-added type).
- **ORD3 — Display.** `hasCapsize` (`block`) → `maxLines` above 1 (line-clamp
  box) → `maxLines={1}` (`block`) → `display` prop.

### Performance and resources

- **PR1 — Measured only when needed.** Truncation is measured only when
  `maxLines` is positive and the tooltip is enabled; re-measuring follows size
  and content changes without a per-heading observer; the Tooltip module loads
  only when the text is truncated.

## Accessibility contract

- **AR1 — Native heading.** The element is a native `h1`–`h6`; a visual type or
  weight never changes the role, level, or name (`spec:AST-024` FR15).
- **AR2 — Outline override.** `accessibilityLevel` exposes a different outline
  level through `aria-level` without changing the element.
- **AR3 — Truncated text.** The full text stays in the heading's DOM; the
  truncation Tooltip is the only tooltip, and any description it adds is
  Tooltip's.

## Design relationships

| Anatomy or state   | Design requirement                                      | Representation authority | Hierarchy role | Component contract |
| ------------------ | ------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Heading            | A section or page title at the level's or type's scale. | Current source and docs  | Prominent      | FR1–FR3, AR1, AR2  |
| Truncation tooltip | The full text when the heading is clamped.              | Tooltip                  | Supporting     | FR4, AR3           |

Theming: the heading element is the single `heading` target. Its consumer
documentation is a member of `Text/Heading.doc.mjs` and lists no anatomy, so no
anatomy-theming block is declared; the truncation tooltip's target belongs to
Tooltip.

## Family and system relationships

- `spec:AST-024` owns custom visual types, weight precedence, and the rule that
  visual changes leave accessibility unchanged; FR2, ORD1, and AR1 apply it.
- `component:Text` shares Heading's type styles and truncation mechanism.
- `architecture:component-theming-surface` sets the rules the `heading` target
  follows (INV6) and qualifies `type` as a theme-extensible axis (INV14).

## Verification map

| Contract     | Verification                                                                                                                                                               | Representative states                                                                                                   | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                          | Audit section            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| FR1, AR2     | `Heading.test.tsx` level and `accessibilityLevel` tests                                                                                                                    | Levels 1–6; differing and equal override                                                                                | A wrong element, a missing `aria-level` for a differing override, or an `aria-level` added for an equal one fails.                                                                                                                                                                                                                                                       | `audit:Heading/a11y`     |
| FR2          | `Heading.test.tsx` target, type, theme-added type, weight, and omitted-type tests; `extensibleAxes.test.ts`; `HeadingAudit.a11y.chromium.spec.ts` on the AuditMatrix story | Display types, theme-added type, weight                                                                                 | A lost `heading` class or `data-level`, `data-color`, `data-type`, or `data-weight` reflection, a reflected omitted type, or a theme-added type losing its level baseline fails. Display sizes out of order, or an explicit `bold` no heavier than the display default, fails the browser spec. Gap: the level scales and the level default weights have no paint check. | `audit:Heading/theming`  |
| FR3          | Stable visual baseline `core-heading--level-1`; `Heading.stories.tsx`; `HeadingAudit.a11y.chromium.spec.ts`                                                                | Level 1 default; secondary color; `center` and `end` alignment                                                          | A changed level-1 scale, color, or display comes back changed for review; a `justify` that does not resolve to logical `center` or `end`, or heading text below its WCAG contrast threshold, fails the browser spec. Gap: `display` precedence, `textWrap`, cap-height trim, strikethrough, and the theme-added color baseline have no automated check.                  | `audit:Heading/behavior` |
| FR3 (reflow) | `Heading.test.tsx` long unbroken tokens; `TextReflow.a11y.chromium.spec.ts`; `scripts/text-overflow-wrap-anywhere.test.mjs`                                                | A long unbroken token, untruncated and single-line truncated, at 320 CSS px; Text inside CommandPaletteEmpty and Banner | A token that does not wrap in an untruncated heading, a page that scrolls sideways at 320 px, single-line truncation that no longer clips on one line, Text inside CommandPaletteEmpty or Banner that loses the container's `anywhere` wrap or crosses an inline edge, or a Core style that sets `overflow-wrap: anywhere` without passing it to Text, fails.            | `audit:Heading/a11y`     |
| FR4, PR1     | `Heading.test.tsx` truncation-measurement tests; `useTruncation.test.tsx`; `HeadingAudit.a11y.chromium.spec.ts`                                                            | Tooltip on and off; content change; one and two lines                                                                   | Measuring with the tooltip off, not measuring with it on, or a missed re-measure fails. A one-line heading without its ellipsis, a two-line clamp that does not hold two lines, or a clipped heading whose hover shows no full-text tooltip fails the browser spec. Gap: the `wordBreak` defaults and the tooltip placement have no automated check.                     | `audit:Heading/behavior` |
| FR5          | `Heading.test.tsx` ref, `id`, passthrough, `aria-level` precedence, styling-input, and line-clamp tests                                                                    | Rerender; `id`; `data-testid`; caller `aria-level`; `className`, `xstyle`, and `style`                                  | A detached ref, a lost `id` or test id, a derived `aria-level` that overrides the caller's, a `className` or `xstyle` that is dropped or merges before the component styles, or a caller `WebkitLineClamp` that replaces the clamp fails.                                                                                                                                | `audit:Heading/behavior` |
| AR1          | `Heading.test.tsx` display-type element tests                                                                                                                              | Levels with display and theme-added types                                                                               | A visual type that changes the element fails.                                                                                                                                                                                                                                                                                                                            | `audit:Heading/a11y`     |
| AR3          | `Heading.test.tsx` truncation title test; `HeadingAudit.a11y.chromium.spec.ts`                                                                                             | Truncated heading                                                                                                       | A native `title` on a truncated heading fails both.                                                                                                                                                                                                                                                                                                                      | `audit:Heading/a11y`     |
| AR1, AR2     | `HeadingAudit.a11y.chromium.spec.ts` reading Chromium's accessibility tree (`spec:AST-009` FR3)                                                                            | Levels, equal and differing override, display types                                                                     | A heading exposed with a role or level other than its element or `aria-level` requires fails the browser spec.                                                                                                                                                                                                                                                           | `audit:Heading/a11y`     |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
