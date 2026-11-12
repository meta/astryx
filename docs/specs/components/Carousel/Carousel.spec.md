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
review_triggers: [behavior, accessibility, public-api]
verified_by:
  [
    packages/core/src/Carousel/Carousel.test.tsx,
    packages/core/src/Carousel/__tests__/Carousel.a11y.chromium.spec.ts,
    packages/core/src/Carousel/__tests__/CarouselFocusRing.a11y.chromium.spec.ts,
    packages/core/src/Carousel/__tests__/CarouselSnapPagingButtons.interaction.browser.spec.ts,
    packages/core/src/Carousel/__tests__/CarouselSnapPagingEdges.interaction.browser.spec.ts,
    packages/core/src/SnapPaging/SnapPaging.test.tsx,
    packages/core/src/SnapPaging/__tests__/SnapPaging.interaction.browser.spec.ts,
    scripts/snap-paging-bundle.test.mjs,
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
system_specs: [spec:AST-085, spec:AST-025, spec:AST-094]
---

# Carousel component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `hasSnap` takes `boolean \| SnapPaging` (FR5). `hasSnap` or `hasSnap={true}` turns on native CSS scroll snap, exactly as released (FR6). `hasSnap={useSnapPaging()}` turns on snap paging: native snap's stops with UIKit's paging feel under a finger or a trackpad swipe (FR7). `useSnapPaging` has no non-React equivalent by default (FR9). The edge scroll buttons hide and hand off focus at an edge (FR1–FR4).                       |
| Behavior                | Native snap stops each item at its start edge and leaves the momentum to the platform. Snap paging uses the same stops: under a finger, and on a trackpad swipe under every pointer, a flick moves one view by default, or one item with `{pages: 'item'}`, by `spec:AST-094` FR3's paging rule. An edge button whose direction has run out is hidden and takes no tab stop; when the focused one runs out, focus moves to the scroll area. |
| End-user impact         | People who swipe a paging carousel on a phone feel iOS paging; people on a carousel without it download no paging code. A keyboard user who scrolls to the first or last item stays inside the carousel.                                                                                                                                                                                                                                    |
| Builder impact          | `hasSnap` and `hasSnap={true}` are unchanged. Paging is the same prop given `useSnapPaging()`. A Carousel without the paging config bundles no pager code.                                                                                                                                                                                                                                                                                  |
| Compatibility/readiness | Additive: `hasSnap`'s type widens from `boolean` to `boolean \| SnapPaging`, with no rename, deprecation, or codemod; `true` keeps today's native snapping and gains no paging. Implementation gap: shipped Carousel still uses native `disabled` on edge buttons. Evidence gap: `{pages: 'item'}` is not measured against UIKit's group paging (FR7).                                                                                      |
| Review checks           | Reject pager code reachable from Carousel's default import; a lazy `import()` of the pager; snap paging on a carousel whose `hasSnap` is not a `useSnapPaging` value; `hasSnap={true}` that pages; snap paging stops that differ from native snap's; a claim that `{pages: 'item'}` matches UIKit before it is measured; a dependency on a Chromium-only carousel feature; focus left on a hidden edge button.                              |
| Governing rules         | `spec:AST-094` FR3, FR6, FR43, DEC-25; `architecture:public-component-api` INV3 (a known deviation, DEC-2), INV22; `architecture:react-component-runtime` INV13; `spec:AST-085` FR1, FR4; `spec:AST-025` FR12; `architecture:interaction-modality` INV1.                                                                                                                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

Carousel shows a horizontally scrolling row of items inside a labelled region,
with optional scroll buttons at each edge. This record covers how the row snaps,
the opt-in snap paging, and what the edge scroll buttons do when their direction
runs out. Other Carousel behavior is uncontracted until this record grows.

## Compatibility and migration

- Released default preserved: yes. `hasSnap` and `hasSnap={true}` keep their
  released native snapping and gain no paging. A carousel whose `hasSnap` is
  omitted or `false` does not snap.
- Compatibility class: additive API. `hasSnap`'s type widens from `boolean` to
  `boolean | SnapPaging`, and `useSnapPaging` is new; no rename, deprecation, or
  codemod. Edge focus is a behavior correction with no API change.
- Controlled/uncontrolled behavior: unchanged.
- Migration decision: DEC-1 (edge focus), DEC-2 (snap and snap paging).

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The `hasSnap` prop, its native snap and its snap paging value, and the
  `useSnapPaging` API.
- Which stops snap paging uses on a carousel, and what one page is (FR7).
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
- Looping, mouse-drag paging, autoplay, dots, and slide semantics —
  uncontracted.
- Edge fades — the fades' look is uncontracted; their state follows FR8.

## Public concepts

| Concept                   | Closed values or states               | Meaning                                                                                                                           | Availability by variant/orientation/state | Default           | Owner                | Stability | Invalid-value behavior                       |
| ------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------- | -------------------- | --------- | -------------------------------------------- |
| `hasSnap`                 | `false`, `true`, a `SnapPaging` value | Omitted or `false`: no snap. `true`: native CSS scroll snap (FR6). A `SnapPaging` value: snap paging on native snap's stops (FR7) | Every Carousel                            | `false`           | `component:Carousel` | stable    | TypeScript rejects other values              |
| `useSnapPaging(options?)` | returns `SnapPaging`                  | The hook whose value turns on snap paging. Exported from `@astryxdesign/core/SnapPaging` and the package root                     | React callers                             | —                 | `component:Carousel` | stable    | —                                            |
| `SnapPaging`              | opaque                                | The configured snap paging. Callers make it only with `useSnapPaging` and pass it only to `hasSnap`                               | —                                         | —                 | `component:Carousel` | stable    | —                                            |
| `SnapPagingOptions`       | `{pages?: 'view' \| 'item'}`          | Options for the hook. `pages` sets what one flick moves (FR7). A field is added only by a current record                          | —                                         | `{pages: 'view'}` | `component:Carousel` | stable    | TypeScript rejects unknown fields and values |
| Edge scroll button        | available, run out                    | Whether content remains in that button's direction                                                                                | Both edges when the carousel overflows    | —                 | `component:Carousel` | stable    | not applicable                               |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Basis                                               | Draft review state |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------ |
| FR1 | An edge scroll button whose direction has run out is hidden. While hidden it takes no tab stop and is not exposed to assistive technology. It stays mounted so layout does not shift. This is removal under `spec:AST-085` FR4, not a disabled control.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | DEC-1                                               | settled            |
| FR2 | When the focused edge scroll button runs out, focus moves to the scroll area without scrolling it. This holds when the content no longer overflows and the scroll area is out of the tab order (`spec:AST-025` FR12): it still takes focus programmatically. Focus never lands on the page body or on a hidden button.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | DEC-1; `spec:AST-085` FR4                           | settled            |
| FR3 | The handoff happens once per edge transition, and only while the edge button held focus. An edge reached by swipe, resize, or wheel while focus is elsewhere moves nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `architecture:interaction-modality` INV8            | settled            |
| FR4 | An edge scroll button that is available behaves as an ordinary Button.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `family:buttons`                                    | settled            |
| FR5 | `hasSnap` takes `boolean \| SnapPaging`. Omitted or `false`: the scroll area does not snap. `true` (written `hasSnap`): native snap, FR6, exactly as released, with no gesture code. A `SnapPaging` value, made only by `useSnapPaging`: snap paging, FR7; the carousel snaps on native snap's per-item stops, with FR7's end-page exception, and the pager settles on those same stops. `true` never pages. A new `SnapPaging` value on a later render does not restart a settle or attach the gesture again. The third state is a known deviation from `architecture:public-component-api` INV3, which keeps a `has…` boolean to a true on/off (DEC-2). A `SnapPaging` value is recognized through a registered key, and its type carries one optional phantom member typed `never`, so the package's value and a swizzled copy's match (`spec:AST-110` FR3); the member is never present at runtime and the value stays opaque.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | DEC-2                                               | settled            |
| FR6 | Native snap uses CSS scroll snap only: mandatory snap along the row on the scroll area, each direct child snapping at its start edge, and scroll padding matching the carousel's padding. Every item is a stop, also when several items show at once, and the platform's own momentum picks where a swipe rests. The current page reported is the page snapped into view when scrolling settles, and edge-button availability follows every scroll, momentum and programmatic included, and every resize. Native snap adds no gesture code. It does not depend on `::scroll-button()`, `::scroll-marker`, `:target-current`, scroll-state container queries, snap events, or `interactivity: inert`; one of these MAY be added under `@supports` only where it changes no behavior, name, role, or focus order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | DEC-2                                               | settled            |
| FR7 | Snap paging uses native snap's stops (FR6): each direct child's start edge, measured from the inline start and mirrored in right-to-left layout, with the last stops clamped where the row ends so no empty space shows, except a stop within half its preceding step of the end, which joins the end's page. A gap sits between stops and is never a stop. Under a finger, and on a trackpad swipe under every pointer (`spec:AST-094` FR43), a release picks its rest page by `spec:AST-094` FR3's paging rule: at most one page from the page the drag started on. The settle starts as `spec:AST-094` FR6's paging paragraph says. With the paging config, a flick moves one view by default: the release settles on the item start edge nearest one viewport on in the flick's direction, and the last page rests where the row ends; `{pages: 'item'}` moves one item per flick instead. Under right-to-left layout, pages run from the inline start. With one item per view both give the same stops. A mouse wheel keeps native snapping, and `hasSnap={true}` keeps native CSS snap under every pointer. An edge button steps about one view: the viewport width less half an item, landing on the nearest stop and moving at least one stop. Evidence gap: the one-item-per-flick feel is not yet measured against UIKit's group paging; measure before claiming parity. | DEC-2; `spec:AST-094` FR3, FR6, DEC-25              | settled            |
| FR8 | Carousel's module imports no pager code: not the internal pager, its paging motion, or its gesture code. The `useSnapPaging` module imports that code statically, and Carousel calls only attach and detach on the `SnapPaging` value from an effect, and its moves of the row from Carousel's own scroll calls. The pager is tree-shaken by module boundary, with no lazy `import()` (`architecture:react-component-runtime` INV13), so a Carousel without `hasSnap={useSnapPaging()}` bundles no pager code. Importing the module does no DOM work. Under snap paging, the edge buttons, the edge fades and the handle's `canScrollPrev()`/`canScrollNext()` follow the held row, one state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | DEC-2; `architecture:react-component-runtime` INV13 | settled            |
| FR9 | `useSnapPaging(options?)` has no non-React equivalent by default: its value feeds only Carousel's `hasSnap` (`architecture:public-component-api` INV22). Carousel attaches FR7 to its scroll area through that value, and detaching it removes every listener it added.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `architecture:public-component-api` INV22           | settled            |

### Representative states

| State                                  | Required invariant                                                                                                                                             | Allowed variation       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Mid-scroll                             | Both edge buttons available                                                                                                                                    | Loop keeps both enabled |
| Focused "Scroll right" reaches the end | Button hides; focus is on the scroll area; no extra scroll                                                                                                     | Reduced motion          |
| Edge reached by swipe, focus elsewhere | Button hides; focus does not move                                                                                                                              | —                       |
| Content shrinks to fit                 | Both buttons hidden; a focused one hands off to the scroll area                                                                                                | —                       |
| One item per view, snap paging         | A flick moves one item, as a UIKit paging scroll view moves one page; `{pages: 'item'}` gives the same                                                         | —                       |
| Three items per view, snap paging      | A flick moves one view, settling on the item start edge nearest one viewport on; with `{pages: 'item'}` it moves one item; an edge button moves about one view | —                       |
| Partial last page                      | The last page rests where the row ends; no empty space                                                                                                         | —                       |
| Split end                              | The end's page is the page the end rounds to: a stop within half its preceding step of the end rests where the row ends (FR7); native snap skips it            | —                       |
| Right-to-left                          | Pages run from the inline start; stops and flick directions mirror                                                                                             | —                       |
| `hasSnap={true}`                       | Native snap; no pager code loaded or run                                                                                                                       | Platform momentum       |

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
- **AR4 — The buttons leave the ring whole.** The edge buttons sit inside the
  scroller's focus ring and never cover it (`architecture:interaction-modality`
  INV1).

