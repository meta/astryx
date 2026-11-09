---
schema_version: 1
template_version: 3
kind: architecture
id: architecture:list-windowing
authority: current
archive_reason: null
superseded_by: null
approved_by: humbertovirtudes
approved_at: 2026-11-08
owners: [cixzhang]
applies_to:
  [
    packages/core/src/Selector/,
    packages/core/src/Table/,
    packages/core/src/Chat/,
    packages/core/src/ScrollableArea/,
    packages/core/src/hooks/useScrollableArea.ts,
  ]
verified_by: [scripts/check-knowledge.mjs]
deciding_specs: []
---

# List windowing architecture

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Governing contract      | None. Each consumer's record owns what a person sees and hears in its long list; this record owns only which module computes the window.                                                  |
| System behavior         | One shared internal windowing module owns long-list windowing in Core. Table virtualization is its first consumer, then Selector, then Chat. The module is not public API (INV1, INV2).   |
| End-user impact         | None yet: the module does not exist, and Selector renders every option. Once it ships, people opening a long list wait less, and every windowed list behaves the same way.                |
| Builder impact          | A Core component that windows a long list calls the one module and attaches it to its scroll area's viewport ref or to the page (FR6). No public windowing hook exists while OQ1 is open. |
| Compatibility/readiness | Additive and internal. Spec only: no module exists yet (Current-state impact). Table's approved virtualization hook keeps its public shape.                                               |
| Review checks           | Reject a second windowing implementation in Core, a public export of the module, or a change to Table's public virtualization shape made to adopt it.                                     |
| Governing rules         | DEC-1–DEC-5; `spec:AST-025` FR1, FR3, FR5, FR8–FR9, FR12–FR15, FR18, FR20–FR21.                                                                                                           |

This table is a review projection; the body below is authoritative.

## Purpose

Long lists in Core render only the rows a person can see. This record gives
that job one owner, so each component that windows a list shares one
implementation instead of keeping its own.

## System model

A windowed list renders the rows that cover its visible scrollport, plus a few
rows past each edge, and sizes its scroll range for the full list. The shared
windowing module computes which rows render and where the scroll range ends.
Each consumer keeps its own records for when it windows, what it renders, and
how it exposes the full list to assistive technology. The list scrolls in one
scroll owner, a scroll area or the page, and the owner's scrollability decides
whether the list windows at all (FR5–FR19).

Consumers, in adoption order:

1. Table's row virtualization, behind `module:Table/useTableRowsVirtualization`.
2. Selector's option list.
3. Chat's message list.

## Requirements

- **FR1 — Configurable anchoring.** The shared windowing engine anchors the
  window to the first visible row, to the end (follow), or to a given item, as
  the consumer configures.
- **FR2 — The anchored row keeps its position.** The anchored row keeps its
  position through streaming inserts, above it or at the end, and through item
  resizes.
- **FR3 — Variable row heights.** The engine positions rows of variable
  height.
- **FR4 — Container and page scroll.** The engine works inside a container
  scroll area and with page (document) scroll (INV4).

The engine is chosen by a measured comparison of candidates on performance and
row-position accuracy (DEC-3).

### Scroll owners: scroll areas and the page

A windowed list scrolls in one scroll owner: the viewport of a scroll area
that adopts the shared scroll capability of `spec:AST-025`, or the page. A
scroll area is `component:ScrollableArea`, or a component's own viewport
through `module:ScrollableArea/useScrollableArea` (`spec:AST-025` IR2, FR19).
The owner keeps everything `spec:AST-025` gives it. The engine computes which
rows render and keeps the anchored row in place (DEC-5).

- **FR5 — The owner owns the scroll box.** The owner keeps its overflow,
  size, padding, scrollbar presentation and gutter, keyboard access,
  overscroll chaining and Sticky containment (`spec:AST-025` FR12–FR15,
  FR20–FR21). The engine never creates a scroll container, and never writes
  overflow, `scrollbar-gutter`, `overscroll-behavior`, size or focusability on
  the owner. A classic scrollbar narrows the scrollport, not the window: the
  engine computes against the scrollport's client extent.
- **FR6 — Attachment is a callback `scrollRef` or the page.** The engine
  receives its scroller through a callback `scrollRef`. In a scroll area, the
  consumer passes it as the viewport's ref: ScrollableArea's `ref`, which
  reaches its root viewport (`component:ScrollableArea` FR1), or the ref given
  to `getViewportProps`. The engine attaches its listeners outside React render
  when the callback receives the element, and detaches them when it receives
  `null` or another element. A list that scrolls with the page attaches to
  `'page'`, the document's scrolling element. A list has one attachment, and
  the engine never discovers its scroller from incidental overflow
  (`spec:AST-025` FR18). An element that no scroll area registers gives the
  engine no scrollability state: the list renders every row and the engine
  reports one development diagnostic.
