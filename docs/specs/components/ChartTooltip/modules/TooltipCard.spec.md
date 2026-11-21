---
schema_version: 3
template_version: 4
kind: module
id: module:ChartTooltip/TooltipCard
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [behavior, interaction, layering, layout]
verified_by:
  [
    packages/charts/src/marks/dotGLInteractive.test.tsx,
    packages/charts/src/ChartTooltip.test.tsx,
    packages/charts/src/ChartTooltip.source-build.test.mjs,
    apps/storybook/stories/charts/WebGL.stories.tsx,
  ]
parent_component: component:ChartTooltip
references:
  [
    spec:AST-027,
    architecture:layer-runtime,
    architecture:react-component-runtime,
    spec:AST-115/DEC-7,
  ]
---

# TooltipCard module contract

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/charts/src/tooltipCard.tsx",
    "packages/charts/src/marks/dotGLInteractive.tsx"
  ]
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | None. `useTooltipCard` and `DefaultTooltipContent` in `packages/charts/src/tooltipCard.tsx` are internal to `@astryxdesign/charts`; the package exports neither. `ChartTooltip` and `dotGLInteractive` render their cards through them.                                                                                                                      |
| Behavior                | The chart tooltip card is one fixed-mode Layer host in the browser top layer, portaled into the chart's nearest HTML element and placed beside an anchor in plot coordinates. In `dotGLInteractive`, a mouse or pen pointer over a dot opens that card beside the dot, showing its x value, then its value.                                                  |
| End-user impact         | People who point at a WebGL scatter dot with a mouse or a pen see the same card as `ChartTooltip`'s, beside the dot, never cut off by the plot. `ChartTooltip`'s card looks and moves the same.                                                                                                                                                              |
| Builder impact          | None. `renderTooltip` on `dotGLInteractive` keeps its signature and replaces the default body.                                                                                                                                                                                                                                                               |
| Compatibility/readiness | No public API change. The record contracts FR1–FR4 only; other card behavior stays uncontracted.                                                                                                                                                                                                                                                             |
| Review checks           | Reject `ChartTooltip` or `dotGLInteractive` copying the card host, chrome, portal or placement; a card host that keeps its portal element in React state or portals to the document body; a scatter card that covers its dot or halo, or leaves the viewport, when there is room beside the dot; a `ChartTooltip` placement change made through this module. |
| Governing rules         | `spec:AST-027` FR7 and FR8 (floating surfaces use Layer and enter the browser top layer); `architecture:layer-runtime`; `architecture:react-component-runtime` INV1, INV3 and INV18.                                                                                                                                                                         |

This table is a review projection; the body below is authoritative.

## Intent

The grouped `ChartTooltip` card and the WebGL scatter's point card are one
card. This module owns the card's host, chrome, portal and placement, so both
look and move the same, and one change to the card reaches both callers.

This record contracts that seam and three choices of its scatter caller: what
opens the card, its default body, and its placement beside a dot. `ChartTooltip`'s
rows, visibility and x-column placement stay with `component:ChartTooltip`, and
the pointer stream stays with `component:Chart`.

## Compatibility and migration

- Released default preserved: `yes` for `ChartTooltip`'s card; FR2–FR4 define
  the scatter card
- Compatibility class: additive; no public API, default or signature changes
- Migration decision: none required

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The card host: one fixed-mode Layer per caller, in the browser top layer,
  with the card chrome (popover background, border, container radius, spacing-2
  block and spacing-3 inline padding, medium shadow) and no pointer hit target.
- The portal into the chart's nearest HTML element, so nested Theme and
  MediaTheme scopes apply.
- Placement beside an anchor in plot coordinates: the `auto`, `left`, `right`
  and `top` placements, the 8px gap, an optional clearance around the anchor,
  start or center vertical alignment, and the viewport clamp.
- The default card body, `DefaultTooltipContent`.
- For `dotGLInteractive`: what opens the card, its default body and its point
  placement (FR2–FR4).