## Design relationships

No design record governs Carousel yet. Edge button visuals stay in code and
visual evidence.

## Family and system relationships

- `spec:AST-085` FR4 lets a component name a focus destination for a control it
  removes; FR2 names the scroll area.
- `spec:AST-025` FR12 owns the scroll area's tab stop and naming.
- `family:buttons` owns the edge buttons' behavior while available.
- `spec:AST-094` FR3, FR6, and DEC-25 own the paging rule and settle that snap
  paging runs (FR7). The internal pager stays internal.
- `component:Lightbox` FR7 pages its gallery with the same internal pager and
  rule. Its pages are full-width items in a row it drives itself, so it takes no
  `SnapPaging` value; it shares the rule, not the config.
- `architecture:public-component-api` INV22 gives `useSnapPaging` no non-React
  equivalent by default, since its value feeds only Carousel's `hasSnap`.

## Verification map

| Contract | Verification                                                                                                                                                                                | Representative states                                                                                                                                                                                                                               | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                     | Audit section                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR1, AR1 | Unit and accessibility-tree tests; a real-browser test of the held row in Chromium and WebKit                                                                                               | at rest at each edge; no overflow; under snap paging, a flick away from each edge and a press on the end button                                                                                                                                     | A hidden button that is focusable or exposed fails; so does an edge button that comes back more than two frames after the held row leaves its edge                                                                                                                                                                                                                                  | `audit:Carousel/accessibility` |
| FR2, AR2 | Real-browser keyboard test                                                                                                                                                                  | Enter on "Scroll right" until the end; same on the start                                                                                                                                                                                            | Focus on the page body, a hidden button, or the opposite button fails                                                                                                                                                                                                                                                                                                               | `audit:Carousel/accessibility` |
| FR3      | Real-browser test with swipe and resize                                                                                                                                                     | edge reached with focus outside the carousel                                                                                                                                                                                                        | Focus moving without an edge-button press, or moving twice for one edge, fails                                                                                                                                                                                                                                                                                                      | `audit:Carousel/accessibility` |
| FR5, FR6 | Unit tests of the scroll area's styles and listeners                                                                                                                                        | `hasSnap` absent, `false`, `true`, and a `SnapPaging` value; one and three items per view                                                                                                                                                           | Snapping with `hasSnap` omitted or `false`, a stop other than each child's start edge, gesture listeners under `hasSnap={true}`, `hasSnap={true}` that pages, or paging stops that differ from native snap's fails                                                                                                                                                                  | —                              |
| FR7, AR3 | Real-browser touch and trackpad tests in Chromium and WebKit, under a finger and a trackpad swipe under a coarse and a fine primary pointer, each for the default and for `{pages: 'item'}` | one item per view; three items per view; a partial last page; right-to-left; a short flick over 300 pt/s; a slow release before and past half a page; an edge-button step at three per view; a mouse wheel; `hasSnap={true}` under a trackpad swipe | A rest stop other than FR7's, a move of more than one page per flick, a default flick at three per view that moves one item, a `{pages: 'item'}` flick that moves more than one item, empty space after the last item, an unmirrored right-to-left flick, a fine-pointer trackpad swipe that does not page, a mouse wheel that runs the pager, or `hasSnap={true}` that pages fails | —                              |
| AR4      | `CarouselFocusRing.a11y.chromium.spec.ts`: real-browser pixels of the focused scroller's ring in Chromium                                                                                   | at rest; mid-scroll, sampled level with both scroll buttons                                                                                                                                                                                         | A ring pixel at either button's position that is not the ring's color fails                                                                                                                                                                                                                                                                                                         | `audit:Carousel/accessibility` |
| FR7      | Preview stories at desktop and phone widths, used under a finger, a trackpad under a coarse and a fine primary pointer, and a mouse wheel                                                   | one item per view; three items per view; a partial last page; right-to-left; each with `hasSnap`, with `hasSnap={useSnapPaging()}`, and with `hasSnap={useSnapPaging({pages: 'item'})}`                                                             | A missing story, or a story whose paging stops differ from its native-snap stops, fails                                                                                                                                                                                                                                                                                             | —                              |
| FR7      | Unit tests of the stops; real-browser tests in Chromium and WebKit under a finger and a mouse wheel                                                                                         | a stop within half its preceding step of the end; a resize that moves it further from the end                                                                                                                                                       | A flick or a wheel that rests on that stop, a step back from the end shorter than a full step, or that stop still skipped by native snap once further from the end fails                                                                                                                                                                                                            | —                              |
| FR8      | Bundle test over Core's source with the size report's esbuild options, its eager output attributed by module, and a positive control; real-browser tests of the held row                    | Carousel alone; Carousel with `useSnapPaging`; a server import of the module; an edge-button press at rest and a flick under snap paging                                                                                                            | A Carousel without `hasSnap={useSnapPaging()}` that bundles pager code, an `import()` of the pager, or DOM work on import fails; so do an edge-button press that leaves the paging and edges that lag the held row                                                                                                                                                                  | —                              |
| FR9      | Unit tests of the hook in Carousel                                                                                                                                                          | the hook in Carousel; Carousel unmounting, or dropping the value, mid-settle                                                                                                                                                                        | A listener left after the carousel unmounts or drops the value, or a public `create…` equivalent of the hook, fails                                                                                                                                                                                                                                                                 | —                              |

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

