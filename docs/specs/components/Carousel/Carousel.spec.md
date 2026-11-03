---
schema_version: 3
template_version: 7
kind: component
id: component:Carousel
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-22
owners: [cixzhang]
review_triggers: [behavior, accessibility, api, bundle]
verified_by:
  [
    packages/core/src/Carousel/Carousel.test.tsx,
    packages/core/src/Carousel/__tests__/Carousel.a11y.chromium.spec.ts,
  ]
modules: []
families: [family:buttons]
design_specs: []
architecture:
  [
    architecture:interaction-modality,
    architecture:public-component-api,
    architecture:react-component-runtime,
  ]
contributing: []
system_specs:
  [spec:AST-085, spec:AST-025, spec:AST-094, spec:AST-107, spec:AST-017]
---

# Carousel component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `snap` sets how the scroll area snaps: absent means no snapping; `snap` (`true`) means native CSS scroll snap; `snap={useSnapPaging()}` means snap paging, native snap's stops with UIKit's paging feel under a finger (FR5–FR7). `createSnapPaging(element, options?)` is the non-React path (FR9). `hasSnap` is deprecated (DEP-0018) and removed in 0.8.0 (CLN-0029). The edge scroll buttons hide and hand off focus at an edge (FR1–FR4). |
| Behavior                | Native snap stops each item at its start edge and leaves the momentum to the platform. Snap paging uses the same stops and picks the rest stop by `spec:AST-094` FR3's paging rule under a finger. An edge button whose direction has run out is hidden and takes no tab stop; when the focused one runs out, focus moves to the scroll area.                                                                                                  |
| End-user impact         | People who swipe a paging carousel on a phone feel iOS paging; people on a carousel without it download no paging code. A keyboard user who scrolls to the first or last item stays inside the carousel.                                                                                                                                                                                                                                       |
| Builder impact          | `hasSnap` becomes `snap`; paging is one opt-in value, `snap={useSnapPaging()}`. A Carousel without it bundles no pager code (about 40 KB less than a build where the pager comes with Carousel). `astryx upgrade` rewrites `hasSnap` to `snap`.                                                                                                                                                                                                |
| Compatibility/readiness | `hasSnap` keeps today's native snapping, with no paging, until 0.8.0 removes it. Implementation gap: `snap`, `useSnapPaging`, and `createSnapPaging` are not built; shipped Carousel still uses native `disabled` on edge buttons.                                                                                                                                                                                                             |
| Review checks           | Reject pager code reachable from Carousel's default import; a lazy `import()` of the pager; snap paging on a carousel that did not pass `useSnapPaging`; a `hasSnap` codemod that writes paging; snap paging stops that differ from native snap's; a dependency on a Chromium-only carousel feature; focus left on a hidden edge button.                                                                                                       |
| Governing rules         | `spec:AST-094` FR3, FR6, DEC-25; `spec:AST-107` FR6; `architecture:public-component-api` INV22; `architecture:react-component-runtime` INV13; `spec:AST-017` FR28, FR29; `spec:AST-085` FR1, FR4; `spec:AST-025` FR12; `architecture:interaction-modality` INV1.                                                                                                                                                                               |

This table is a review projection; the body below is authoritative.

## Intent

Carousel shows a horizontally scrolling row of items inside a labelled region,
with optional scroll buttons at each edge. This record covers how the row snaps,
the opt-in snap paging and its non-React path, and what the edge scroll buttons
do when their direction runs out. Other Carousel behavior is uncontracted until
this record grows.

## Compatibility and migration

- Released default preserved: yes. A carousel without `snap` does not snap, as
  without `hasSnap` today. `hasSnap` keeps native snapping and gains no paging.
- Compatibility class: additive API with a replacement-first deprecation
  (DEP-0018) and a removal in the 0.8.0 minor (CLN-0029); edge focus is a
  behavior correction with no API change.
- Controlled/uncontrolled behavior: unchanged.
- Migration decision: DEC-1 (edge focus), DEC-2 (snap and snap paging).

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The `snap` prop, its native snap and snap paging values, and the
  `useSnapPaging` and `createSnapPaging` APIs.
- Which stops snap paging uses on a carousel (FR7).
- Edge scroll button visibility, tab order, and the focus destination when one
  runs out.

**Does not own / non-goals**

