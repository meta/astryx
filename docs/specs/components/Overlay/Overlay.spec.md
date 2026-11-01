---
schema_version: 3
template_version: 7
kind: component
id: component:Overlay
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-22
owners: [cixzhang]
review_triggers: [public-api, layout, accessibility]
verified_by:
  [
    packages/core/src/Overlay/Overlay.test.tsx,
    apps/storybook/stories/Overlay.stories.tsx,
  ]
modules: []
families: []
design_specs: [design:bidirectionality]
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:internationalization,
  ]
contributing: []
system_specs: [spec:AST-002/DEC-1, spec:AST-017/FR5, spec:AST-027/FR2]
---

# Overlay component contract

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

This record governs how several pieces of content are placed over an Overlay's
surface, each at a preset spot or at fractional coordinates, including the
stacking of a container that holds such content. Overlay's scrim, reveal modes,
own `position` values, and alignment remain described by its source, tests, and
`Overlay.doc.mjs` until a record claims them.

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | New `OverlayRegion` component, exported beside Overlay: `position` (required) is a preset (`'fill' \| 'top' \| 'bottom' \| 'center' \| 'top-start' \| 'top-end' \| 'bottom-start' \| 'bottom-end'`) or open placement `{x, y, width?, height?}` in 0–1 fractions; plus `children`, `ref`, `xstyle`, `className`, `style`. |
| Behavior                | Inside a fill Overlay, a preset region sits at that spot (corners follow the writing direction) and open placement sits at fractions of the media measured from its top-left corner, never mirrored. A sized open region stays inside the media. Regions scale with the media.                                            |
| End-user impact         | Several captions, tags, badges, or hotspots over one image or video each stay on their spot of the media at every size, in either text direction.                                                                                                                                                                         |
| Builder impact          | None by default. A builder places content with `OverlayRegion` instead of hand-written absolute positioning; moving a region stays the builder's code.                                                                                                                                                                    |
| Compatibility/readiness | Additive: a new component and export; an Overlay without a region renders and stacks exactly as before. This record is current authority; `OverlayRegion`, its consumer docs, region tests, and region stories have not shipped yet.                                                                                      |
| Review checks           | Reject open placement that mirrors in right-to-left, corner presets that do not, JavaScript measurement or observers, drag or resize behavior inside Overlay, a role or focus stop on the region, a theme target on it, or a region placed inside a strip.                                                                |
| Governing rules         | FR1–FR11 below; `design:bidirectionality/DR3`, `DR5`, `DR6`; `architecture:component-theming-surface/INV4`; `spec:AST-017/FR5`; `spec:AST-027/FR2`.                                                                                                                                                                       |

This table is a review projection; the body below is authoritative.

## Intent

Overlay layers content over a bounded surface, usually media, and places that
content as one block: the whole surface or a band at the top or bottom. Some
surfaces carry several pieces of content, each belonging to its own spot: two
captions drawn into an image, a badge in a corner beside a caption, a tag on a
face. A spot is either one of Overlay's familiar places or a point on the media
described as fractions of its width and height, because the media is shown at
many sizes and the spot must stay on the same pixels of it. Overlay owns that
placement because Overlay owns the surface it is measured against.

## Compatibility and migration

- Released default preserved: `yes`; an Overlay without a region renders and
  stacks exactly as before. Only a container that holds a region isolates its
  stacking (FR10).
- Compatibility class: additive component and export.
- Controlled/uncontrolled behavior: not applicable; a region holds no state.
- Migration decision: none required (`spec:AST-017/FR5`).

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- `OverlayRegion`: its `position` values, their geometry, clamping, scaling, and
  reference box.
- The rule that open placement is measured in the media's own physical space.
- The rule that regions are placed only in fill overlays, and the fallback
  everywhere else.
- The stacking isolation of a container that holds a region.

**Does not own / non-goals**

- Moving, dragging, or resizing a region, including pointer capture, keyboard
  steps, snapping, and when a new position is reported — owned by the product
  callsite (`component:Overlay/DEC-3`).
