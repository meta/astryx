---
schema_version: 1
template_version: 3
kind: architecture
id: architecture:component-import-boundaries
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-10
owners: [cixzhang]
applies_to: [packages/core/src/, packages/lab/src/]
verified_by:
  [
    scripts/touch-support-bundle.test.mjs,
    scripts/lazy-sheet-bundle.test.mjs,
    scripts/core-single-bundle.test.mjs,
    scripts/check-component-import-boundaries.mjs,
    scripts/check-component-import-boundaries.test.mjs,
  ]
deciding_specs: []
---

# Component import boundaries architecture

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Governing contract      | None. No prop, type, or behavior a person sees changes; each surface's own record keeps what it shows and when.                                                                                                                                                                                                                                  |
| System behavior         | A public import carries what renders without interaction. Surfaces revealed by interaction load on first intent, except tooltip and hover-card surfaces, which load after the page's first paint (INV1–INV6, DEC-4). Opt-in capabilities are reachable only through their own import (INV7). A failing check holds both per entry (INV9, DEC-3). |
| End-user impact         | People load less JavaScript on every page. A page with one Heading carries no tooltip code; a Table that never windows carries no windowing code. The first open of a surface can wait for its module; the trigger, its name, and focus are there before it loads.                                                                               |
| Builder impact          | A component author puts surface rendering behind the shared module loader and capability code behind its own import. The check names the import chain that breaks a boundary.                                                                                                                                                                    |
| Compatibility/readiness | Additive and internal: no public API changes. Current-state impact lists today's crossings; the allowlist records each one until it is fixed.                                                                                                                                                                                                    |
| Review checks           | Reject a static import of a surface module or a capability module from a public import outside the allowlist; an `import()` of a touch module; a surface whose trigger loses its ARIA wiring, focus, or an early intent across the load; a layout shift on load.                                                                                 |
| Governing rules         | DEC-1, DEC-2, DEC-3, DEC-4; `architecture:react-component-runtime` INV13; `architecture:component-style-authoring` INV6; `spec:AST-080` DEC-5; `spec:AST-013` FR9.                                                                                                                                                                               |

This table is a review projection; the body below is authoritative.

## Purpose

A public import of a component costs every page that uses it, whether or not a
person interacts with it. This record says which modules a public import may
reach eagerly. It keeps code for a surface nobody has opened, and for a
capability nobody turned on, out of the import.

## System model

Three kinds of code meet in a component's import:

- **Base code** renders what a person sees without interacting: the text, the
  button, the rows, plus the trigger contract of any surface the component
  offers.
- **A surface revealed by interaction** renders only after a person hovers,
  focuses, presses, or opens something: Tooltip, the truncation tooltip of
  Text and Heading, HoverCard, Popover and its sheet, DropdownMenu and
  ContextMenu menus, and any other layer a trigger opens. Its **surface
  module** holds the code only it needs: its layer, positioning, dismissal,
  content, and its own gesture glue.
- **An opt-in capability** is behavior a caller turns on by importing and
  passing something: Table row virtualization and the shared windowing
  module (`architecture:list-windowing`), other Table plugins, `createSwipe`,
  `useSnapPaging`, and the Markdown remark adapter. Its **capability module**
  holds the code only it needs.

An **entry** is one public import, built with the esbuild options of the
pull-request size report (`.github/scripts/lib/component-size.js`): minified
ESM for the browser, code splitting on, production mode, and CSS left out.
The build makes React, React DOM, and StyleX external, which the size report
does not, so an entry's size counts only the code Astryx ships. The entry
chunk and every chunk it imports statically are eager. `import()` targets are
lazy. Sizes are gzip at the default level, and 1 KB is 1,024 bytes
(`architecture:component-style-authoring` INV6).

A **crossing** is the first static import, on a path through an entry's eager
graph, from a module of base code into a surface module or a capability
module. A static import of a touch module from a base module that defers a
surface is a crossing too (INV8). The walk stops at a crossing, so imports
inside a surface's or a capability's own graph are not crossings. Each pair
of a base module and the module it first crosses into is one crossing and
one allowlist row. A module that an `import()` targets is a surface module.