- The paging rule, the settle, and their measured values — `spec:AST-094` FR3,
  FR6, DEC-25.
- The internal pager that snap paging and Lightbox's gallery share —
  `spec:AST-094`; it stays internal.
- Scroll area keyboard access and naming — `spec:AST-025`.
- Disabled control semantics in general — `spec:AST-085`.
- Button naming, sizing, and activation — `family:buttons`.
- Looping, mouse-drag paging, autoplay, dots, edge fades, and slide semantics —
  uncontracted.

## Public concepts

| Concept                               | Closed values or states                         | Meaning                                                                                                                                   | Availability by variant/orientation/state | Default | Owner                | Stability  | Invalid-value behavior            |
| ------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------- | -------------------- | ---------- | --------------------------------- |
| `snap`                                | absent or `false`; `true`; a `SnapPaging` value | No snapping; native CSS scroll snap (FR6); snap paging (FR7)                                                                              | Every Carousel                            | absent  | `component:Carousel` | stable     | TypeScript rejects other values   |
| `useSnapPaging(options?)`             | returns `SnapPaging`                            | The hook whose value turns on snap paging. Exported from `@astryxdesign/core/SnapPaging` and the package root                             | React callers                             | —       | `component:Carousel` | stable     | —                                 |
| `createSnapPaging(element, options?)` | returns `{destroy()}`                           | Snap paging on any horizontally scrolling element whose direct children are its stops, with no React. Same module and exports as the hook | Non-React callers                         | —       | `component:Carousel` | stable     | —                                 |
| `SnapPaging`                          | opaque                                          | The configured snap paging. Callers make it only with `useSnapPaging` and pass it only to `snap`                                          | —                                         | —       | `component:Carousel` | stable     | —                                 |
| `SnapPagingOptions`                   | an object with no fields                        | Options for the hook and the factory. A field is added only by a current record                                                           | —                                         | `{}`    | `component:Carousel` | stable     | TypeScript rejects unknown fields |
| `hasSnap`                             | boolean                                         | Deprecated alias of `snap={true}` (DEP-0018)                                                                                              | Every Carousel until 0.8.0                | `false` | `component:Carousel` | deprecated | —                                 |
| Edge scroll button                    | available, run out                              | Whether content remains in that button's direction                                                                                        | Both edges when the carousel overflows    | —       | `component:Carousel` | stable     | not applicable                    |