- What a region paints: borders, fills, handles, and text — owned by the
  region's content.
- Making the base content fill the surface — owned by the caller, as for every
  Overlay; fractions are measured against the surface, so media that does not
  fill it does not line up with them.
- Overlay's own `position` and `align` — unchanged; a region does not read or
  alter them beyond FR2.
- Placement relative to a trigger or outside the surface — owned by the layer
  runtime (Popover, Tooltip, HoverCard).

## Public concepts

| Concept        | Closed values or states                                                                 | Meaning                                                                                                                                                                                                                             | Availability by variant/orientation/state | Default             | Owner               | Stability | Invalid-value behavior                                                                                  |
| -------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------- | ------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| Preset         | `fill`, `top`, `bottom`, `center`, `top-start`, `top-end`, `bottom-start`, `bottom-end` | `fill`, `top`, and `bottom` are the places Overlay's own `position` names: the whole surface, or a full-width band at that edge. `center` and the corners hold content-sized boxes at that spot.                                    | Fill overlays (FR2)                       | None; required prop | `component:Overlay` | stable    | Other strings are rejected by the public type                                                           |
| Open placement | `{x, y, width?, height?}`; each a number from 0 to 1                                    | `x`, `y`: the region's top-left corner as fractions of its reference box, measured from that box's top-left corner. `width`, `height`: the region's size as fractions, extending right and down; omitted means it fits its content. | Fill overlays (FR2)                       | None; required prop | `component:Overlay` | stable    | Values clamped into 0–1; a non-finite coordinate is treated as 0 and a non-finite size as omitted (FR6) |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                                                       | Draft review state |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------ |
| FR1  | `OverlayRegion` rendered directly in the content of an Overlay or `useOverlay` host with `position="fill"`, the default, MUST position against that host's scrim box, which is the whole base surface: 0 and 1 are the media's edges, and the box matches the Overlay's `ref`. Any element between the region and the scrim that establishes a containing block for absolutely positioned descendants becomes its reference box instead. In this record, the surface means the region's reference box.                                                            | `component:Overlay/DEC-1`                                   | settled            |
| FR2  | Regions are placed only in fill hosts. A region rendered anywhere else MUST NOT be placed: in the content of an Overlay or `useOverlay` host whose `position` is `"top"` or `"bottom"`, in an Overlay's `children`, or with no Overlay or `useOverlay` host at all, it renders its content as ordinary in-flow content where it stands (in a strip, that content reveals and slides with the strip) and MUST emit one development warning per mount naming the fill-only rule.                                                                                    | `component:Overlay/DEC-4`                                   | settled            |
| FR3  | A preset region MUST sit at its spot inside Overlay's content inset: `fill` covers the inset box; `top` and `bottom` span its full width at that edge with content height; `center` is content-sized at its center; each corner is content-sized at that corner. Content larger than the inset box is clipped by the container, not shifted.                                                                                                                                                                                                                      | `component:Overlay/DEC-2`                                   | settled            |
| FR4  | Corner presets MUST resolve `start` and `end` against the writing direction of the region's own context: `top-start` is the top-left corner in left-to-right and the top-right corner in right-to-left. `fill`, `top`, `bottom`, and `center` are symmetric and do not change with direction.                                                                                                                                                                                                                                                                     | `design:bidirectionality/DR3`                               | settled            |
| FR5  | Open placement MUST measure `x` from the surface's left edge and `y` from its top edge in every writing direction, and MUST NOT mirror in right-to-left. The region's own content follows the ambient direction.                                                                                                                                                                                                                                                                                                                                                  | `design:bidirectionality/DR5`                               | settled            |
| FR6  | Open coordinates and sizes MUST be clamped into 0–1 before placement. A non-finite coordinate MUST resolve to 0, and a non-finite size MUST resolve to omitted.                                                                                                                                                                                                                                                                                                                                                                                                   | Invalid-value behavior                                      | settled            |
| FR7  | Open placement puts the region's top-left corner at (`x`, `y`) (`component:Overlay/DEC-6`). On an axis with a size, the region MUST be exactly that fraction of the surface, extending right or down, and MUST sit wholly inside it: its start is clamped between 0 and one minus the size. On an axis without a size, the region MUST fit its content starting at the coordinate, and any overhang past the container's edge is clipped, not shifted inward.                                                                                                     | `component:Overlay/DEC-5`                                   | settled            |
| FR8  | When the surface changes size, every region MUST keep its spot: presets by their insets, open placement by its fractional position and size, without a re-render.                                                                                                                                                                                                                                                                                                                                                                                                 | `component:Overlay/DEC-1`                                   | settled            |
| FR9  | A region MUST appear, hide, and become inert with the overlay content that contains it, following Overlay's `showOn` and `isOpen`, and MUST inherit the scrim's media theme. It adds no visibility rule of its own.                                                                                                                                                                                                                                                                                                                                               | Overlay's existing reveal behavior                          | settled            |
| FR10 | A placed region MUST paint above the fill surface's in-flow overlay content, including positioned in-flow content written after it, and a later placed region MUST paint above an earlier one. A placed region inside a wrapper that forms a stacking context is ordered only among that wrapper's content. An Overlay or `useOverlay` container with a placed region anywhere inside it MUST own an isolated stacking context; a container with no region inside it keeps its stacking unchanged. A placed region MUST NOT take part in the scrim's flow layout. | Absolute positioning within the surface; `spec:AST-027/FR2` | settled            |
| FR11 | Overlay and `OverlayRegion` MUST NOT move, drag, or resize a region, and MUST NOT attach pointer, keyboard, or gesture handlers to it. A region moves only when its caller passes a new `position`.                                                                                                                                                                                                                                                                                                                                                               | `component:Overlay/DEC-3`                                   | settled            |

