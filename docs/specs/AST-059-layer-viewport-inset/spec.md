---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-059
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-03
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:layer-runtime]
affects_families: []
affects_contributing: []
affects_consumer_docs:
  [
    Layer,
    LayerProvider,
    useLayer,
    Popover,
    usePopover,
    DropdownMenu,
    BaseTypeahead,
    Toast,
  ]
review_triggers: [layering, layout, behavior, public-api]
---

# Layer viewport inset system spec

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "layering": [
      "FR1",
      "FR2",
      "FR4",
      "FR5",
      "FR7",
      "FR8",
      "FR9",
      "DEC-1",
      "DEC-3"
    ],
    "layout": [
      "FR1",
      "FR2",
      "FR3",
      "FR4",
      "FR5",
      "FR6",
      "FR8",
      "FR9",
      "DEC-2",
      "DEC-6"
    ],
    "behavior": ["FR2", "FR4", "FR5", "FR7", "FR8", "FR9", "FR10"],
    "public-api": ["FR6", "DEC-4", "DEC-5"]
  }
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | The layer runtime owns the viewport inset: one gutter definition (FR1), one size cap — the viewport, never the span beside the trigger (FR2, FR3) — one standard fallback order and an anchor-clear order for a layer that keeps its anchor clear (FR4, FR5), and one place an app declares a persistent bar floating over a viewport edge: `LayerProvider`'s `inset`, read by anchored layers and the toast viewport alike (FR6, DEC-4, DEC-5). Popover is an application of the layer that adds styling on top (DEC-1).                                                                                                                                                                                                                                                                              |
| Behavior                | A layer renders at its own size — the caller's explicit size, or its content's — up to the viewport minus its gutters, and never beyond: content that cannot fit the viewport overflows inside the layer, where the composing component scrolls or clips it (FR2, FR3). Content that can wrap fits beside the trigger by wrapping; a size that cannot shrink flips, and fitting neither side it keeps its size and slides along the alignment axis into view (FR4, DEC-2); a tooltip instead goes beside its trigger or to the roomier side (FR4). A layer whose anchor has left the viewport holds its position and its size (FR5, DEC-3). The first frame a layer paints is its settled frame; it never paints and then moves, save the one-frame case and the keyboard cap's change that FR8 names. |
| End-user impact         | A person who opens a 352px menu from a control near the edge of a panel gets a 352px menu, not a 274px one. A long menu on a phone keeps its labels readable instead of squeezing beside its trigger. A layer never ends under a phone navigation bar the app has declared (FR6). Nothing moves for an app that declares no bar. On a phone, a layer that would run under the software keyboard ends 10 px above it, its content scrolling (FR9).                                                                                                                                                                                                                                                                                                                                                      |
| Builder impact          | `Popover.width` and `DropdownMenu.menuWidth` become ordinary sizes. An app with a floating bar declares it once, as `inset` on the `LayerProvider` it already mounts, beside `toast`; toasts and anchored layers both clear it. Components that compose `useLayer` or `usePopover` inherit the gutter, the caps, and the fallbacks without a record change (FR7).                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Compatibility/readiness | Behavior change, one additive prop. An explicit size near an edge renders at its size instead of shrinking; unwrappable content near an edge flips or slides instead of overflowing its box; prose still wraps beside its trigger (DEC-2). Every anchor-mode layer gains the gutter and caps (FR7). `LayerProvider.inset` defaults to zero on every edge, so an app that declares none renders as before, with or without a provider; an existing `toast.inset` keeps its meaning (DEC-5). Authority: `current`, approved by the owner on 2026-10-03.                                                                                                                                                                                                                                                  |
| Review checks           | Reject a second definition of the viewport gutter outside the layer runtime; a `max-inline-size` resolved against the anchor's span; a layer box that can exceed the viewport on either axis; a fallback list authored by a component for an anchor-mode layer; a branch on whether a size was explicit; a slide that continues once the anchor has left the viewport; a `layer` theme target or a theme value standing in for an app's bar; a second place to declare the bar beside `LayerProvider.inset`; a consumer minimum that is not clamped by the runtime's cap; a layer under a default provider that renders differently from one with no provider; a geometry input read after paint and applied, except as FR8 permits; a story that asserts only settled geometry.                       |
| Governing rules         | [`architecture:layer-runtime`](../../architecture/layer-runtime.md) INV3, INV5 for anchor-mode placement, fallbacks, and direction, INV10 for what `LayerProvider` is; [`spec:AST-003`](../AST-003/spec.md) FR21–FR23 for the reduced behavior where CSS Anchor Positioning is absent; `component:Popover` FR4, ORD4 for Popover's conditional scrolling, which this record leaves in place.                                                                                                                                                                                                                                                                                                                                                                                                           |

