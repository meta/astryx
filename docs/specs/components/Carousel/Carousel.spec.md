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
system_specs: [spec:AST-085, spec:AST-025, spec:AST-094, spec:AST-107]
---

# Carousel component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `hasSnap` turns on native CSS scroll snap, exactly as released (FR5, FR6). Snap paging is a separate opt-in config prop, `<Carousel hasSnap <pagingProp>={useSnapPaging()} />`: native snap's stops with UIKit's paging feel under a finger (FR5, FR7). The paging prop's name is open and written `<pagingProp>` in this record. `createSnapPaging(element, options?)` is the non-React path (FR9). The edge scroll buttons hide and hand off focus at an edge (FR1–FR4). |
| Behavior                | Native snap stops each item at its start edge and leaves the momentum to the platform. Snap paging uses the same stops: under a finger a flick moves one view by default, or one item with `{pages: 'item'}`, by `spec:AST-094` FR3's paging rule. An edge button whose direction has run out is hidden and takes no tab stop; when the focused one runs out, focus moves to the scroll area.                                                                              |
| End-user impact         | People who swipe a paging carousel on a phone feel iOS paging; people on a carousel without it download no paging code. A keyboard user who scrolls to the first or last item stays inside the carousel.                                                                                                                                                                                                                                                                   |
| Builder impact          | `hasSnap` is unchanged. Paging is one opt-in prop fed by `useSnapPaging()`. A Carousel without it bundles no pager code (about 40 KB less than a build where the pager comes with Carousel).                                                                                                                                                                                                                                                                               |
| Compatibility/readiness | Additive: `hasSnap` keeps today's native snapping and gains no paging. Implementation gap: `<pagingProp>`, `useSnapPaging`, and `createSnapPaging` are not built; shipped Carousel still uses native `disabled` on edge buttons. Evidence gap: `{pages: 'item'}` is not measured against UIKit's group paging (FR7).                                                                                                                                                       |
| Review checks           | Reject pager code reachable from Carousel's default import; a lazy `import()` of the pager; snap paging on a carousel that did not pass `useSnapPaging`; `hasSnap` alone that pages; snap paging stops that differ from native snap's; a claim that `{pages: 'item'}` matches UIKit before it is measured; a dependency on a Chromium-only carousel feature; focus left on a hidden edge button.                                                                           |
| Governing rules         | `spec:AST-094` FR3, FR6, DEC-25; `spec:AST-107` FR6; `architecture:public-component-api` INV22; `architecture:react-component-runtime` INV13; `spec:AST-085` FR1, FR4; `spec:AST-025` FR12; `architecture:interaction-modality` INV1.                                                                                                                                                                                                                                      |

This table is a review projection; the body below is authoritative.

## Intent

Carousel shows a horizontally scrolling row of items inside a labelled region,
with optional scroll buttons at each edge. This record covers how the row snaps,
the opt-in snap paging and its non-React path, and what the edge scroll buttons
do when their direction runs out. Other Carousel behavior is uncontracted until
this record grows.

## Compatibility and migration

- Released default preserved: yes. `hasSnap` keeps its released native snapping
  and gains no paging. A carousel without `hasSnap` or `<pagingProp>` does not
  snap.
- Compatibility class: additive API (`<pagingProp>`, `useSnapPaging`,
  `createSnapPaging`); edge focus is a behavior correction with no API change.
- Controlled/uncontrolled behavior: unchanged.
- Migration decision: DEC-1 (edge focus), DEC-2 (snap and snap paging).

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The `hasSnap` prop and its native snap, the `<pagingProp>` config prop, and
  the `useSnapPaging` and `createSnapPaging` APIs.
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
- Looping, mouse-drag paging, autoplay, dots, edge fades, and slide semantics —
  uncontracted.

## Public concepts

