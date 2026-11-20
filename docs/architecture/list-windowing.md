---
schema_version: 1
template_version: 3
kind: architecture
id: architecture:list-windowing
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-06
owners: [cixzhang]
applies_to:
  [
    packages/core/src/Selector/,
    packages/core/src/Table/,
    packages/core/src/Chat/,
    packages/core/src/virtualization/,
    packages/core/src/internal/virtualization.ts,
  ]
verified_by: [scripts/check-knowledge.mjs]
deciding_specs: []
---

# List windowing architecture

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Governing contract      | None. Each consumer's record owns what a person sees and hears in its long list; this record owns only which module computes the window.                                                                          |
| System behavior         | One shared internal windowing module owns long-list windowing in Core. The module is not public API (INV1, INV2).                                                                                                 |
| End-user impact         | People opening a long windowed list wait less, and every windowed list behaves the same way, inside a container scroll area or on a scrolling page; Table windows only inside its own bounded scroll area (INV4). |
| Builder impact          | A Core component that windows a long list calls the one module instead of building its own. No public windowing hook exists while OQ1 is open.                                                                    |
| Compatibility/readiness | Additive and internal. The module is `packages/core/src/virtualization/`. Table's public virtualization hooks keep their shape except for DEC-6's one rename (INV3).                                              |
| Review checks           | Reject a second windowing implementation in Core, a public export of the module, or a change to Table's public virtualization shape made to adopt it, other than DEC-6's one rename.                              |
| Governing rules         | DEC-1, DEC-2, DEC-3, DEC-4, DEC-6.                                                                                                                                                                                |

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
how it exposes the full list to assistive technology.

The module windows a list on either scroll axis. On the inline axis, each item
has its own width. The
consumer names the viewport space that its pinned items cover at each edge,
and the module plans only for the space between them. The module reads the
inline scroll position as a distance from the inline start, so a
right-to-left list windows the same way. On both axes, one shared focus island
keeps the focused item mounted outside the window.

Consumers:

- Table's row virtualization, behind `module:Table/useTableRowsVirtualization`.
- Table's column virtualization, behind
  `module:Table/useTableColumnsVirtualization`, on the inline axis.
- Selector's option list.
- Chat's message list.

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
  no consumer's public API, with one exception: `useTableRowsVirtualization`
  renames `viewportHeight` to `initialViewportHeight` (DEC-6), and
  `module:Table/useTableRowsVirtualization` changes with that rename. Apart
  from that rename, the hook keeps its approved public shape and uses the
  module internally.
- **INV4 — Container and page scroll.** Every virtualizer, the shared engine
  and each consumer, works both inside a container scroll area and with page
  (document) scroll. One exception: Table's virtualization windows inside
  Table's own bounded scroll area (`component:Table` FR19) until a later
  decision moves it to page or container scroll (INV4 gap).
- **INV5 — Size budget.** The shared windowing engine stays at or under 4.9 KB minified and gzipped (esbuild, ESM, minified, React external, gzip -9), the size of the smallest comparable full-featured virtualizer library on that measure. Each component's adapter stays at or under 2 KB on the same measure. An adapter's size is what windowing adds to a bundle that already holds its host component and the engine: its own code plus the wiring it adds inside the host component, with the engine, React and Core helpers the host already uses left out. A change over either budget needs the owner's decision.

## Current-state impact

- **The module is `packages/core/src/virtualization/`.** Other packages reach
  it only through `@astryxdesign/core/internal/virtualization`. Table's row
  virtualization (`module:Table/useTableRowsVirtualization`) and column
  virtualization (`module:Table/useTableColumnsVirtualization`) use it.
  Selector renders every option when it opens, and Core's Chat renders every
  message.
- **FR1 gap:** the shared module anchors the window only to the first visible
  row; the end (follow) and given-item anchors are not available.
- **FR3 gap:** the shared module positions block-axis rows at one shared
  pitch.
- **INV4 gap:** Table windows only inside its own bounded viewport; when the
  page or an outer container is its scroller, it renders every row.
- **INV5 gap:** Table's adapter (its virtualization plugin and column
  windowing, with their wiring) measures over 2 KB.