This table is a review projection; the body below is authoritative.

## Intent

An anchored layer must stay on screen with a breathing gap from the viewport
edge and from the device's own insets, must choose a position that fits, and
must know where the viewport really ends when an app floats a bar over it. A
person who opens a menu from a control near the edge of a panel needs the menu
at the size it was given; a person on a phone needs a long menu's labels
readable rather than squeezed beside the trigger; a person using an app with a
floating navigation bar needs no layer to end underneath it.

This record owns one answer: **the layer runtime owns the viewport inset —
the gutter, the size cap, the fallback order, the app-declared inset, and the
stories that show them. Popover is an application of the layer that adds
styling on top.** A gutter defined in one place cannot drift between
components; a size capped by the viewport rather than by the span beside the
trigger cannot shrink an explicit width near an edge; an inset declared once by
the app reaches every layer instead of the components that happen to read it.

## Ownership boundary

**Owns**

- The viewport gutter: its one definition, which edges it applies to, how the
  device safe area and an app-declared inset feed it.
- The size cap of an anchor-mode layer on both axes, and that no span beside
  the trigger ever caps a layer.
- The fallback order of an anchor-mode layer, including the slide and the
  condition under which it applies.
- Where an app declares a persistent bar floating over a viewport edge —
  once, for anchored layers and toasts together — and that a theme does not.
- That every anchor-mode layer inherits these behaviors without a component
  record change, and what a composing component may still add on top.
- The Layer stories that demonstrate the viewport behaviors.

**What Popover keeps**

- Its props and their meaning, including that an explicit `width` wins over
  trigger matching and that, without one, the surface prefers the trigger's
  minimum width — the one fact the layer cannot know is whether this instance
  was given a size, and the layer does not need to know it (DEC-2).
- Its visual treatment, the painted surface and its `popover` theme target,
  its surface padding, and conditional internal scrolling once the layer has
  capped the surface (`component:Popover` FR4, ORD4).

**Why no existing record can hold it**

- [`architecture:layer-runtime`](../../architecture/layer-runtime.md) is
  `current` and describes the layer runtime as shipped; it incorporates an
  accepted layer change only as that change ships (`spec:AST-003` is its
  precedent). A `current` record carries one `authority` value, so an
  unshipped behavior written into it would read as both approved and shipped
  (`architecture:knowledge-contracts` INV1, INV14). The architecture-record
  deltas this record requires are listed under Current-state impact.
- `component:Popover` is `current` and records Popover's shipped behavior,
  including viewport fitting (its FR3, ORD2, ORD3). The same authority rule
  applies; its deltas are listed below.
- `component:DropdownMenu`, `component:BaseTypeahead`, and the other
  composing components are consumers of the behavior, not owners of it. One
  rule binding five-plus components through one hook is a system fact.

## Non-goals

- **Sizing a standard layer to the room on one side of its trigger on the
  placement axis.** A layer taller than the room both above and below its
  trigger is capped to the viewport and shifted into it. Whether standard
  layers prefer the roomier side is not settled here; a layer that keeps its
  anchor clear is the one case FR4 settles, and the software keyboard caps
  a layer that would run under it (FR9).
- **Fullscreen Dialog.** It keeps the same gutter value by convention but is
  not an anchor-mode layer; whether the app-declared inset (FR6) reaches it is
  a later decision. The toast viewport does read it (FR6, DEC-5).
- **Public docs for the reduced behavior where CSS Anchor Positioning is
  absent.** `spec:AST-003` FR21–FR23 own that boundary.
- **Component scrolling, measurement, focus, dismissal, visual treatment, and
  theming anatomy.** They stay with their owners.
- Equivalent internal implementations remain valid when they satisfy this
  contract. Module names, the mechanism that observes anchor visibility, which
  CSS properties carry the cap, and the custom properties through which the
  provider's inset reaches a layer are implementation; `LayerProvider.inset`
  is the public surface, and a property written by hand is an unsupported
  escape hatch.

## Requirements