## Behavioral and layout contract

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Basis                                                         | Draft review state |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------ |
| FR1  | An edge scroll button whose direction has run out is hidden. While hidden it takes no tab stop and is not exposed to assistive technology. It stays mounted so layout does not shift. This is removal under `spec:AST-085` FR4, not a disabled control.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | DEC-1                                                         | settled            |
| FR2  | When the focused edge scroll button runs out, focus moves to the scroll area without scrolling it. This holds when the content no longer overflows and the scroll area is out of the tab order (`spec:AST-025` FR12): it still takes focus programmatically. Focus never lands on the page body or on a hidden button.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | DEC-1; `spec:AST-085` FR4                                     | settled            |
| FR3  | The handoff happens once per edge transition, and only while the edge button held focus. An edge reached by swipe, resize, or wheel while focus is elsewhere moves nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `architecture:interaction-modality` INV8                      | settled            |
| FR4  | An edge scroll button that is available behaves as an ordinary Button.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `family:buttons`                                              | settled            |
| FR5  | `snap` takes `boolean \| SnapPaging`. Absent or `false`: the scroll area does not snap. `true` (written `snap`): native snap, FR6. A `SnapPaging` value: snap paging, FR7. `SnapPaging` is opaque and made only by `useSnapPaging`. A new `SnapPaging` value on a later render does not restart a settle or attach the gesture again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | DEC-2                                                         | settled            |
| FR6  | Native snap uses CSS scroll snap only: `scroll-snap-type: inline mandatory` on the scroll area, `scroll-snap-align: start` on each direct child, and `scroll-padding` matching the carousel's padding. Every item is a stop, also when several items show at once, and the platform's own momentum picks where a swipe rests. The edge buttons scroll with `scrollBy`, and the current position comes from `scrollend` and `IntersectionObserver`. Native snap adds no gesture code. It does not depend on `::scroll-button()`, `::scroll-marker`, `:target-current`, scroll-state container queries, snap events, or `interactivity: inert`; one of these MAY be added under `@supports` only where it changes no behavior, name, role, or focus order.                                                                                       | DEC-2                                                         | settled            |
| FR7  | Snap paging uses native snap's stops (FR6): each direct child's start edge, measured from the inline start and mirrored in right-to-left layout, with the last stops clamped where the row ends so no empty space shows. A gap sits between stops and is never a stop. Under a finger, and under a trackpad where the primary pointer is coarse, a release picks its rest stop by `spec:AST-094` FR3's paging rule, with one stop as one page: at most one stop from the stop the drag started on. The settle starts as `spec:AST-094` FR6's paging paragraph says. Where the primary pointer is fine, a mouse or trackpad keeps native snapping. An edge button steps about one view: the viewport width less half an item, landing on the nearest stop and moving at least one stop. Open question OQ1 asks whether one page stays one item. | DEC-2; `spec:AST-094` FR3, FR6, DEC-25                        | proposed           |
| FR8  | Carousel's module imports no pager code: not the internal pager, its paging motion, or its gesture code. The `useSnapPaging` and `createSnapPaging` module imports that code statically, and Carousel only calls attach and detach on the `SnapPaging` value from an effect. The pager is tree-shaken by module boundary, with no lazy `import()` (`architecture:react-component-runtime` INV13), so a Carousel without `snap={useSnapPaging()}` bundles no pager code. Importing the module does no DOM work.                                                                                                                                                                                                                                                                                                                                 | DEC-2; `architecture:react-component-runtime` INV13           | settled            |
| FR9  | `createSnapPaging(element, options?)` attaches FR7 to `element` and returns a handle whose `destroy()` removes every listener it added. `useSnapPaging(options?)` is a thin wrapper over it: Carousel hands its scroll area to the factory the value carries, and the hook has no behavior of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `architecture:public-component-api` INV22; `spec:AST-107` FR6 | settled            |
| FR10 | `hasSnap` follows DEP-0018: it behaves as `snap={true}` and never turns on snap paging. When `snap` and `hasSnap` are both given, `snap` wins, and a development-only diagnostic names the ignored prop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | DEC-2; `spec:AST-017` FR29                                    | settled            |

### Representative states

| State                                       | Required invariant                                                   | Allowed variation       |
| ------------------------------------------- | -------------------------------------------------------------------- | ----------------------- |
| Mid-scroll                                  | Both edge buttons available                                          | Loop keeps both enabled |
| Focused "Scroll right" reaches the end      | Button hides; focus is on the scroll area; no extra scroll           | Reduced motion          |
| Edge reached by swipe, focus elsewhere      | Button hides; focus does not move                                    | —                       |
| Content shrinks to fit                      | Both buttons hidden; a focused one hands off to the scroll area      | —                       |
| One item per view, snap paging              | A flick moves one item, as a UIKit paging scroll view moves one page | —                       |
| Three items per view, snap paging           | A flick moves one item; an edge button moves about one view          | OQ1                     |
| Partial last page                           | The last stops rest where the row ends; no empty space               | —                       |
| Right-to-left                               | Stops and flick directions mirror                                    | —                       |
| `snap` or `hasSnap` without `useSnapPaging` | Native snap; no pager code loaded or run                             | Platform momentum       |

## Accessibility contract

- **AR1 — No invisible tab stops.** A hidden edge button is not focusable and is
  not exposed to assistive technology (FR1).
- **AR2 — Focus stays in the region.** The edge handoff keeps focus inside the
  labelled carousel region (FR2), and the keyboard focus indicator follows
  `architecture:interaction-modality` INV1.
- **AR3 — Snapping keeps every path.** Under native snap and snap paging, the
  scroll area stays a real scroll container: keyboard scrolling, the edge
  buttons, and the region's name work as without snapping. Snap paging's motion
  under Reduce Motion follows `spec:AST-094`.

## Design relationships

No design record governs Carousel yet. Edge button visuals stay in code and
visual evidence.

## Family and system relationships

- `spec:AST-085` FR4 lets a component name a focus destination for a control it
  removes; FR2 names the scroll area.