### Allowed variation

- **AV1 — Content.** Any content may sit in a region; on an open region each
  axis is sized or content-sized independently (FR7).
- **AV2 — Surface size and shape.** The surface may be any size or aspect ratio,
  and may change size at any time (FR8).
- **AV3 — Mixed content.** In-flow overlay content, preset regions, and open
  regions may share one surface (FR10).

### Representative states

| State                                                    | Required invariant                                                                                        | Allowed variation  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------ |
| Two captions, `top` and `bottom` presets                 | Each spans the inset width at its edge, like Overlay's own strips.                                        | Caption text.      |
| `top-start` badge, left-to-right and right-to-left       | Top-left corner in left-to-right; top-right corner in right-to-left.                                      | Badge content.     |
| Open sized caption near the right edge                   | Box is the given fraction of the image and stays wholly inside, flush with that edge.                     | Which edge.        |
| Open content-sized pin                                   | Pin starts at its point and extends right and down; overhang past the container is clipped.               | Pin content.       |
| Open region, right-to-left page                          | Same spot on the media as left-to-right; the region's text reads right-to-left.                           | Writing direction. |
| Surface resized from 640px to 320px wide                 | Every region keeps its spot, with no re-render.                                                           | Any surface size.  |
| Region in an Overlay's `children` or outside any Overlay | Is not placed: its content flows where it stands, and it warns once in development.                       | Location.          |
| Region in a `position="bottom"` Overlay                  | Is not placed: its content flows in the strip like other strip content, and it warns once in development. | Strip content.     |
| `showOn="hover"` overlay at rest                         | Regions are hidden with the rest of the overlay content.                                                  | Reveal mode.       |

### Transformation and precedence order

- **ORD1 — Placement.** Resolve the reference box (FR1, FR2) → for a preset,
  place it in the content inset and resolve start/end against direction (FR3,
  FR4); for open placement, clamp values (FR6) and resolve each axis as sized or
  content-sized in physical space (FR5, FR7) → express the result as insets and
  fractions of the box (FR8). Styling inputs compose after placement in the order
  `architecture:public-component-api/INV6` gives; a caller who overrides inset or
  size properties owns the result.