**Does not own / non-goals**

- `ChartTooltip`'s rows, visibility, hover indicator, hover dots and x-column
  anchor — owned by `component:ChartTooltip`.
- The pointer stream, its coordinates and which pointer types reach it — owned
  by `component:Chart`.
- Top-layer promotion and popover state — owned by `architecture:layer-runtime`.
- Value formatting in the scatter card — `spec:AST-115` DEC-7 leaves it to a
  record that defines the WebGL marks' value surfaces.
- Keyboard and screen-reader access to scatter points — uncontracted.

## Public API and concepts

| Concept                 | Closed values or states                          | Meaning                                                                                          | Default             | Owner                             | Stability |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------- | --------------------------------- | --------- |
| `useTooltipCard()`      | `cardRef`, `show`, `hide`, `place`, `renderCard` | the card seam; the caller decides what is hovered, the content and when to open                  | none                | `module:ChartTooltip/TooltipCard` | internal  |
| placement               | `auto`, `left`, `right`, `top`                   | which side of the anchor the card takes; `auto` is right, or left when right passes the viewport | caller-supplied     | `component:ChartTooltip` values   | internal  |
| clearance               | CSS px                                           | radius around the anchor that the card keeps clear of, before the gap                            | `0`                 | `module:ChartTooltip/TooltipCard` | internal  |
| vertical alignment      | `start`, `center`                                | card top at the anchor, or card centered on it; `top` placement ignores it                       | `start`             | `module:ChartTooltip/TooltipCard` | internal  |
| `DefaultTooltipContent` | one row, or several rows                         | the x value in semibold, then the bare value, or one labeled row with a swatch per series        | used without render | `module:ChartTooltip/TooltipCard` | internal  |

## Behavioral contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Basis                              | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------ |
| FR1 | `ChartTooltip` and `dotGLInteractive` MUST render their cards through `useTooltipCard`. Each caller owns what is hovered, the card content, and when the card opens and closes (`show`, `hide`). The module owns the host, its chrome, its portal and `place`. Neither caller copies any of these.                                                                                                                                                                 | `spec:AST-027` FR7 and FR8; DEC-1  | human decision     |
| FR2 | In `dotGLInteractive`, a mouse or pen pointer over a dot MUST open the card for the dot under the pointer, and a pointer over no dot, or leaving the plot, MUST close it. The pick runs in the handler of the chart's pointer events.                                                                                                                                                                                                                              | the mark's documented hover; DEC-2 | human decision     |
| FR3 | Without `renderTooltip`, the scatter card MUST show the dot's x value, then its series value, through `DefaultTooltipContent` with one row, as `ChartTooltip`'s single-series card does.                                                                                                                                                                                                                                                                           | DEC-2                              | human decision     |
| FR4 | The scatter card prefers the right of the dot's halo plus the 8px gap, vertically centered on the dot. It flips to the left of the halo when the right placement would pass the viewport's right edge (the `auto` rule). The viewport clamp then keeps it inside the viewport, so the gap can be smaller than 8px. When there is room beside the dot, the card MUST NOT cover the halo. A custom `renderTooltip` body keeps its own size and can exceed that room. | DEC-2                              | human decision     |

### Transformation and precedence order

- **ORD1 — Content before position.** When the hovered dot changes, the card
  body for that dot commits before the card is measured and placed.

### Performance and resources

- **PR1 — Placement reads layout once per change.** The card is placed when
  the hovered dot changes, and once more on the next pointer move after a page
  scroll, a window resize or a re-layout marks its position stale. A move over
  the same dot with no such signal reads no layout for the card, and scroll and
  resize listeners read no layout.

## Accessibility contract

- **AR1 — The card is a tooltip.** The card body has `role="tooltip"` and takes
  no pointer hit, so it never captures the pointer it describes.

## Design relationships