- `spec:AST-025` FR12 owns the scroll area's tab stop and naming.
- `family:buttons` owns the edge buttons' behavior while available.
- `spec:AST-094` FR3, FR6, and DEC-25 own the paging rule and settle that snap
  paging runs (FR7). The internal pager stays internal; `createSnapPaging` is a
  public factory built on it, and the two names differ (`spec:AST-107` FR6).
- `component:Lightbox` FR7 pages its gallery with the same internal pager and
  rule. Its pages are full-width items in a row it drives itself, so it takes no
  `SnapPaging` value; it shares the rule, not the config.
- `architecture:public-component-api` INV22 gives `useSnapPaging` its
  `createSnapPaging` counterpart; any horizontally scrolling row of snap items
  MAY use the factory without React.

## Verification map

| Contract       | Verification                                                                                                                                           | Representative states                                                                                                                                                                                             | Mutation or failure expectation                                                                                                                                                              | Audit section                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR1, AR1       | Unit and accessibility-tree tests                                                                                                                      | at rest at each edge; no overflow                                                                                                                                                                                 | A hidden button that is focusable or exposed fails                                                                                                                                           | `audit:Carousel/accessibility` |
| FR2, AR2       | Real-browser keyboard test                                                                                                                             | Enter on "Scroll right" until the end; same on the start                                                                                                                                                          | Focus on the page body, a hidden button, or the opposite button fails                                                                                                                        | `audit:Carousel/accessibility` |
| FR3            | Real-browser test with swipe and resize                                                                                                                | edge reached with focus outside the carousel                                                                                                                                                                      | Focus moving without an edge-button press, or moving twice for one edge, fails                                                                                                               | `audit:Carousel/accessibility` |
| FR5, FR6, FR10 | Unit tests of the scroll area's styles and listeners                                                                                                   | `snap` absent, `false`, `true`; `hasSnap`; `hasSnap` with `snap`; one and three items per view                                                                                                                    | Snapping without `snap`, a stop other than each child's start edge, gesture listeners under native snap, `hasSnap` that pages, or a missing coexistence diagnostic in development fails      | —                              |
| FR7, AR3       | Real-browser touch tests in Chromium and WebKit                                                                                                        | one item per view; three items per view; a partial last page; right-to-left; a short flick over 300 pt/s; a slow release before and past half a stop; an edge-button step at three per view; a fine-pointer wheel | A rest stop other than FR7's, a move of more than one stop per flick, empty space after the last item, an unmirrored right-to-left flick, or a fine-pointer scroll that runs the pager fails | —                              |
| FR7            | Preview stories at desktop and phone widths                                                                                                            | one item per view; three items per view; a partial last page; right-to-left; each with `snap` and with `snap={useSnapPaging()}`                                                                                   | A missing story, or a story whose paging stops differ from its native-snap stops, fails                                                                                                      | —                              |
| FR8            | Bundle test on the built package: each public import built with the size report's options and its eager output attributed by module, base against head | Carousel alone; Carousel with `useSnapPaging`; `createSnapPaging` alone; a server import of the module                                                                                                            | A Carousel without `snap={useSnapPaging()}` that bundles pager code, an `import()` of the pager, or DOM work on import fails                                                                 | —                              |
| FR9            | Unit tests of the factory and the hook                                                                                                                 | `createSnapPaging` on a plain element; `destroy()` mid-settle; the hook in Carousel                                                                                                                               | A listener left after `destroy()`, or a hook with behavior the factory lacks, fails                                                                                                          | —                              |

## Decision log

### DEC-1 — The scroll area receives focus when an edge button runs out

**Reference:** `component:Carousel/DEC-1`
**Decider:** cixzhang, 2026-10-22

Carousel hides an edge button whose direction has run out, so keeping focus on
it would leave a keyboard user on an invisible control. The scroll area is always
mounted inside the labelled region and can take focus whether or not it is in the
tab order, so focus moving there keeps the user in place inside the carousel.

Rejected: the opposite edge button — it may be hidden too, and focus would jump
across the carousel.

### DEC-2 — Paging is an opt-in value of `snap`, named `useSnapPaging`

**Reference:** `component:Carousel/DEC-2`
**Decider:** cixzhang, 2026-11-02

On 2026-11-02 the owner decided three things. A carousel gets paging through a
prop whose value comes from a hook that returns a paging config; a plain name
such as `usePaging` reads as generic and collides with Pagination. The prop and
the hook names match, as `swipe={createSwipe()}` does. The hook is
`useSnapPaging`, so the prop is `snap`.