### Performance and resources

- **PR1 — CSS geometry only.** Placement, clamping, and scaling MUST be achieved
  with arithmetic on the given values and CSS: no measurement, observer,
  listener, state, Effect, or extra render pass. The fill-only check adds no
  measurement, state, or extra render pass.

## Accessibility contract

- **AR1 — Presentation only.** `OverlayRegion` MUST add no role, accessible name,
  description, focus stop, or text. Its content keeps its own semantics.
- **AR2 — Source order is reading order.** Assistive technology and keyboard
  focus follow the regions' source order, not their position on the surface. A
  caller renders regions in the order a reader should meet them.
- **AR3 — Movement offers non-drag paths.** Overlay's documented move pattern
  for open regions pairs pointer dragging with a single-pointer path that needs
  no drag, where activating a spot on the media moves the region there, and a
  keyboard path that moves a region whose content has focus by a fixed step per
  arrow key, with arrow directions matching the visual axes
  (`design:bidirectionality/DR6`).

## Design relationships

| Anatomy or state     | Design requirement                                           | Representation authority      | Hierarchy role | Component contract |
| -------------------- | ------------------------------------------------------------ | ----------------------------- | -------------- | ------------------ |
| Preset region        | Reads as Overlay's own places, with Overlay's content inset. | Owner direction               | Supporting     | FR3                |
| Corner preset in RTL | Leading and trailing corners follow reading order.           | `design:bidirectionality/DR3` | Supporting     | FR4                |
| Open region          | Stays on the same spot of the media at every size.           | Owner direction               | Supporting     | FR7, FR8           |
| Open region in RTL   | Media is physical content and does not mirror.               | `design:bidirectionality/DR5` | Supporting     | FR5                |

## Family and system relationships

- `design:bidirectionality` owns direction behavior: FR4 applies DR3 to corner
  presets, FR5 applies DR5 to open placement, and AR3 applies DR6 to movement.
- `architecture:component-theming-surface/INV4` keeps a non-painting box out of
  the theme surface: the region is a geometry-only box that paints nothing, so it
  has no theme target and its content owns its paint.
- `architecture:public-component-api` owns prop admission and styling-input
  order; ORD1 applies INV6.
- `spec:AST-027/FR2` puts the isolation boundary on the surface; FR10 makes the
  Overlay or `useOverlay` container that holds a region that owner.
- `spec:AST-017/FR5` classifies this as nonbreaking: it adds a new component,
  changes no default, and a caller who never renders a region sees no change.

## Verification map

| Contract                      | Verification                                                         | Representative states                                                                                                                             | Mutation or failure expectation                                                                                                                                             | Audit section          |
| ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| FR1, FR2, FR6, FR11           | `Overlay.test.tsx` region suite                                      | Region in Overlay and `useOverlay` content; in a `bottom` Overlay; outside any Overlay; out-of-range and non-finite input; pointer and key events | Unclamped values, a region outside the scrim, a placed region in a strip or a missing warning, or a region that moves on its own fails.                                     | `audit:Overlay/api`    |
| FR3, FR4, FR5, FR7, FR8, FR10 | Real-Chromium assertions in the Overlay region story's play function | Every preset; open sized, edge-clamped, and content-sized; resized surface; RTL; a region before a positioned control                             | A region off its spot by more than 0.5px, a corner that does not flip or an open region that does, the in-flow control hit at a region's center, or wrong isolation, fails. | `audit:Overlay/layout` |
| FR9                           | `Overlay.test.tsx` reveal case with a region                         | `isOpen={false}`                                                                                                                                  | A region outside the scrim, or a closed scrim that is not inert, fails.                                                                                                     | `audit:Overlay/api`    |
| AR1, AR2                      | `Overlay.test.tsx` DOM check of the region element                   | Text content                                                                                                                                      | Any attribute other than `class` and `style` on the region element, or text it adds, fails.                                                                                 | `audit:Overlay/a11y`   |
| AR3                           | Region move story's play function                                    | Arrow key and single activation on the media, LTR and RTL                                                                                         | ArrowRight moving a region left, or an activation that does not move the region to the activated spot, fails.                                                               | `audit:Overlay/a11y`   |
| PR1                           | Source review of `OverlayRegion`                                     | All inputs                                                                                                                                        | A ref read, observer, listener, or Effect added for placement fails review.                                                                                                 | `audit:Overlay/layout` |