| Concept                               | Closed values or states      | Meaning                                                                                                                                   | Availability by variant/orientation/state | Default           | Owner                | Stability | Invalid-value behavior                       |
| ------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------- | -------------------- | --------- | -------------------------------------------- |
| `hasSnap`                             | boolean                      | Native CSS scroll snap (FR6)                                                                                                              | Every Carousel                            | `false`           | `component:Carousel` | stable    | —                                            |
| `<pagingProp>`                        | absent; a `SnapPaging` value | Snap paging (FR7). Implies native snap's stops. The name is open                                                                          | Every Carousel                            | absent            | `component:Carousel` | stable    | TypeScript rejects other values              |
| `useSnapPaging(options?)`             | returns `SnapPaging`         | The hook whose value turns on snap paging. Exported from `@astryxdesign/core/SnapPaging` and the package root                             | React callers                             | —                 | `component:Carousel` | stable    | —                                            |
| `createSnapPaging(element, options?)` | returns `{destroy()}`        | Snap paging on any horizontally scrolling element whose direct children are its stops, with no React. Same module and exports as the hook | Non-React callers                         | —                 | `component:Carousel` | stable    | —                                            |
| `SnapPaging`                          | opaque                       | The configured snap paging. Callers make it only with `useSnapPaging` and pass it only to `<pagingProp>`                                  | —                                         | —                 | `component:Carousel` | stable    | —                                            |
| `SnapPagingOptions`                   | `{pages?: 'view' \| 'item'}` | Options for the hook and the factory. `pages` sets what one flick moves (FR7). A field is added only by a current record                  | —                                         | `{pages: 'view'}` | `component:Carousel` | stable    | TypeScript rejects unknown fields and values |
| Edge scroll button                    | available, run out           | Whether content remains in that button's direction                                                                                        | Both edges when the carousel overflows    | —                 | `component:Carousel` | stable    | not applicable                               |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Basis                                                         | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------ |
| FR1 | An edge scroll button whose direction has run out is hidden. While hidden it takes no tab stop and is not exposed to assistive technology. It stays mounted so layout does not shift. This is removal under `spec:AST-085` FR4, not a disabled control.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | DEC-1                                                         | settled            |
| FR2 | When the focused edge scroll button runs out, focus moves to the scroll area without scrolling it. This holds when the content no longer overflows and the scroll area is out of the tab order (`spec:AST-025` FR12): it still takes focus programmatically. Focus never lands on the page body or on a hidden button.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | DEC-1; `spec:AST-085` FR4                                     | settled            |
| FR3 | The handoff happens once per edge transition, and only while the edge button held focus. An edge reached by swipe, resize, or wheel while focus is elsewhere moves nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `architecture:interaction-modality` INV8                      | settled            |
| FR4 | An edge scroll button that is available behaves as an ordinary Button.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `family:buttons`                                              | settled            |
| FR5 | `hasSnap` takes a boolean. `true` (written `hasSnap`): native snap, FR6, exactly as released, with no gesture code. `<pagingProp>` takes a `SnapPaging` value, made only by `useSnapPaging`: snap paging, FR7. `<pagingProp>` implies snap stops: the carousel snaps as with `hasSnap` whether or not `hasSnap` is given, and the pager settles on those same per-item stops. `hasSnap` alone keeps native snapping and never pages. With neither, the scroll area does not snap. A new `SnapPaging` value on a later render does not restart a settle or attach the gesture again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | DEC-2                                                         | settled            |
| FR6 | Native snap uses CSS scroll snap only: `scroll-snap-type: inline mandatory` on the scroll area, `scroll-snap-align: start` on each direct child, and `scroll-padding` matching the carousel's padding. Every item is a stop, also when several items show at once, and the platform's own momentum picks where a swipe rests. The edge buttons scroll with `scrollBy`, and the current position comes from `scrollend` and `IntersectionObserver`. Native snap adds no gesture code. It does not depend on `::scroll-button()`, `::scroll-marker`, `:target-current`, scroll-state container queries, snap events, or `interactivity: inert`; one of these MAY be added under `@supports` only where it changes no behavior, name, role, or focus order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | DEC-2                                                         | settled            |
| FR7 | Snap paging uses native snap's stops (FR6): each direct child's start edge, measured from the inline start and mirrored in right-to-left layout, with the last stops clamped where the row ends so no empty space shows. A gap sits between stops and is never a stop. Under a finger, and under a trackpad where the primary pointer is coarse, a release picks its rest page by `spec:AST-094` FR3's paging rule: at most one page from the page the drag started on. The settle starts as `spec:AST-094` FR6's paging paragraph says. With the paging config, a flick moves one view by default: the release settles on the item start edge nearest one viewport on in the flick's direction, and the last page rests where the row ends; `{pages: 'item'}` moves one item per flick instead. Under right-to-left layout, pages run from the inline start. With one item per view both give the same stops. Where the primary pointer is fine, a mouse or trackpad keeps native snapping. An edge button steps about one view: the viewport width less half an item, landing on the nearest stop and moving at least one stop. Evidence gap: the one-item-per-flick feel is not yet measured against UIKit's group paging; measure before claiming parity. | DEC-2; `spec:AST-094` FR3, FR6, DEC-25                        | settled            |
| FR8 | Carousel's module imports no pager code: not the internal pager, its paging motion, or its gesture code. The `useSnapPaging` and `createSnapPaging` module imports that code statically, and Carousel only calls attach and detach on the `SnapPaging` value from an effect. The pager is tree-shaken by module boundary, with no lazy `import()` (`architecture:react-component-runtime` INV13), so a Carousel without `<pagingProp>={useSnapPaging()}` bundles no pager code. Importing the module does no DOM work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | DEC-2; `architecture:react-component-runtime` INV13           | settled            |
| FR9 | `createSnapPaging(element, options?)` attaches FR7 to `element` and returns a handle whose `destroy()` removes every listener it added. `useSnapPaging(options?)` is a thin wrapper over it: Carousel hands its scroll area to the factory the value carries, and the hook has no behavior of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `architecture:public-component-api` INV22; `spec:AST-107` FR6 | settled            |

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
| Right-to-left                          | Pages run from the inline start; stops and flick directions mirror                                                                                             | —                       |
| `hasSnap` without `<pagingProp>`       | Native snap; no pager code loaded or run                                                                                                                       | Platform momentum       |

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