- **FR7 — Scrollability decides whether the list windows.** The owner's
  effective scroll state on the list's axis is the only source of truth: the
  axis's `isScrollable` in `ScrollableAreaState`
  (`module:ScrollableArea/useScrollableArea`). While the axis does not scroll,
  the list renders every row and no spacer. While it scrolls, the list
  windows. For the page, the axis scrolls when the root scroller's extent on
  it exceeds its client extent by more than 1 CSS pixel, the tolerance of
  `spec:AST-025` FR3. A scroll area that grows with its content never scrolls,
  so a list in it renders every row; a list that windows there attaches to
  the scroller that does scroll.
- **FR8 — Unknown is not fitting.** Before the owner's first measurement, and
  while it is unmeasurable (`spec:AST-025` FR8), the list renders a bounded
  first window from its anchor and reserves the full list's scroll extent. It
  never renders the whole list because no state exists. While a scroll lock
  holds the page, the window stays as it is.
- **FR9 — Crossing the threshold moves nothing.** When content grows past the
  scrollport, mid-stream included, windowing turns on in the frame the owner
  publishes that its axis scrolls. When content shrinks to fit, every row
  renders again. In both directions the anchored row (FR1) keeps its position,
  and measured rows keep their sizes in the scroll extent. A windowed list
  keeps the full list's scroll extent, so turning windowing on never makes the
  owner fit again (`spec:AST-025` FR9).
- **FR10 — Each box has one observer.** The owner observes its viewport and
  content box (`spec:AST-025` FR5). The engine reads the owner's state and
  never observes either box. The engine observes only its rendered rows'
  sizes (FR3), through Core's shared resize observer, never an observer of its
  own. On the page, the engine observes the page geometry it needs through the
  same shared observer.
- **FR11 — Layout reads stay in one pass.** After a scroll, the engine reads
  its scroller's scroll offset at most once per frame, in one measurement pass
  before its writes. It reads the list's offset inside the owner's content box
  once per content-box change, never per scroll. These are the reads
  `architecture:react-component-runtime` INV18 permits on the scroll path.
- **FR12 — The window covers the whole scrollport.** The window covers the
  owner's full scrollport, the area under its sticky headers and footers and
  its content-box padding included, plus overscan. Content and padding above
  the list shift where the list starts; the engine counts that offset and does
  not count it as rows. Aligning an item, for FR1's given-item anchor or a
  scroll to an item, honors the owner's computed `scroll-padding`. The
  component that renders a sticky header sets that inset; the engine never
  sets it.
- **FR13 — Edges belong to the full list.** The scroll range is the full
  list's, so the owner's edge state (`atStart`, `atEnd`) and what it drives,
  such as fade or shadow edges and scroll-state container queries
  (`component:ScrollableArea` FR4), report an edge only at the list's true
  start or end, never at the edge of the rendered window.
- **FR14 — Scroll anchoring stays out of the list.** While it windows, the
  engine turns the browser's scroll anchoring off on its own list root, and
  hands it back when it stops windowing. It writes this only through Core's
  scroll-anchoring owner module (`architecture:public-component-api` INV23).
  It never turns anchoring off on the scroller, so content outside the list
  keeps native anchoring. ScrollableArea never writes `overflow-anchor`.
- **FR15 — One writer moves the position.** The engine moves the scroll
  position only through native scroll APIs on the owner, for its anchor and
  for a scroll to an item. A component that scrolls a windowed list's owner
  programmatically does it through the engine's anchor, not by writing the
  position beside it. ScrollableArea has no imperative scroll API of its own;
  the engine treats a caller's native `scrollTo` like a person's scroll. While
  a person scrolls, the engine does not write the position.
- **FR16 — Keyboard scrolling stays native, and focus stays put.** Keyboard
  scrolling is the owner's native scrolling (`spec:AST-025` FR12): Arrow, Page,
  Home and End move the owner, and the engine renders the rows at the new
  position. End reaches the last row, and the end anchor (FR1) holds it there
  while rows measure. The row that holds focus stays mounted while it is
  outside the window. Turning windowing on or off never moves or blurs focus
  (`spec:AST-025` FR13).
- **FR17 — Nested scrollers.** A list windows against its attached scroller
  only. In a scroll area inside a scrolling page, the list attaches to the
  area: page scrolling moves the area and does not change the window, and the
  area's chaining passes gestures outward at its edges (`spec:AST-025` FR14).
  A scroller on the other axis does not change the window. A list attached to
  `'page'` whose nearest scroll area on its axis scrolls renders every row and
  reports one development diagnostic, because its attachment names the wrong
  scroller.