So `snap` carries both kinds: `true` for native snap and the hook's value for
snap paging. Future snap behaviors take the names `useSnap<Variant>` and
`createSnap<Variant>`. Each variant is its own hook and factory, so an app
bundles only the variants it imports, and each factory keeps one behavior
(`architecture:public-component-api` INV22).

Native CSS scroll snap is the default because it works in every browser and
uses the platform's own momentum. The CSS carousel features (`::scroll-button()`,
`::scroll-marker`, `:target-current`, scroll-state queries, snap events,
`interactivity: inert`) ship in Chromium only, with open accessibility and
internationalization concerns from another engine, so Carousel keeps its own
buttons. Snap paging does only what native snap cannot: UIKit's paging rule and
settle under a finger. Scroll-driven animations are available in every engine
and suit progress or slide effects.

## Deprecation and cleanup descriptions

Consumer migration instructions belong in consumer docs and release notes.

### DEP-0018 — Deprecate `hasSnap`

| Field            | Value                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id               | `DEP-0018`                                                                                                                                                                                                                                                                                                                                                                                      |
| cleanup          | `CLN-0029`                                                                                                                                                                                                                                                                                                                                                                                      |
| package          | `@astryxdesign/core`                                                                                                                                                                                                                                                                                                                                                                            |
| surface          | The `hasSnap` prop on `Carousel`                                                                                                                                                                                                                                                                                                                                                                |
| old contract     | `hasSnap: boolean`; `true` gives native CSS scroll snap, each child resting at its start edge                                                                                                                                                                                                                                                                                                   |
| replacement      | `snap` (`snap={true}`), FR5 and FR6. Snap paging (`snap={useSnapPaging()}`) is a separate opt-in and never a replacement for `hasSnap`                                                                                                                                                                                                                                                          |
| direct authority | `component:Carousel` DEC-2. Owner: `cixzhang`                                                                                                                                                                                                                                                                                                                                                   |
| warning          | Static `@deprecated` metadata on the prop; consumer docs and the release notes name `DEP-0018` and the replacement. No runtime warning (`spec:AST-017` FR29, FR29a). When `snap` and `hasSnap` are both given, `snap` wins and a development-only diagnostic names `hasSnap` (`spec:AST-017` FR29's coexistence case)                                                                           |
| compatibility    | `hasSnap` keeps its released behavior exactly: native snap, no pager code, no paging                                                                                                                                                                                                                                                                                                            |
| migration        | Mechanical. `hasSnap` and `hasSnap={true}` become `snap`; `hasSnap={false}` is removed; `hasSnap={expr}` becomes `snap={expr}`                                                                                                                                                                                                                                                                  |
| codemod          | An `astryx upgrade` codemod staged in `packages/cli/assets/codemods/transforms/next/`, with tests and fixtures, checked by the codemod verify workflow, and available in the release that deprecates the prop as an opt-in early migration. It rewrites `hasSnap` on `Carousel` to `snap` as the migration row says, never to `useSnapPaging`, and reports JSX spreads that may carry `hasSnap` |

### CLN-0029 — Remove `hasSnap`

| Field       | Value                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| id          | `CLN-0029`                                                                                                |
| lifecycle   | `DEP-0018`                                                                                                |
| delta       | `hasSnap` is removed from `Carousel`, with FR10's coexistence diagnostic                                  |
| replacement | `snap` (FR5, FR6)                                                                                         |
| codemod     | 0.8.0's `astryx upgrade` runs DEP-0018's rewrite over any remaining site and reports what it cannot prove |
| rollback    | Restore the prop from the final-patch baseline                                                            |
| state       | `pending` — lands in 0.8.0, a declared minor, with its `[breaking]` Changeset                             |

## Open questions

- **OQ1 — Is a snap paging page one item or one view?** FR7 makes a page one
  item: the same stops as native snap, so a flick on a three-up carousel moves
  one item. The alternative makes a page one view, as a UIKit paging scroll
  view does: a flick moves about the viewport's width and lands on an item
  edge. A `pages: 'item' | 'view'` option is a later additive field. The owner
  decides; FR7 changes if a page becomes one view.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