- **INV5 gap:** Lab's `ChatVirtualizer` measures about 5 KB in its own code. It
  does not use the shared engine, so it has no split between engine and chat
  adapter.

## Change coupling

Review against this record when a change adds or alters windowing,
virtualization, or a rendered-row calculation in a Core list, or exports a
windowing symbol.

## Owning code

- `packages/core/src/virtualization/` — the shared windowing module.
- `packages/core/src/internal/virtualization.ts` — its private entry for other
  packages.
- `module:Table/useTableRowsVirtualization` — Table's public row
  virtualization hook, a consumer.
- `module:Table/useTableColumnsVirtualization` — Table's public column
  virtualization hook, a consumer on the inline axis.
- `packages/core/src/Selector/` — a consumer.
- `packages/core/src/Chat/` — a consumer.

## Deciding specs

### DEC-1 — One shared private windowing module

**Reference:** `architecture:list-windowing/DEC-1`
**Decider:** `cixzhang`, `2026-11-06`
**Contributor:** `humbertovirtudes`, `2026-11-08`

One shared private windowing module owns long-list windowing in Core. The
module stays private while OQ1 is open.

### DEC-2 — Virtualizers work in container and page scroll

**Reference:** `architecture:list-windowing/DEC-2`
**Decider:** `cixzhang`, `2026-11-09 05:52:51 PT`

Every virtualizer works inside a container scroll area and with page
(document) scroll (INV4, FR4). No scroll-ref API is required.

Rejected: a caller-provided scroll ref.

### DEC-3 — Common engine requirements

**Reference:** `architecture:list-windowing/DEC-3`
**Decider:** `cixzhang`, `2026-11-09 05:51:04 PT`

The shared virtualizer has configurable anchoring and holds scroll positions
while data streams in. Its engine is the candidate with the best performance
and row-position accuracy for rows of variable height. The shared windowing
engine meets FR1–FR4. The
engine is chosen by a measured comparison of candidates on performance and
row-position accuracy.

### DEC-4 — The windowing engine and its adapters have a size budget

**Reference:** `architecture:list-windowing/DEC-4`
**Decider:** `cixzhang`, `2026-11-09 06:35:51 PT`

INV5's budget is set from the 2026-11-09 measurement of virtua's Virtualizer plus WindowVirtualizer, 4.9 KB with the same build settings.

### DEC-6 — Table's public windowing API changes only one name

**Reference:** `architecture:list-windowing/DEC-6`
**Decider:** `cixzhang`, `2026-11-09 06:52:28 PT`

Table's public windowing API changes only by the `initialViewportHeight`
rename. `useTableRowsVirtualization` keeps `rowHeight` and renames
`viewportHeight` to `initialViewportHeight`, which Table reads for the first frame only. Other
options (a callback scroll target, exact
or estimated item sizes, an anchor) reach Table's public API only through a
later owner decision.

Rejected: adding those options to Table's public API now.

The option stays required. The rename also stops it from setting Table's
height: the hook reads the measured height of Table's scroll area and never
defines it.

## Open questions

- **OQ1 — Is the windowing module public (a hook) or internal only?** Not
  decided. Until it is, the module stays private (INV2).

## Verification

| Invariant | Evidence                                                                                                                                        | Failure signal                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| INV1      | `packages/core/src/virtualization/useListWindow.test.tsx`; review of each Core list that windows                                                | A Core component keeps its own windowing implementation beside the module                               |
| INV2      | Public export review of every package entry point; the module is exported only from `./internal/virtualization`                                 | The module, or a type only it uses, is reachable from a public entry point                              |
| INV3      | The pull request's API delta for `useTableRowsVirtualization`, `useTableColumnsVirtualization` and each consumer                                | Adopting the module changes a consumer's public props, types, or exports, other than DEC-6's one rename |
| INV4      | Each consumer's windowed list inside a container scroll area and on a scrolling page (evidence gap: Table windows only inside its own viewport) | A consumer renders every row, or places rows wrongly, when the page or an outer container scrolls       |
| INV5      | The size check's dedicated budget entries for the engine and each adapter (evidence gap: no size check has these entries)                       | The engine measures over 4.9 KB, or an adapter over 2 KB, without the owner's decision                  |