- **FR18 — Momentum and overscroll belong to the platform.** The engine does
  not write the scroll position during touch momentum or an overscroll bounce.
  It applies a pending anchor correction when the scroll ends, and FR2 holds
  again from then. An offset past either edge during a bounce counts as that
  edge, so a bounce never renders blank rows or a window past the list.
- **FR19 — Logical axes, RTL included.** The engine computes the window,
  offsets and spacers through the scroller's direction and writing mode, as
  the owner does (`spec:AST-025` FR1; `module:ScrollableArea/useScrollableArea`
  FR3). In right-to-left text, an inline-axis list starts at its inline-start
  edge and counts offsets from there; spacers use logical properties.

## Boundaries and invariants

- **INV1 — One windowing module in Core.** In `@astryxdesign/core`, one shared
  internal module owns long-list windowing. A component that windows a long
  list uses it and keeps no windowing implementation of its own. Snap-paged
  pane scrollers, such as the touch calendar's `MonthScroller` shared by
  DateInput and DateTimeInput (`paneWindow` in `monthGeometry.ts`,
  `component:DateInput` PR1), keep their own pane window and are outside this
  module.
- **INV2 — The module is private.** The module is not public API: it isn't
  exported from any public entry point; another Astryx package may reach it
  only through a Core `./internal/*` subpath (`spec:AST-017` FR21). This holds
  while OQ1 is open.
- **INV3 — Consumers keep their public shapes.** Adopting the module changes
  no consumer's public API. `module:Table/useTableRowsVirtualization` keeps its
  approved public shape and uses the module internally.
- **INV4 — Container and page scroll.** Every virtualizer, the shared engine
  and each consumer, works both inside a container scroll area and with page
  (document) scroll.