### DEC-2 — `hasSnap` takes native snap or a paging config from `useSnapPaging`

**Reference:** `component:Carousel/DEC-2`
**Decider:** cixzhang, 2026-11-02

Paging comes from a hook that returns a paging config, `useSnapPaging`. A plain
name such as `usePaging` reads as generic and collides with Pagination.

The config goes on `hasSnap`, the released snap prop: `hasSnap={useSnapPaging()}`.
One prop answers how the carousel snaps. Omitted or `false` does not snap,
`true` is native CSS scroll snap as released, and the config is snap paging on
the same per-item stops. `hasSnap`'s type widens from `boolean` to
`boolean | SnapPaging`: an additive patch with no rename, deprecation, or
codemod. Only the paging config bundles the pager (FR8).

The third state deviates from `architecture:public-component-api` INV3, which
keeps an `is…` or `has…` boolean to a true on/off. The deviation keeps one snap
prop for builders, and that record lists it as a known deviation.

One page is one view: a flick moves one view by default, landing on the item
start edge nearest one viewport on, and the last page rests where the row ends.
`{pages: 'item'}` moves one item per flick. A view page matches a UIKit paging
scroll view, which moves a viewport's width per flick.

Rejected: a separate paging prop beside `hasSnap` — two props would describe
one choice, and a builder would have to learn which one wins.

The naming family `useSnap<Variant>` stands for future snap behaviors. Each
variant is its own hook, so an app bundles only the variants it imports, and
each keeps one behavior. Their values feed only `hasSnap`, so they have no
non-React equivalent by default (`architecture:public-component-api` INV22).

Native CSS scroll snap is the default because it works in every browser and
uses the platform's own momentum. The CSS carousel features (`::scroll-button()`,
`::scroll-marker`, `:target-current`, scroll-state queries, snap events,
`interactivity: inert`) ship in Chromium only, with open accessibility and
internationalization concerns from another engine, so Carousel keeps its own
buttons. Snap paging does only what native snap cannot: UIKit's paging rule and
settle under a finger and a trackpad swipe. Scroll-driven animations are available in every engine
and suit progress or slide effects.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