| Anatomy or state | Design requirement                                       | Representation authority | Module contract |
| ---------------- | -------------------------------------------------------- | ------------------------ | --------------- |
| card             | the same chrome in `ChartTooltip` and `dotGLInteractive` | prescribed               | FR1             |

## Parent and system relationships

- `component:ChartTooltip` owns the grouped tooltip's content, visibility and
  x-column placement, and renders its card through this module.
- `component:Chart` owns the pointer stream that both callers read.
- `architecture:layer-runtime` owns the Layer host and top-layer promotion.

## Verification map

| Contract | Verification                                                                                                       | Representative states                                                                                                                      | Mutation or failure expectation                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | `ChartTooltip.test.tsx`; `ChartTooltip.source-build.test.mjs`                                                      | grouped card content, visibility and Layer host; card padding in the shipped stylesheet                                                    | removing a card padding fails the stylesheet test; a placement change for `ChartTooltip` fails its card tests                                                                                                                |
| FR2      | `dotGLInteractive.test.tsx` (pointer wiring); WebGL Interactive scatter play function, run by the story play guard | mouse and pen moves over 20 dots spread across the plot; a miss; leaving the plot; a miss after a re-layout                                | a mark that does not read the chart's pointer events opens 0 of 20 cards                                                                                                                                                     |
| FR3      | `dotGLInteractive.test.tsx`                                                                                        | a dot without `renderTooltip`; a dot with it                                                                                               | a body other than the x value then the value fails the default-body assertion                                                                                                                                                |
| FR4      | WebGL Interactive scatter play function; real-Chrome placement measurements outside the repository                 | the play: the dots nearest the right and top plot edges; the measurements: 20 dots at two widths, a near-margin dot and an overflowing dot | the play fails when the card is inside the svg, leaves the viewport, or covers the dot's center; the exact gap, halo clearance, vertical centering and near-margin versus overflow side are checked only by the measurements |
| ORD1     | real-Chrome frame recording outside the repository; `dotGLInteractive.test.tsx` (synchronous commits)              | first open, and a switch between dots with cards of different widths                                                                       | a frame that shows a card's body at another dot's position fails the recording; a missing or extra synchronous commit fails the unit test                                                                                    |
| PR1      | `dotGLInteractive.test.tsx`                                                                                        | more moves over one dot with no scroll, resize or re-layout; a scroll over one dot                                                         | a layout read or a synchronous commit on such a move, or a card that stays put after a scroll, fails a test                                                                                                                  |
| AR1      | `ChartTooltip.test.tsx`; WebGL Interactive scatter play function                                                   | open card                                                                                                                                  | a card without `role="tooltip"` fails the queries both use                                                                                                                                                                   |

## Decision log

### DEC-1 — ChartTooltip and the WebGL scatter share one tooltip card

**Reference:** `module:ChartTooltip/TooltipCard/DEC-1`
**Decider:** `<pending engineering-owner approval>`

`ChartTooltip` and `dotGLInteractive` render their cards through one internal
module, so a person sees the same card in both, and a fix to the card reaches
both. The module owns the host, chrome, portal and placement; each caller keeps
its own content and visibility.

Rejected: a separate card inside the scatter mark, because two copies of the card drift.

### DEC-2 — The WebGL scatter opens the chart card on mouse and pen hover

**Reference:** `module:ChartTooltip/TooltipCard/DEC-2`
**Decider:** `<pending engineering-owner approval>`

A mouse or pen pointer over a scatter dot opens the chart card beside the dot.
Without `renderTooltip`, the card shows the dot's x value, then its value. It
prefers the right of the halo, flips left when the right side would overflow
the viewport, as the grouped card's `auto` placement does, and then stays inside
the viewport, so a person reads the dot's values next to it.

## Open questions

None.

## Content boundary

This record does not duplicate consumer signatures or examples, `ChartTooltip`'s
aggregate behavior, the chart's pointer stream, current audit results or
implementation steps. It links to their canonical owners.
