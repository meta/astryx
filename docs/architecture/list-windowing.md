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
  ]
verified_by: [scripts/check-knowledge.mjs]
deciding_specs: []
---

# List windowing architecture

## Contract at a glance

| Area                    | Contract                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Governing contract      | None. Each consumer's record owns what a person sees and hears in its long list; this record owns only which module computes the window.                                   |
| System behavior         | One shared internal windowing module owns long-list windowing in Core. The module is not public API (INV1, INV2).                                                          |
| End-user impact         | None yet: the module does not exist, and Selector renders every option. Once it ships, people opening a long list wait less, and every windowed list behaves the same way. |
| Builder impact          | A Core component that windows a long list calls the one module instead of building its own. No public windowing hook exists while OQ1 is open.                             |
| Compatibility/readiness | Additive and internal. Spec only: no module exists yet (Current-state impact). Table's approved virtualization hook keeps its public shape.                                |
| Review checks           | Reject a second windowing implementation in Core, a public export of the module, or a change to Table's public virtualization shape made to adopt it.                      |
| Governing rules         | DEC-1.                                                                                                                                                                     |

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

Consumers:

- Table's row virtualization, behind `module:Table/useTableRowsVirtualization`.
- Selector's option list.
- Chat's message list.

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

## Current-state impact

- **No module exists yet.** Selector renders every option when it opens.
  Table's virtualization hook is specified in
  `module:Table/useTableRowsVirtualization` but not built; Chat renders every
  message.

## Change coupling

Review against this record when a change adds or alters windowing,
virtualization, or a rendered-row calculation in a Core list, or exports a
windowing symbol.

## Owning code

- `module:Table/useTableRowsVirtualization` — Table's public virtualization
  hook, a consumer; it has no code yet (Current-state impact).
- `packages/core/src/Selector/` — a consumer.
- `packages/core/src/Chat/` — a consumer.

The module itself has no path yet (Current-state impact).

## Deciding specs

### DEC-1 — One shared private windowing module

**Reference:** `architecture:list-windowing/DEC-1`
**Decider:** `cixzhang`, `2026-11-06`
**Contributor:** `humbertovirtudes`, `2026-11-08`

One shared private windowing module owns long-list windowing in Core; spec
only. The module stays private while OQ1 is open.

## Open questions

- **OQ1 — Is the windowing module public (a hook) or internal only?** Not
  decided. Until it is, the module stays private (INV2).

## Verification

| Invariant | Evidence                                                                                                           | Failure signal                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| INV1      | Review of each Core list that windows (evidence gap: no module or automated check exists yet)                      | A Core component keeps its own windowing implementation beside the module  |
| INV2      | Public export review of every package entry point (evidence gap: no module exists yet)                             | The module, or a type only it uses, is reachable from a public entry point |
| INV3      | The public-API report for `useTableRowsVirtualization` and each consumer (evidence gap: the hook is not built yet) | Adopting the module changes a consumer's public props, types, or exports   |