Some modules in a surface or capability folder are base code: the trigger
contract a surface folder keeps for base imports
(`Tooltip/tooltipPresentInterest`, `Layer/layerScopedContext`), and a
capability's own import (a Table plugin's folder index and the modules it
re-exports, and `SnapPaging/SnapPaging`). INV7's wiring lives in base code:
the component's own modules or the capability's own import. A wiring module
such as the Table's `useTableRowsVirtualization` stays base code while it
imports no engine code; its first static import of engine code is a
crossing.

The shared module loader (`utils/moduleLoader.ts`, `createModuleLoader`) holds
one pending load per module, caches a success, and resets after a failure.

## Boundaries and invariants

- **INV1 — Surfaces revealed by interaction load on first intent, tooltips and hover cards after first paint.** A public
  import reaches a surface module only through `import()` behind the shared
  module loader, never statically. This holds for the surface's own public
  component too: the `Tooltip`, `HoverCard`, `Popover`, `DropdownMenu`, and
  `ContextMenu` imports carry their trigger contract, and their surface loads
  as INV2 says, the `Tooltip` and `HoverCard` surfaces by its after-paint
  rule. The eager part of an entry holds only the trigger contract:
  the ARIA attributes and ids INV3 requires, the intent listeners, and the
  loader call. A module inside a lazily loaded graph imports Core modules
  directly, never through a barrel (`scripts/core-single-bundle.test.mjs`).
- **INV2 — Intent starts the load, except for tooltips and hover cards.** The load starts at the trigger's first
  `pointerenter` from a mouse or pen, `focus`, `pointerdown` from any pointer,
  or open request (a controlled open, a keyboard shortcut, a context-menu
  invocation). The listeners use native events only; they recognize no
  gesture. A component's own record may start the load earlier at a named
  moment after the page's first render. The `Tooltip` and `HoverCard`
  surfaces do not wait for intent: their load starts after the page's first
  paint, on every page that renders one of their triggers, and no input starts
  it sooner or hurries it (DEC-4). A load never starts during server render or
  the render that hydrates server markup (`spec:AST-013` FR9).
- **INV3 — The trigger contract is complete before load.** The trigger's
  role, accessible name, and tab stop, and the ARIA its own record gives its
  closed state, are in server and hydrating markup and do not change when the
  module loads. That ARIA differs per trigger: `component:Timestamp` AR3
  gives its `time` no `aria-haspopup` or `aria-expanded` and sets
  `aria-controls` only while the card is open, as
  `component:DropdownMenuSubMenu` FR1 does for its surface. Every ARIA
  reference names an element in the document. A
  description a surface supplies (a tooltip on an icon-only button) is in the
  base markup as hidden text before load, or the trigger carries no reference
  to it. Focus stays where it is across the load, and the load remounts no
  content (`architecture:layer-runtime`, layer content boundary;
  `component:Timestamp` FR6).
- **INV4 — An intent made before load is honored once.** The latest intent
  made before the module loads is held and replayed once when it loads, by
  the surface's own rules. A hover waits the surface's delay, counted from the
  pointer's entry. A tap or open request opens at once. A focus opens only if
  focus is still on the trigger. A later intent replaces a held one
  (`architecture:interaction-modality` INV8). Leaving, blurring, a scroll, or a
  press elsewhere before load drops a held hover or focus. A replayed intent
  arms the surface's dismissal as the same intent does on a loaded surface.
  For a `Tooltip` or `HoverCard` surface, a hover made while it loads shows
  the surface once the load has landed and the hover delay has passed, if the
  pointer is still on the trigger; otherwise the next hover shows it.
- **INV5 — The load moves nothing.** Loading changes no box in the page: the
  trigger's size, position, and content are the same before and after. No
  closed surface paints during the load. The surface paints in the top layer
  or in a slot whose size is reserved before load. Nothing shows a false
  state (`spec:AST-013` FR9).
