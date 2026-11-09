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
  ]
verified_by: [scripts/check-knowledge.mjs]
deciding_specs: []
---

# List windowing architecture

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Governing contract      | None. Each consumer's record owns what a person sees and hears in its long list; this record owns only which module computes the window.                                                |
| System behavior         | One shared internal windowing module owns long-list windowing in Core. Table virtualization is its first consumer, then Selector, then Chat. The module is not public API (INV1, INV2). |
| End-user impact         | None yet: the module does not exist, and Selector renders every option. Once it ships, people opening a long list wait less, and every windowed list behaves the same way.              |
| Builder impact          | A Core component that windows a long list calls the one module instead of building its own. No public windowing hook exists while OQ1 is open.                                          |
| Compatibility/readiness | Additive and internal. Spec only: no module exists yet (Current-state impact). Table's approved virtualization hook keeps its public shape.                                             |
| Review checks           | Reject a second windowing implementation in Core, a public export of the module, or a change to Table's public virtualization shape made to adopt it.                                   |
| Governing rules         | DEC-1, DEC-2, DEC-3.                                                                                                                                                                    |

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
- **INV5 gap:** a plain Table that never windows carries about 6.2 KB minified and gzipped of the windowing stack.
- **INV5 gap:** the chat virtualizer's own code measures 4.7 KB, with no split between shared engine and chat adapter.

## Change coupling

Review against this record when a change adds or alters windowing,
virtualization, or a rendered-row calculation in a Core list, or exports a
windowing symbol.

## Owning code

- `module:Table/useTableRowsVirtualization` — Table's public virtualization
  hook, the first consumer; it has no code yet (Current-state impact).
- `packages/core/src/Selector/` — the second consumer.
- `packages/core/src/Chat/` — the third consumer.

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

## Open questions

- **OQ1 — Is the windowing module public (a hook) or internal only?** Not
  decided. Until it is, the module stays private (INV2).

## Verification

| Invariant | Evidence                                                                                                                                        | Failure signal                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| INV1      | Review of each Core list that windows (evidence gap: no module or automated check exists yet)                                                   | A Core component keeps its own windowing implementation beside the module                         |
| INV2      | Public export review of every package entry point (evidence gap: no module exists yet)                                                          | The module, or a type only it uses, is reachable from a public entry point                        |
| INV3      | The public-API report for `useTableRowsVirtualization` and each consumer (evidence gap: the hook is not built yet)                              | Adopting the module changes a consumer's public props, types, or exports                          |
| INV4      | Each consumer's windowed list inside a container scroll area and on a scrolling page (evidence gap: Table windows only inside its own viewport) | A consumer renders every row, or places rows wrongly, when the page or an outer container scrolls |
| INV5      | the size check's dedicated budget entries for the engine and each adapter                                                                       | The engine measures over 4.9 KB, or an adapter over 2 KB, without the owner's decision            |