- **FR1 — One gutter.** Every anchor-mode layer keeps a gutter from each
  viewport edge equal to `max(--spacing-4, env(safe-area-inset-<edge>))` plus
  that edge's app-declared inset (FR6). The inline gutter reads the larger of
  the two physical safe-area insets, so a layer that flips across the inline
  axis still clears a notch on either side. The definition lives in the layer
  runtime; no component or family defines its own.
- **FR2 — The cap is the viewport, never the span.** On the alignment axis, a
  layer box's size is capped to the viewport minus both gutters, and the box
  never exceeds that cap. The span of viewport beside the trigger never caps a
  layer. An explicit size the caller gives renders at that size up to the cap.
  A content-sized layer wraps its content to the room beside its trigger when
  the content can wrap, and keeps its content's size up to the cap when it
  cannot (FR4 then moves it). Content that cannot fit the cap — an explicit
  size wider than the viewport, an unbreakable run — overflows inside the
  layer box, where the composing component decides whether it scrolls or
  clips; the box itself stays on screen. The layer does not know, and does not
  need to know, whether a size was given; no component branches on it. A
  composing component may cap lower (Tooltip's 300px); it may not cap higher.
- **FR3 — Placement-axis cap.** On the placement axis, a layer box's size is
  capped to the viewport minus both gutters, and the box never exceeds it.
  A composing component may cap lower (DropdownMenu's 300px) and may become a
  scroll container when its content exceeds the cap; it may not cap higher.
- **FR4 — The runtime's fallback orders.** An anchor-mode layer tries, in order:
  its preferred position; the flip across the placement axis; the flip across
  the alignment axis; both flips; then, while its anchor is in view, a slide
  along the alignment axis that keeps the layer's size and moves it the least
  distance that brings it inside the gutters, on the preferred side of the
  trigger first and the opposite side second. The slide is a position option
  of its own, not a side effect of the flips failing: a layer wider than the
  room beside its trigger on both sides still reaches the side of the trigger
  that has room on the placement axis. Side placements slide along the block
  axis. The gutter bounds position as well as size on both axes: a layer that
  would end inside a gutter, or under a declared bar, does not fit there and
  the next option is tried; a slid layer keeps the gutter on both edges. On
  the placement axis that positional bound is the larger of the axis's two
  gutters, applied to both edges, so a bar declared on one block edge keeps a
  layer the same distance from the opposite edge (the size cap still
  subtracts each edge's own gutter). Content taller than either side can hold
  is capped to the viewport and shifted into it, keeping its anchor clearance
  from the edge it meets. A layer that keeps its anchor clear — Tooltip, which
  the hover on its trigger keeps open — never settles over its anchor, and
  no painted frame shows it there except the one FR8 allows when a same-size
  anchor moves on screen, in layout or by a scroll. When the order above leaves
  its box over the anchor or, while the anchor is in view, past the viewport
  on the block axis (engines differ in where they leave a box that fits no
  option: one shifts it over the anchor, another leaves it on its preferred
  side, partly off-screen), an above or below layer tries instead beside the
  anchor on the inline end, then on the inline
  start, each at its content's inline size and capped to the viewport, then
  the opposite block side at its own size, and only then the preferred block
  side and the other, each only while it is the side with more room and sized
  to the room on that side. A layer whose content fits on some side keeps its
  own size there; only content taller than the room on both sides is sized to
  a room. No option is sized to whatever room is left, because a browser keeps
  an open layer on the option it last used for as long as that option still
  fits: when its anchor moves, the layer moves to the side that is now roomier
  rather than shrinking to a sliver. Whether the first list has failed is read
  from the layer's settled box, without the transform its entry animation
  applies while it enters. It scrolls what it cannot show, and only
  then, so a layer that fits stays a plain box (FR3). Once switched, it keeps
  the second list until it next opens; a switch that the engine does not apply
  at once places it afresh from the second list in the same frame, without
  closing it, and so does a later read that finds it failing again, because
  no engine re-runs the list when a scroll carries the anchor. Every CSS
  animation and transition of the layer and its content keeps every writable
  member the engine exposes on it and its effect, its timing, keyframes, play
  and replace state, and its time. Three things are not kept: the Animation
  and effect objects (the browser replaces them, with their listeners and
  promises, and fires cancel and start events), a finished animation's start
  time (its held end time is kept), and a transition's own object (a script
  animation resumes it, so it fires no `transitionend`).
  Chromium tries no more than five position
  options, so this is a second list that replaces the first, not an extension
  of it. The runtime authors both orders; a component passes no fallbacks of
  its own to an anchor-mode layer.
- **FR5 — An off-screen anchor holds.** A layer whose anchor has left the
  viewport does not slide. It keeps the position the flips give it and its
  size until the anchor returns (DEC-3).
- **FR6 — The app declares a floating bar once, on `LayerProvider`.** An app
  that keeps a persistent bar floating over a viewport edge declares its
  extent per logical edge through `LayerProvider`'s `inset` — `blockStart`,
  `blockEnd`, `inlineStart`, `inlineEnd`, each a pixel number or a CSS length
  — beside the provider's `toast` configuration. Every edge defaults to zero.
  Each declared edge adds to that edge's gutter (FR1) for every anchored layer
  under the provider and moves the toast viewport by the same amount, so one
  bar is declared once and cleared by both (DEC-5). A `toast.inset` edge, when
  set, replaces the provider's value for the toast viewport on that edge. A
  layer or toast with no provider renders exactly as one under a provider with
  the default inset. The declaration reaches a layer wherever the layer is
  hosted — a layer portaled out of its JSX position receives it the same as
  one hosted in place. A provider nested under another is otherwise inert, but
  one that declares an inset narrows it for the anchored layers in its
  subtree; the toast viewport is the root provider's and reads the root's
  declaration. The inset is app state, not a theme value (DEC-4).
- **FR7 — Consumers inherit; a consumer's own size rule cannot defeat the
  cap.** Every component that renders through `useLayer` in anchor mode or
  through `usePopover` receives FR1–FR6 and FR8–FR10 with no record change and no
  option to pass. A component that sets its own minimum size — trigger
  matching, a `menuWidth` applied as a minimum — clamps that minimum with the
  runtime's cap expression, because a CSS minimum otherwise wins over a
  maximum.
- **FR8 — The first frame is the settled frame.** A layer MUST NOT paint at a
  geometry it is about to correct. Every input to a layer's geometry under
  this record — the gutter, the caps, the declared inset, the fallback order —
  is resolved by the browser's style and layout in the same frame as the
  render that produced it; apart from the one case below, the runtime
  measures nothing after paint to apply them. The runtime makes three
  observations: the two below and the software keyboard's cap (FR9, FR10). Whether the anchor is in view
  (FR5) is read before the layer's first paint and thereafter only when the
  anchor's visibility changes, so a layer opened while its anchor is already
  out of view holds from its first frame. For a layer that keeps its anchor
  clear (FR4), whether its settled box (without its own transform) covers its
  anchor or leaves the viewport, and whether its content overflows the box, are
  read in the same
  call that shows or remounts it, and again while it is open whenever its size,
  its content's size, its anchor's size or the viewport changes, including
  after the caller replaces the anchor element while the layer stays open;
  each of those reads lands before the next frame paints. A same-size anchor
  that moves on screen, in layout (content above it grows, a margin changes)
  or because something scrolled, is reported by no observer that runs before
  paint, and a scroll event fires before the layer has followed its anchor;
  the runtime learns of the move from an intersection observer on the anchor,
  which reports after paint, so on that one path at most one painted frame
  shows the layer over its anchor before the next frame corrects it. An
  anchor that a scrolled container hides is followed again when it comes
  back into view, which a second intersection observer reports. The runtime
  polls nothing. When a declared inset changes while a layer is open,
  the layer
  and the declaration
  change in the same frame.
  Latency between an app measuring its own bar and declaring the result is the
  app's; the runtime renders what is declared, when it is declared. Apart from
  that one-frame correction and FR10's change of the keyboard cap, which waits
  for the keyboard to arrive or a press to finish, a paint-then-shift is a
  failure of this contract, not a quality concern. The
  software keyboard's cap (FR9) is read from the layer's own box without its
  entrance transform, as FR4 reads it, so an entrance in progress never needs a
  second read: before the first paint when a layer opens with a keyboard up, when the
  keyboard moves (FR10), and in the commit that
  brings a layer element the runtime swapped in while the layer is open.
- **FR9 — The software keyboard caps a layer that would run under it.**
  While
  a software keyboard covers the bottom of the viewport, an anchor-mode layer
  whose block-end edge would run under it keeps its block-start edge and caps
  its block size so that edge sits 10 px above the keyboard, the clearance
  UIKit keeps under a popover. Its content overflows inside the layer box,
  where the composing component scrolls it, and the field being typed into
  stays in view. A layer the keyboard does not reach, and a layer whose
  block-end edge the fallback order holds (placed above its trigger), stay as
  they are. The keyboard's height is the keyboard module's one height
  (`architecture:react-component-runtime` INV11); no layer measures the
  keyboard on its own.
  The cap folds into the block-axis cap (FR2 or FR3, whichever caps the
  block axis), so the layer box and every
  surface inside it capped by that definition shrink together. Each layer
  carries its own cap on its own element: a layer opened inside a capped
  layer is capped only for its own box, never by its host's.
- **FR10 — The keyboard cap changes where the keyboard hides the change.**
  A
  box's height cannot change on the compositor, so the cap changes once per
  keyboard movement: when a rising keyboard has arrived, at once as a falling
  keyboard starts down, and at once for a keyboard that changes without
  moving. A change that would move the layer under a press in progress inside
  it waits for that press's click.

### Platform support

- Supported feature/engine floor: CSS Anchor Positioning (`position-area`,
  `position-try-fallbacks`, `anchor-size()`) and the Popover API, as
  `architecture:layer-runtime` already requires for anchor mode. FR5 needs
  the runtime to know whether the anchor is in view; a synchronous read before
  first paint plus an observation while open is the layer's mechanism to own.
- Unsupported behavior: without anchor positioning, FR1–FR3 still bound a
  layer's size to the viewport; FR4 and FR5 have no fallbacks to order and do
  not apply. This is the reduced behavior `spec:AST-003` FR22 describes, not
  an equivalent.
- Browser evidence: rendered geometry in real Chromium for each Layer story
  below, at a desktop viewport and at a phone's — the layer's bounding
  rectangle against the viewport, its gutters, and its size before and after a
  flip or slide — and, for FR8, the rectangle of the first painted frame read
  synchronously after the opening commit and compared with the settled one.
  Emitted style strings prove the definition is shared; they do not prove a
  layer landed on screen or that it did not move.

## Current-state impact

### `architecture:layer-runtime` (`current`)

When this ships:

- Positioning: replace "Popover adds component-specific viewport sizing and
  overflow behavior above this geometry. Those constraints are not universal
  Layer behavior." with the gutter, cap, fallback order, and app-declared
  inset of FR1–FR6 as shipped behavior; state that the slide applies to every
  alignment while the anchor is in view and that an off-screen anchor holds.
- INV3 becomes "Anchor mode owns logical placement, fallbacks, and the
  viewport inset; custom mode owns its geometry; fixed mode owns explicit
  coordinates."
- Add an invariant for FR1 and FR7: the gutter has one definition, every
  anchor-mode layer inherits it, and a consumer minimum is clamped by it.
- INV10 stays true and says so plainly: `LayerProvider` is configuration —
  Toast and the viewport inset — not a layer host; a layer reads the inset
  from the provider's context and carries it on itself, so hosting never
  decides whether it arrives, and no layer resolves placement through it.
- Add an invariant for FR8: no geometry input is measured after paint and
  then applied; the first painted frame is the settled frame. The one
  exception is FR8's one-frame correction for a layer that keeps its anchor
  clear when a same-size anchor moves on screen, in layout or by a scroll.
- INV11 and INV12 add the software keyboard's cap (FR9) and FR10's timing:
  the cap is read from the layer's own box without its entrance transform when
  the keyboard moves, and it changes once per keyboard movement, a permitted
  paint-then-shift beside the anchor-move frame.
- Owning code: add the module that holds the gutter and cap expressions,
  `LayerProvider` as the owner of the declared inset, and the module that
  owns the software keyboard's cap on an open anchor-mode layer.
- Change coupling: a keyboard-cap change verifies the cap's timing, a layer
  opened with the keyboard up, and the layers it leaves alone.
- Change coupling: the positioning row already names viewport-edge fallbacks;
  add explicit-size, content-size, neither-side-fits, and off-screen-anchor
  states, and the app-declared inset.
- Verification: add the Layer stories as the rendered evidence for the new
  invariant and for INV3; name the explicit-width story's failure signal (a
  layer narrower than its given size).
- `deciding_specs`: add `spec:AST-059`.

### `component:Popover` (`current`)

When this ships:

- Ownership boundary, Owns: remove "viewport fitting, safe-area gutters" from
  the third bullet; it keeps focus destination, match-trigger sizing,
  conditional internal scrolling, and the measurement lifecycle.
- Ownership boundary, Does not own: add the viewport inset — gutter, size
  caps, fallback order, app-declared inset — owned by
  `architecture:layer-runtime`.
- Public concepts, "Placement and fit": becomes "Placement and preferred
  size" — Popover owns the preference (explicit width, else trigger minimum);
  the cap and fit are the layer's.
- FR3 is retired; its claim moves to this record's FR2 and FR3.
- ORD2 becomes: "An explicit width wins over trigger matching. Without
  explicit width, Popover prefers trigger minimum width, clamped by the
  layer's cap (`spec:AST-059` FR7)." The sentence about viewport and
  safe-area capping is removed.
- ORD3 is retired; the viewport fit is the layer's. ORD4's overflow
  evaluation follows the layer's cap.
- AV4 drops "available viewport size" from what Popover varies.
- Design relationships: the Popover surface "carries scroll, focus, and
  dialog behavior"; fit is removed.
- Verification map: the FR3/FR4 row becomes FR4 only; its Storybook
  reference points at the Layer stories for geometry and keeps Popover's
  overflow story for scrolling.
- `width` is an ordinary CSS width clamped by the layer's cap. Popover's one
  sizing branch is its own — explicit width, else trigger-matching minimum —
  and nothing in it depends on whether that width fits beside the trigger.

### What the other consumers inherit without a record change

- `DropdownMenu` and `DropdownMenuSubMenu` read the runtime's gutter. An
  explicit `menuWidth` is a minimum clamped by the viewport cap (FR7), never
  by the room beside the trigger; the menus' 300px block cap is a lower cap
  FR3 permits.
- `BaseTypeahead` reads the runtime's gutter; `menuWidth` and its
  match-trigger minimum are both clamped by the viewport cap (FR2, FR7).
- `PowerSearch` clamps its 400px editor floor with the viewport cap (FR7).
- `ComplexSelector` keeps 480px and `TopNavMegaMenu` keeps the room below its
  trigger as lower caps on the placement axis (FR3).
- `Tooltip`, `HoverCard`, `ContextMenu`, the Selector family, `TabMenu`, the
  TopNav menus, and the date inputs render through anchor mode or
  `usePopover` and receive FR1–FR5 with no change of their own. A layer that
  fits is unchanged; one that would overflow the viewport is capped, flipped,
  or slid. Tooltip also keeps its anchor clear (FR4) and scrolls content
  taller than the room it is given (FR3).
- `ToastViewport` positions itself at the provider's inset on each edge; its
  own `inset` keeps its meaning as the per-edge override (FR6, DEC-5).

## Verification

Stories live under `Core/Layer` as "Viewport inset: …" and run in real
Chromium under the story play guard at two viewports, 1280×900 and a 390×844
phone; each is a claim a person can open and look at. Every one of these
stories reads the layer's rectangle synchronously after the opening commit —
the geometry the first frame paints — and again after two animation frames,
and fails on any difference (FR8). Popover's stories keep only what is
Popover's: its match-trigger preference, scrolling, focus, dismissal, and
surface styling. A playground story with a draggable trigger and live width,
placement, and alignment controls exists for exploration; it is not evidence
for any row.

| Contract      | Verification                                                                                                                                                                                                                        | Representative states                                                                                                                                                                                      | Mutation or failure expectation                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR7      | One gutter module; a source scan for a second gutter or a `100%`-of-span cap among anchor-mode layers; story "the gutter" at both viewports                                                                                         | Default gutter at every edge; a wrapping layer beside a trigger flush with the edge                                                                                                                        | A second gutter constant among anchor-mode layers, or a layer inside the 16px gutter                                                                                                                    |
| FR2           | Stories "explicit size near an edge (352px)", "content-sized, fits beside the trigger", "content-sized, does not fit beside the trigger", "neither side fits" at both viewports; clamp strings in Popover and DropdownMenu suites   | 352px end-aligned on a trigger 45px from the edge; a short content-sized layer; an unbreakable run wider than a phone; a 1000px layer on a phone, where the cap is 358px                                   | A layer narrower than `min(asked, cap)`, a layer box wider than the cap at any viewport, or `100%` of the anchor span in a cap                                                                          |
| FR3           | Story "taller than the viewport" at both viewports; the runtime's viewport-fit style on every anchor-mode layer                                                                                                                     | Content 2000px tall                                                                                                                                                                                        | The layer box's block size exceeds the viewport minus gutters                                                                                                                                           |
| FR4           | Stories "content-sized, does not fit beside the trigger", "trigger near an edge flips", "neither side fits", "trigger near the bottom flips above", "wide layer, trigger near the bottom" at both viewports                         | A flip to end alignment at content size and at an explicit size; a 1000px layer slid inside the gutters where it fits; a block flip with room only above; a block flip when the inline axis is also capped | A layer squeezed into the span, a flipped edge off the trigger's edge, a layer outside the gutters on either axis, or a layer left on the side with no room                                             |
| FR4, Tooltip  | The `TooltipTallContent` and `TooltipTallContentTracking` real-engine suites (Chromium, WebKit) at 1280×720 and 390×700; the runtime's anchor-clear unit suite                                                                      | A 60-line tooltip mid-page (beside it); on a phone, trigger in the upper or lower half (roomier side); a fitting tooltip; content growth, host move, trigger move by layout or scroll, replaced trigger    | Covers its trigger in a frame (past the first after a same-size trigger moves by layout or scroll), closes under a resting pointer, leaves the viewport, won't scroll, or a fitting tooltip moves       |
| FR5           | Stories "anchor leaves the viewport" and "anchor already off-screen when the layer opens"; the runtime's anchor-visibility unit suite                                                                                               | Horizontal scroll carries the trigger out of view while the layer is open, then back; a layer opened with its anchor already off-screen                                                                    | The layer slides toward the viewport edge after the anchor is gone, changes size, does not return with its anchor, or opens pinned to the edge                                                          |
| FR6           | Stories "app-declared inset (floating bar)" and "layer portaled out of its JSX position"; `LayerProvider` and `ToastViewport` unit suites                                                                                           | An 80px bar declared as `inset={{blockEnd: 80}}`; a toast under the same provider; a `toast.inset` override; no provider; a layer hosted outside the paragraph it was rendered in                          | A layer or toast ends under the bar, an unset edge moves anything, a `toast.inset` edge stops overriding, no-provider geometry differs from the default provider's, or a portaled layer loses the inset |
| FR8           | Every story above (first frame compared with settled); stories "inset changes while the layer is open", "layer opens in the frame the inset arrives", "inset measured by the app", "anchor already off-screen when the layer opens" | The provider's inset changes 80→160 with the layer open; a layer mounted open in the provider's first commit; a bar the app measures before paint and declares; an off-screen anchor at open               | The first frame's rectangle differs from the settled one, or the first frame after a declaration change is not already at the new geometry                                                              |
| FR9           | `useLayerKeyboardClearance.test.tsx`; Popover's keyboard browser proofs in Chromium and WebKit with a stand-in keyboard; the iOS simulator                                                                                          | A tall Popover below its trigger with a field; a keyboard already up at the open; a short layer; a layer above its trigger                                                                                 | A capped layer ending under the keyboard or more than 10 px above it, an unreached layer that changes, a bottom-held layer that moves, or a layer measuring the keyboard itself                         |
| FR10          | `useLayerKeyboardClearance.test.tsx`; Popover's keyboard browser proofs                                                                                                                                                             | A rising keyboard before and after it arrives; a falling keyboard; a keyboard that changes at once; a tap on Save as the keyboard falls                                                                    | A cap written while the keyboard rises, kept as it falls, or taken off under a press before its click                                                                                                   |
| FR1 safe area | A device run: `env(safe-area-inset-*)` is set only by a real device and Chromium emulation does not populate it, so no Storybook story can show it.                                                                                 | Landscape phone with a notch on one side                                                                                                                                                                   | A layer under the notch                                                                                                                                                                                 |

**Verification gap — VG1.** A layer that had to slide (it fit on neither
side of its trigger) and whose anchor leaves and returns can come back
start-aligned to its anchor and off-screen until its next layout: Chromium
does not re-run the slide when the off-screen pin is withdrawn. The "anchor
leaves the viewport" story asserts the return only where the layer fit beside
its trigger. FR5's hold is verified; the return after a slide is not.

The first-frame assertion observes style and layout after the commit and
before any animation frame; it cannot observe compositor-only effects, and a
shift produced by an input outside this record (the app re-laying out its
own bar after paint) is reported as the app's.

## Decision log

### DEC-1 — The layer owns the viewport inset; Popover is an application of it

**Reference:** `spec:AST-059/DEC-1`
**Decider:** Cindy Zhang, 2026-10-03

The layer runtime owns the viewport inset behaviors, their specification, and
their stories. Popover is an application of the layer that adds styling
considerations on top. A gutter defined once cannot drift; a fallback list
authored once cannot be extended by one component for its own case; a person
sees the same edge behavior from a menu, a popover, a typeahead, and a
tooltip, apart from the anchor-clear order FR4 gives a tooltip, which the
runtime also authors.

Rejected: a shared constant each component imports while keeping its own fit
styles — it removes the drift and keeps the ownership problem.

### DEC-2 — A content-sized layer wraps if it can and moves if it cannot

**Reference:** `spec:AST-059/DEC-2`
**Decider:** Cindy Zhang, 2026-10-03

A content-sized layer fits beside its trigger by wrapping its content into the
room there, as an auto-width positioned box does on its own. A size that
cannot shrink — an explicit width, a `menuWidth`, a label that does not wrap —
keeps its size and moves: it flips to the other side, and when neither side
fits it slides along the alignment axis into view (FR4). No size is ever capped
to the span beside the trigger, so the runtime needs no knowledge of whether a
size was given, and `Popover.width` and `DropdownMenu.menuWidth` are ordinary
CSS sizes clamped only by the viewport.

Rejected: forcing every content-sized layer to its `max-content` width so it
always moves rather than wraps — prose beside a trigger would open as wide as
the viewport.

### DEC-3 — An aligned layer does not slide toward an off-screen anchor

**Reference:** `spec:AST-059/DEC-3`
**Decider:** Cindy Zhang, 2026-10-03

The slide (FR4) serves a visible trigger whose layer fits on neither side. Once
the anchor has left the viewport, the layer holds the position the flips give
it and holds its size (FR5). A layer that kept sliding would pin itself into
the narrowest strip at the edge, giving up room it had a moment earlier for
an anchor nobody can see. The condition belongs in the ordering rules, not
left to emerge from a fallback list.

Rejected: closing the layer when its anchor leaves — a product decision about
staleness, not a geometry rule, and it takes the layer from a person reading it.

### DEC-4 — An app's floating bar is app state, not a theme value

**Reference:** `spec:AST-059/DEC-4`
**Decider:** Cindy Zhang, 2026-10-03

A persistent bar floating over a viewport edge is a fact about an app's
shell — whether it exists and how tall it is — and two apps sharing one theme
differ on it. The app therefore declares it as provider configuration
(`LayerProvider.inset`, FR6), not through `defineTheme`. There is no `layer`
theme target: a theme target is a component's anatomy vocabulary, and the
layer has no painted anatomy of its own; the gutter is geometry, not
treatment.

Rejected: routing the inset through the `popover` theme target — one
component's theme would govern every other consumer. Rejected: a per-layer
prop — the bar would be restated on every surface, and two could disagree.
Rejected: hand-written CSS custom properties as the public surface — untyped,
undiscoverable beside `toast`, and unable to carry a default.

### DEC-5 — One declaration serves toasts and anchored layers; zero is the default

**Reference:** `spec:AST-059/DEC-5`
**Decider:** Cindy Zhang, 2026-10-03

`LayerProvider.inset` is the provider-level declaration. The toast viewport
and every anchored layer under the provider read it, because a bar at a
viewport edge is one physical obstruction and the provider is already where
an app says there is something at an edge. `toast.inset` stays as the
toast-only override: on an edge it sets, it replaces the provider's value for
the toast viewport, so a toast may clear more or less than a layer when an app
asks for that, and an app that set `toast.inset` before this record sees its
toasts exactly where they were. The two are never added: adding would clear
the same bar twice in the common case.

The default is zero on every edge, as a decision: the system already knows
the device's own edges and carries them in the gutter (FR1, `env()`); only the
app knows the bars it draws, and a non-zero default would move every layer in
every app for a reason no one could find in that app. A surface with no
provider is a surface under the default provider.

Rejected: a shared inset that the toast cannot override — a toast that must
clear a control an anchored layer may cover would have no route.

### DEC-6 — The runtime caps a layer above the software keyboard, holding its start edge

**Reference:** `spec:AST-059/DEC-6`
**Decider:** `cixzhang`, `2026-10-26`

A layer that would run under the software keyboard is capped by the layer
runtime, for every anchor-mode layer at once, from the keyboard module's one
height: the keyboard narrows the viewport the way the gutter does, and a rule
that one component applies leaves every other layer under the keyboard. The
capped layer keeps its block-start edge and ends 10 px above the keyboard, as
a UIKit popover does.

Rejected: the keyboard as a declared block-end inset (FR6), because the
fallback order applies a block inset to both block edges (FR4).

## Open questions

None. Every decision above is the owner's.