- **INV6 — A failed load leaves the page working.** When the import fails,
  the trigger and the page stay mounted and operable, the held intent is
  dropped, and any native behavior the trigger suppressed returns (the
  browser's own context menu). Development builds warn once. A later intent
  asks the loader again.
- **INV7 — Opt-in capabilities are reachable only through their own
  import.** A capability's code lives in modules that only its own public
  import (its hook, constructor, or plugin factory) reaches. The component it
  extends imports none of them, statically or with `import()`. The component
  reaches the capability through the value the caller passes or through an
  implementation the capability's import registers. An entry that does not
  import the capability carries at most 0.3 KB gzip of its wiring: identity
  checks and the branch that reads the registration. This is the route
  `architecture:public-component-api` INV19 gives a large feature, as
  `createSwipe` (`spec:AST-057` FR10) and `useSnapPaging`
  (`component:Carousel` FR8) take it. `architecture:list-windowing` owns the
  windowing module itself (INV1); this record owns which imports carry it.
- **INV8 — A deferred surface takes touch code from the shared touch
  modules.** A surface module that needs touch behavior imports the shared
  internal touch modules statically (`architecture:react-component-runtime`
  INV13). The bundler keeps one copy per page, whether a base import or a
  loaded surface brings them. `import()` targets a surface module, never a
  touch module. INV2's listeners recognize no gesture, so a base import that
  defers its surface carries no touch code for it. Telling a tap from a
  scroll belongs to the loaded surface, which reads the `click` that follows
  a tap.
- **INV9 — A check holds the boundaries per entry.** A CI check builds each
  entry in the entry list (Text, Heading, Button, IconButton, Link, Table, and
  each entry an owner adds) and walks its eager graph. It finds every
  crossing the entry reaches and names the import chain that brings each one.
  A crossing listed in the allowlist below passes, with its gzip cost
  printed. A crossing not listed fails (DEC-3). A listed crossing that no
  longer occurs fails until its row is removed. The check also prints each
  entry's eager gzip size, base against head. Adding a row to the allowlist
  needs the owner's approval in this record.

### Allowlist

| Crossing (base module → module it imports statically)             | Entries that reach it                          | Cost, gzip             | Invariant  | Row leaves when                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------- | ---------------------- | ---------- | ------------------------------------------------------------------------ |
| `Text/TruncationTooltip` → `Layer/useTouchTrigger`                | Text, Heading, Button, IconButton, Link, Table | 4.6 KB (Text, Heading) | INV1, INV8 | the truncation tooltip's eager code carries no touch tap recognizer      |
| `Button/Button` → `Tooltip/useTooltip`                            | Button, IconButton                             | 15.5 KB                | INV1       | Button's tooltip layer code is lazy                                      |
| `Link/Link` → `Tooltip`                                           | Link                                           | 17.6 KB                | INV1       | Link's tooltip layer code is lazy                                        |
| `Table/tableContextMenu` → `ContextMenu`                          | Table                                          | 78.2 KB                | INV1       | cells without actions reach no menu module                               |
| `Table/BaseTable` → `Table/plugins/virtualization/useTableWindow` | Table                                          | 3.0 KB                 | INV7       | a Table that never windows reaches neither the controller nor its engine |

Costs are the check's own printout in CI: each crossing's removal from the
entry with every other crossing kept, in the entry build above. A local run
on another platform or Node version can print gzip sizes a few tenths of a KB
apart. Rows share modules, so they do not add up. The truncation tooltip's touch code costs Button,
IconButton, Link, and Table nothing on its own, because another of their
crossings brings the same module. Table carries 123.5 KB eager.

## Current-state impact

- INV1, INV8 gap: Text's and Heading's imports reach the touch tap recognizer
  through the truncation tooltip, 4.6 KB gzip each, on pages whose text never
  truncates. Button, IconButton, Link, and Table reach it the same way
  through Text.
- INV1 gap: the `Tooltip`, `HoverCard`, `Popover`, `DropdownMenu`, and
  `ContextMenu` imports load their layer statically. `useTooltip`,
  `useHoverCard`, `usePopover`, and `ContextMenu` import the layer hook from
  `Layer/useLayer`, and `DropdownMenu` reaches it through `usePopover`. These
  five are not in INV9's entry list, so the check does not hold them; it
  holds only the listed entries.
- INV1 gap: Button's and IconButton's imports reach the tooltip hook and the
  layer runtime, 15.5 KB gzip, with or without a `tooltip` prop. Through
  Button, Link, or their own code, 32 of Core's 95 component imports that are
  not surfaces carry 17–24 KB of tooltip code, and 52 carry at least 1 KB.
- INV1 gap: Link's import reaches the Tooltip component and the layer
  runtime, 17.6 KB gzip, with or without a `tooltip` prop.
- INV1 gap: Table's import reaches the cell context menu, 78.2 KB gzip, for
  cells with no actions, while `component:TableCell` PR1 loads a menu only
  when actions are given.
- INV7 gap: Table's import reaches the window controller and the shared
  windowing module, 3.0 KB gzip, for a Table that never windows.
- INV3 gap: no record says how a tooltip's description reaches assistive
  technology before its surface loads, for the triggers whose tooltip is
  their description.
- INV6 gap: a menu holding an essential action has no path to that action
  when its module fails to load (`architecture:interaction-modality` INV7).
- INV9 gap: the check does not measure INV7's wiring allowance. An entry's
  wiring for a capability it does not import can exceed 0.3 KB gzip, and the
  check does not fail.
- INV9 gap: the check holds no capability boundary for swipe recognition,
  which has no module of its own.

## Change coupling

Review against this record when a change:

- adds or alters a static import from a public import's graph to a surface
  module or a capability module;
- adds an `import()`, a module loader, or an intent listener that starts one;
- adds a surface revealed by interaction, or an opt-in capability; or
- adds or removes an entry or an allowlist row.

## Owning code

- `packages/core/src/utils/moduleLoader.ts` — the shared module loader.
- `packages/core/src/Text/TruncationTooltip.tsx` — the truncation tooltip's
  intent tracking and load.
- `packages/core/src/Tooltip/`, `packages/core/src/HoverCard/`,
  `packages/core/src/Popover/`, `packages/core/src/DropdownMenu/`,
  `packages/core/src/ContextMenu/` — surfaces and their triggers.
- `packages/core/src/Table/plugins/` — Table's opt-in capabilities.
- `.github/scripts/lib/component-size.js` — the esbuild options and gzip
  measure INV9's entry build shares with the size report.

## Deciding specs

### DEC-1 — Surfaces revealed by interaction load on first intent

**Reference:** `architecture:component-import-boundaries/DEC-1`
**Decider:** `cixzhang`, `2026-11-09`

> "any tooltips, hovercards, and layers that appear on interaction should be
> lazy loaded"

Most people never open most surfaces on a page, so their code loads when a
person shows intent, and an intent made while it loads still counts (INV1–INV6).
This defers a surface, not a touch primitive: touch code stays in the shared
touch modules that `spec:AST-080` DEC-5 requires, imported statically by the
surface that uses it (INV8).

Rejected: loading each surface with its trigger, because every page pays for
surfaces people never open.

Amended for tooltips and hover cards by DEC-4.

### DEC-2 — Opt-in capabilities ship only through their own import

**Reference:** `architecture:component-import-boundaries/DEC-2`
**Decider:** `cixzhang`, `2026-11-09`

The window is an import of the virtualizer, so people pay for it only when
they virtualize. A caller who does not import a capability carries none of it (INV7).

Rejected: loading a capability with `import()` from the component, because
the capability then goes live only after the component paints and needs an
exception to `architecture:react-component-runtime` INV13 (`spec:AST-057` DEC-8).

### DEC-3 — A failing check holds the boundaries, with an allowlist of today's crossings

**Reference:** `architecture:component-import-boundaries/DEC-3`
**Decider:** `cixzhang`, `2026-11-10`

> "a failing check now, with a recorded allowlist of today's crossings until
> each is fixed" — Owner decision, 2026-11-10 (Cindy)

The check fails on any crossing not in the allowlist. Each crossing that
exists today is a row in the allowlist, and its row leaves when its fix
lands; a row whose crossing no longer occurs fails (INV9). A new crossing
cannot merge, and no change is blocked by a crossing already listed.

Rejected: a warn-only check that starts failing per entry once its rows are gone, because a new crossing can merge while its entry only warns.
Rejected: rules held by review alone, because a crossing shows only in the built import graph, not in the changed lines.

### DEC-4 — Tooltip and hover-card code loads after first paint on every page

**Reference:** `architecture:component-import-boundaries/DEC-4`
**Decider:** `cixzhang`, `2026-11-13`

> "After first paint, on every page" — Owner decision, 2026-11-13 (Cindy)

Tooltip and hover-card code loads in the background once the page has painted,
so the page shows first and the first hover usually finds the code already
loaded. This covers every Tooltip surface, including the truncation tooltip of
Text and Heading and the `tooltip` of Button and Link, and the HoverCard
surface. No input starts the load sooner or hurries it. A hover during the
loading window still waits the surface's hover delay, counted from the
pointer's entry, and shows when the load lands if the pointer is still on the
trigger, or at the next hover (INV2, INV4). Other surfaces keep DEC-1.

Rejected: loading on the first hover or focus, because the first hover then
waits for the fetch.
Rejected: loading with the page, because every page pays for code before
anyone hovers.

## Open questions

- **OQ1 — Is 0.3 KB the right wiring allowance for INV7?** Proposed from the
  smallest residue measured for Table's windowing; the owner sets it.
- **OQ2 — How does a surface open on first render load?** A controlled open
  or default open surface has no intent before hydration. Proposed: it loads
  with the first client render, and its closed frame is the state the server
  markup already shows.

## Verification

| Invariant  | Evidence                                                                                                                                                                                                                                                                               | Failure signal                                                                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1, INV7 | The entry-boundary check (INV9) with a positive control per kind: a fixture entry that imports a surface statically, and one that imports a capability                                                                                                                                 | A listed entry reaches a surface or capability module statically outside the allowlist; a component reaches a capability module with `import()`; a positive control passes                                                                                 |
| INV2       | Unit tests per surface: no load before intent; one load per intent kind (mouse or pen enter, focus, pointer down, open request); none during server render or hydration; Tooltip and HoverCard: a load after the first paint with no intent, and an early hover that does not start it | A load before intent, during server render, or during hydration; an intent that starts no load; a gesture recognizer in the pre-load listeners; a Tooltip or HoverCard load that waits for intent, starts before first paint, or starts sooner on an input |
| INV3       | Server render then hydrate, plus real-browser tests (Chromium and WebKit) with axe before and after load                                                                                                                                                                               | Closed-state trigger ARIA differs between server, hydration, and after load; an ARIA reference names a missing element; focus moves or content remounts on load                                                                                            |
| INV4       | Tests with a deferred loader: hover, tap, focus, and open request before load; leave, blur, and a later intent before load                                                                                                                                                             | A held intent lost or replayed twice; a hover delay restarted at load; a stale intent opening after a newer one; a replayed tap without outside dismissal                                                                                                  |
| INV5       | Real-browser layout test: trigger box before and after load; no paint of a closed surface                                                                                                                                                                                              | Any trigger box change; a closed surface painted; a false state during load                                                                                                                                                                                |
| INV6       | Tests with a rejecting loader                                                                                                                                                                                                                                                          | The page unmounts or the trigger stops working; a held intent survives; a suppressed native behavior does not return; a later intent does not retry                                                                                                        |
| INV8       | `scripts/touch-support-bundle.test.mjs` extended over lazy chunks: two deferred surfaces and one base component on one page                                                                                                                                                            | A second copy of a touch module on one page; an `import()` whose target is a touch module; a touch module in an entry's eager graph only for a deferred surface                                                                                            |
| INV9       | The check's own tests: a stale allowlist row, an unlisted crossing, and the printed import chain                                                                                                                                                                                       | A crossing passes unlisted; a stale row passes; a failure without its import chain                                                                                                                                                                         |