| Contract | Verification                                                                                                                                                    | Representative states                                                                                                                                                                                             | Mutation or failure expectation                                                                                                                                                                                                                                                                              | Audit section                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| FR1, AR1 | Unit and accessibility-tree tests                                                                                                                               | at rest at each edge; no overflow                                                                                                                                                                                 | A hidden button that is focusable or exposed fails                                                                                                                                                                                                                                                           | `audit:Carousel/accessibility` |
| FR2, AR2 | Real-browser keyboard test                                                                                                                                      | Enter on "Scroll right" until the end; same on the start                                                                                                                                                          | Focus on the page body, a hidden button, or the opposite button fails                                                                                                                                                                                                                                        | `audit:Carousel/accessibility` |
| FR3      | Real-browser test with swipe and resize                                                                                                                         | edge reached with focus outside the carousel                                                                                                                                                                      | Focus moving without an edge-button press, or moving twice for one edge, fails                                                                                                                                                                                                                               | `audit:Carousel/accessibility` |
| FR5, FR6 | Unit tests of the scroll area's styles and listeners                                                                                                            | `hasSnap` absent, `false`, `true`; `<pagingProp>` without `hasSnap`; `<pagingProp>` with `hasSnap`; one and three items per view                                                                                  | Snapping without `hasSnap` or `<pagingProp>`, a stop other than each child's start edge, gesture listeners under `hasSnap` alone, `hasSnap` alone that pages, or paging stops that differ from native snap's fails                                                                                           | —                              |
| FR7, AR3 | Real-browser touch tests in Chromium and WebKit, under a finger and under an iPad-style coarse-pointer trackpad, each for the default and for `{pages: 'item'}` | one item per view; three items per view; a partial last page; right-to-left; a short flick over 300 pt/s; a slow release before and past half a page; an edge-button step at three per view; a fine-pointer wheel | A rest stop other than FR7's, a move of more than one page per flick, a default flick at three per view that moves one item, a `{pages: 'item'}` flick that moves more than one item, empty space after the last item, an unmirrored right-to-left flick, or a fine-pointer scroll that runs the pager fails | —                              |
| FR7      | Preview stories at desktop and phone widths, used under a finger and an iPad-style trackpad                                                                     | one item per view; three items per view; a partial last page; right-to-left; each with `hasSnap` alone, with `<pagingProp>={useSnapPaging()}`, and with `<pagingProp>={useSnapPaging({pages: 'item'})}`           | A missing story, or a story whose paging stops differ from its native-snap stops, fails                                                                                                                                                                                                                      | —                              |
| FR8      | Bundle test on the built package: each public import built with the size report's options and its eager output attributed by module, base against head          | Carousel alone; Carousel with `useSnapPaging`; `createSnapPaging` alone; a server import of the module                                                                                                            | A Carousel without `<pagingProp>={useSnapPaging()}` that bundles pager code, an `import()` of the pager, or DOM work on import fails                                                                                                                                                                         | —                              |
| FR9      | Unit tests of the factory and the hook                                                                                                                          | `createSnapPaging` on a plain element; `destroy()` mid-settle; the hook in Carousel                                                                                                                               | A listener left after `destroy()`, or a hook with behavior the factory lacks, fails                                                                                                                                                                                                                          | —                              |

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

### DEC-2 — `hasSnap` keeps native snap; paging is an opt-in config prop fed by `useSnapPaging`

**Reference:** `component:Carousel/DEC-2`
**Decider:** cixzhang, 2026-11-02

On 2026-11-02 the owner decided three things. A carousel gets paging through a
prop whose value comes from a hook that returns a paging config; a plain name
such as `usePaging` reads as generic and collides with Pagination. The prop and
the hook names match, as `swipe={createSwipe()}` does. The hook is
`useSnapPaging`.

Later that day the owner revised this: `hasSnap` stays the prop for native CSS
scroll snap. So the paging config goes on its own prop, `<pagingProp>`, whose
name is open. The paging prop implies snap stops: the pager settles on the same
per-item stops as native snap, and `hasSnap` alone keeps native snapping.

The owner also decided what one page is: a flick moves one view by default,
landing on an item start edge, and `{pages: 'item'}` moves one item per flick.
A view page matches a UIKit paging scroll view, which moves a viewport's width
per flick.

The naming family `useSnap<Variant>` and `createSnap<Variant>` stands for
future snap behaviors. Each variant is its own hook and factory, so an app
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

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