## Decision log

<!-- Record the boundary or requirement, not how it was reached. A rejected alternative is at most one line here, kept only when it is consequential and likely to recur. -->

### DEC-1 — Several placed items are Overlay regions with one `position` prop

**Reference:** `component:Overlay/DEC-1`
**Decider:** cixzhang, 2026-10-22

Overlay places one content block, so a surface with several spots needs a child
that places itself. `OverlayRegion` inside Overlay's content inherits Overlay's
surface, reveal, and media theme with no new Overlay prop, and one `position`
prop covers both kinds of spot: a named place or open placement. Sizes live
inside the open placement object, so a region never carries `width` or `height`
props whose numbers mean fractions while the same names mean pixels on Card,
Button, and Grid.

Rejected: an object form of Overlay's own `position`, because it still places
only one block.

### DEC-2 — Presets reuse Overlay's places and add the center and corners

**Reference:** `component:Overlay/DEC-2`
**Decider:** cixzhang, 2026-10-22

`fill`, `top`, and `bottom` mean on a region what they mean on Overlay, so a
builder reads one vocabulary. Static badges and labels need the center and the
corners, which Overlay's single block cannot hold beside other content. Corners
use `start` and `end` because a leading badge leads in either direction.

### DEC-3 — Moving a region stays at the callsite

**Reference:** `component:Overlay/DEC-3`
**Decider:** cixzhang, 2026-10-22

What moving a region means differs by product: whether the position commits on
release or live, the keyboard step, snapping, which regions move, and what
happens while a new rendering of the media loads. Overlay therefore never moves
a region; the caller converts pointer and keyboard input into new fractions
measured against the region's reference box and passes them back.

Rejected: a drag hook on Overlay, because a shared drag primitive needs its own
record and more than one caller's needs.

### DEC-4 — Regions belong to fill overlays

**Reference:** `component:Overlay/DEC-4`
**Decider:** cixzhang, 2026-10-22

A spot on the media is meaningless inside a strip whose height follows its own
content and which slides in and out. A strip is also the containing block of
everything inside it, so CSS cannot place a region against the media from
there. In a strip overlay a region therefore renders its content as ordinary
strip content and warns in development, so the content stays visible. The
public type cannot enforce the rule, because regions arrive through `content`.
The same fallback applies outside any fill host, where there is no surface to
measure against and nothing to isolate a region's paint order.

Rejected: placing a strip's regions against the container, because escaping the
strip needs a second rendering layer that duplicates Overlay's reveal.

### DEC-5 — Open sized axes are clamped inside; content-sized axes are not

**Reference:** `component:Overlay/DEC-5`
**Decider:** cixzhang, 2026-10-22

A sized region can be kept inside the surface with arithmetic on the given
fractions, so it never spills off the media however far it is moved. Keeping a
content-sized region inside would require measuring it, which PR1 forbids, so
the container clips any overhang.

### DEC-6 — Open placement names the region's top-left corner

**Reference:** `component:Overlay/DEC-6`
**Decider:** cixzhang, 2026-10-22

`x` and `y` are the region's top-left corner, and `width` and `height` extend
right and down. That matches how servers and editors report boxes (left, top,
width, height) and how CSS insets read, so a reported box passes through with no
conversion and is clamped with plain arithmetic.

Rejected: the region's center, because every reported box would need converting.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