- **INV5 — Size budget.** The shared windowing engine stays at or under 4.9 KB minified and gzipped, the size of the smallest comparable full-featured library (virtua's Virtualizer plus WindowVirtualizer) built with the same settings (esbuild, ESM, minified, React external, gzip -9). Each component's adapter stays at or under 2 KB on the same measure. A change over either budget needs the owner's decision.

## Current-state impact

- **No module exists yet.** Selector renders every option when it opens.
  Table's virtualization hook is specified in
  `module:Table/useTableRowsVirtualization` but not built; Chat renders every
  message.
- **INV4 gap:** Table windows only inside its own bounded viewport; on a
  scrolling page or inside an outer scroll container it renders every row.
- **INV5 gap:** Table's adapter (controller and wiring) measures about 5.3 KB.
- **INV5 gap:** the chat virtualizer's own code measures 4.7 KB, with no split between shared engine and chat adapter.
- **FR7 gap:** ScrollableArea publishes its scrollability only inside its own
  hook call and as data attributes on its viewport; an engine attached to that
  viewport has no change it can subscribe to.
- **FR7 gap:** ChatLayout's scroller, its root or the element its `scrollRef`
  names, does not adopt the shared scroll capability, so it publishes no
  scrollability state (`component:ChatLayout`).
- **FR15 gap:** ChatLayout's follow-end writes the scroll position itself and
  turns scroll anchoring off on the whole scroller while it follows
  (`component:ChatLayout`); with the engine's end anchor (FR1) on the same
  scroller, two writers move one position.

## Change coupling

Review against this record when a change adds or alters windowing,
virtualization, or a rendered-row calculation in a Core list, or exports a
windowing symbol. Review against FR5–FR19 when a change attaches a list to a
scroll area or the page, or changes how ScrollableArea or `useScrollableArea`
publish scrollability, write scroll anchoring, or move the scroll position.

## Owning code

- `module:Table/useTableRowsVirtualization` — Table's public virtualization
  hook, the first consumer; it has no code yet (Current-state impact).
- `packages/core/src/Selector/` — the second consumer.
- `packages/core/src/Chat/` — the third consumer.
- `component:ScrollableArea` and `module:ScrollableArea/useScrollableArea` —
  the scroll owner a windowed list attaches to (FR5–FR19).

The module itself has no path yet (Current-state impact).

## Deciding specs

### DEC-1 — One shared private windowing module

**Reference:** `architecture:list-windowing/DEC-1`
**Decider:** `humbertovirtudes`, `2026-11-08`

One shared private windowing module owns long-list windowing in Core; spec
only. Table virtualization adopts it first, then Selector and Chat. The module
stays private while OQ1 is open.

### DEC-2 — Virtualizers work in container and page scroll

**Reference:** `architecture:list-windowing/DEC-2`
**Decider:** `cixzhang`, `2026-11-09`

> any visualizer engine needs to be able to attach to any scroll ref

> i want to instead require that visualizers should work in both container
> scroll areas as well as page scroll

The second statement refines the first; "visualizer" means virtualizer. Every
virtualizer works inside a container scroll area and with page (document)
scroll (INV4, FR4). No scroll-ref API is required.

### DEC-3 — Common engine requirements

**Reference:** `architecture:list-windowing/DEC-3`
**Decider:** `cixzhang`, `2026-11-09`

> In the common visualizer, anchoring will need to be configurable, scroll
> positions keep properly with streaming data, then i want to pick the engine
> with best perf and accuracy for row positions with variable height

"Visualizer" means virtualizer. The shared windowing engine meets FR1–FR4. The
engine is chosen by a measured comparison of candidates on performance and
row-position accuracy.

### DEC-4 — The windowing engine and its adapters have a size budget

**Reference:** `architecture:list-windowing/DEC-4`
**Decider:** `cixzhang`, `2026-11-09`

> Size budget ok

The owner approved the budget in INV5. It is set from the 2026-11-09 measurement of virtua's Virtualizer plus WindowVirtualizer, 4.9 KB with the same build settings.

### DEC-5 — Virtualizers attach to the scroll area or the page

**Reference:** `architecture:list-windowing/DEC-5`
**Decider:** `cixzhang`, `2026-11-09`

> we should maybe spec how virtualization should interact with scroll areas

> Problem with scroll container hook is it overlaps use scroll area

> Scroll areas also know when theyre actually scrollable

The scroll area of `spec:AST-025`, or the page, owns the scroll box. The
engine attaches to the area's viewport through a callback `scrollRef`, or to
the page, and the owner's scrollability decides whether the list windows
(FR5–FR19). The callback is the private engine's input (INV2); consumers pass
it to the viewport's existing ref, so no public scroll-ref API is added
(DEC-2).

Rejected: a scroll-container hook beside `useScrollableArea`, because it
measures what the area already measures.

## Open questions

- **OQ1 — Is the windowing module public (a hook) or internal only?** Not
  decided. Until it is, the module stays private (INV2).

## Verification

| Invariant  | Evidence                                                                                                                                              | Failure signal                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1       | Review of each Core list that windows (evidence gap: no module or automated check exists yet)                                                         | A Core component keeps its own windowing implementation beside the module                                                                             |
| INV2       | Public export review of every package entry point (evidence gap: no module exists yet)                                                                | The module, or a type only it uses, is reachable from a public entry point                                                                            |
| INV3       | The public-API report for `useTableRowsVirtualization` and each consumer (evidence gap: the hook is not built yet)                                    | Adopting the module changes a consumer's public props, types, or exports                                                                              |
| INV4       | Each consumer's windowed list inside a container scroll area and on a scrolling page (evidence gap: Table windows only inside its own viewport)       | A consumer renders every row, or places rows wrongly, when the page or an outer container scrolls                                                     |
| INV5       | the size check's dedicated budget entries for the engine and each adapter                                                                             | The engine measures over 4.9 KB, or an adapter over 2 KB, without the owner's decision                                                                |
| FR5, FR6   | Browser tests of a windowed list attached to a ScrollableArea viewport ref, to a hook adopter's viewport, to the page, and to an unregistered element | The engine writes owner styles, discovers a scroller, keeps listeners after detach, or windows against an unregistered element                        |
| FR7–FR9    | Browser tests that grow a list past its scrollport mid-stream and shrink it back, in an area and on the page, with a scroll lock                      | A fitting list mounts spacers, a scrolling list renders every row, the first render mounts the whole list, or the anchored row moves at the threshold |
| FR10, FR11 | Observer and layout-read traces of a windowed list while it scrolls and resizes                                                                       | A second observer of the viewport or content box, a per-instance observer, or more than one offset read per scrolled frame                            |
| FR12, FR13 | Browser tests with content-box padding, content above the list, a sticky header with `scroll-padding`, and edge state at both ends                    | Blank rows under a sticky header, an item aligned under the header, or an edge reported at the rendered window's edge                                 |
| FR14, FR15 | Browser tests of rows resizing above the anchor with native anchoring available, and of a programmatic scroll beside the engine                       | Native anchoring and the engine both move the content, anchoring turned off on the scroller, or a second writer moves the position                    |
| FR16       | Keyboard tests of Arrow, Page, Home and End in a windowed list, with focus on a row that leaves the window                                            | The last row is unreachable by End, a focused row unmounts, or focus moves when windowing turns on or off                                             |
| FR17       | Browser tests of a list in a scroll area inside a scrolling page, an orthogonal scroller, and a page attachment inside a scrolling area               | Page scrolling changes the area's window, gestures stop chaining, or a wrong attachment windows                                                       |
| FR18       | Real-device touch tests of momentum and overscroll bounce at both edges in a windowed list                                                            | Momentum stops at an engine write, or a bounce renders blank rows                                                                                     |
| FR19       | Browser tests in left-to-right and right-to-left text and in a vertical writing mode                                                                  | The window, offsets or spacers use physical sides                                                                                                     |
