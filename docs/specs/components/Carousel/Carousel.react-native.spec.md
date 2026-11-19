---
schema_version: 3
template_version: 7
kind: component
id: component:react-native/Carousel
platform_of: component:Carousel
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [imdreamrunner]
review_triggers:
  [
    public-api,
    behavior,
    layout,
    scrolling,
    interaction,
    motion,
    accessibility,
    platform,
  ]
verified_by: []
modules: []
families: []
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: [spec:AST-082, spec:AST-093, spec:AST-112]
---

# Carousel (React Native) component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | React Native exports `Carousel` under its core name with core's `gap`, `hasButtons`, `hasEdgeFade`, `hasLoop`, `hasSnap` (a boolean, DEC-1) and `padding`, and adds `itemWidth` (`auto`, `peek`, `shelf`, `page`), `hasPageDots` and `backGesture`. `useSnapPaging` and the web's element and styling props stay in the web contract.                                                 |
| Behavior                | A horizontal scroll view with the platform's own momentum. `hasSnap` rests the row on item starts, where the momentum picks the stop; `itemWidth` sizes items against the view so the next one peeks or one fills the view. Previous and next buttons show while the row can scroll that way, and a drag along the row is the carousel's while it can still scroll in that direction. |
| End-user impact         | A person swipes a row of cards or pages that moves and stops like the platform's own, sees the next card peek, and reaches every item with VoiceOver or TalkBack through the row's next and previous actions or the page dots.                                                                                                                                                        |
| Builder impact          | A builder picks peeking cards, a shelf or full-width pages with `itemWidth` instead of sizing items with CSS, and turns on page dots with `hasPageDots`.                                                                                                                                                                                                                              |
| Compatibility/readiness | Not yet released; additive. Draft. Where the carousel differs from this record or `component:Carousel`, a gap line under Current-state impact says so.                                                                                                                                                                                                                                |
| Review checks           | Reject a row that snaps with `hasSnap` off, momentum that is not the platform's, a row that pages, buttons shown with `hasButtons` off, an edge button shown where the row cannot scroll that way, a drag owned in a direction the row cannot scroll, a colour, radius, shadow or spacing not from the theme, or a prop the carousel accepts and ignores.                             |
| Governing rules         | `component:Carousel` FR1, FR2, FR4–FR6 and AR1–AR3; `spec:AST-124` FR3; `spec:AST-082` FR3, FR4, FR7; `spec:AST-093` FR2–FR4; DEC-1–DEC-3 below.                                                                                                                                                                                                                                      |

This table is a review projection; the body below is authoritative.

## Intent

A carousel is a row of cards, a shelf of items or a run of full-width pages
that a person swipes through. Carousel on React Native keeps core's row, its
edge buttons and its snapping, moves on the platform's own scroll view, and adds
what a phone row needs: items sized against the view so the next one peeks
or one fills the view, page dots, and a drag that holds
its own against the back gesture only while the row can still scroll. This
record states only what React Native adds to `component:Carousel` or does
differently.

## Compatibility and migration

- Released default preserved: `not yet released`
- Compatibility class: additive
- Controlled/uncontrolled behavior: not applicable; the row's scroll position
  is its own
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- FR2 gap: with `itemWidth="page"`, pages sit two paddings apart and a
  `gap` the caller gives is dropped.
- FR3 gap: `itemWidth="page"` pages with the platform's paging, one page per
  swipe, whether or not `hasSnap` is set.
- FR3 gap: with `hasSnap` and `itemWidth="peek"`, a swipe moves exactly one
  item, where the platform's momentum picks the stop.
- FR4 gap: `hasEdgeFade` is accepted and draws nothing.
- FR5 gap: while a screen reader runs, the previous and next buttons show
  even with `hasButtons` off.
- FR5 gap: when the focused previous or next button goes away at an edge,
  focus does not move to the row; it goes where the platform puts it
  (`component:Carousel` FR2).
- FR7 gap: the carousel also takes `isBackSwipeAllowed`, a second prop for
  `backGesture="always"`, which it ignores when `backGesture` is set.

## Ownership boundary

**Owns**

- Carousel's React Native props and the props React Native adds (FR1).
- The row's item sizing and snapping on React Native (FR2, FR3).
- The edge buttons, the edge fade and the page dots (FR4–FR6).
- The row's drag ownership and `backGesture` (FR7).
- How the row reads to VoiceOver and TalkBack (AR1–AR4).

**Does not own / non-goals**

- The meaning of core's props, the edge buttons' rule and native snap — owned
  by `component:Carousel`.
- The gesture owner view — owned by `spec:AST-124`.
- What an item draws — owned by the component in it.

## Public concepts

| Concept      | Closed values or states            | Meaning                                                                                                                                      | Availability by variant/orientation/state | Default         | Owner                             | Stability    | Invalid-value behavior           |
| ------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------- | --------------------------------- | ------------ | -------------------------------- |
| item width   | `auto`, `peek`, `shelf`, `page`    | each item's own width; one item per view with the next peeking; two or more per view with the next peeking; one item filling the view, paged | always                                    | `auto`          | `component:react-native/Carousel` | experimental | an unknown value is a type error |
| rest         | free, snap                         | where a swipe can come to rest: anywhere, or an item start the platform's momentum picks                                                     | `hasSnap` (FR3)                           | free            | `component:react-native/Carousel` | experimental | none                             |
| back gesture | `always`, `atLeadingEdge`, `never` | when a back gesture may begin on a drag that starts on the row                                                                               | always                                    | `atLeadingEdge` | `component:react-native/Carousel` | experimental | an unknown value is a type error |
| page dots    | off, on                            | one dot per resting place under the row                                                                                                      | while the row overflows                   | off             | `component:react-native/Carousel` | experimental | none                             |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Basis                                       | Draft review state |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------ |
| FR1 | React Native MUST export the component as `Carousel` (`spec:AST-082` FR3) with core's `children`, `gap` (default 1), `hasButtons` (default true), `hasEdgeFade` (default true), `hasLoop`, `hasSnap` and `padding`, with core's meanings, and the base props `id` and `isHidden` on the root (`spec:AST-082` FR7). `hasSnap` is a boolean (DEC-1). `useSnapPaging`, the region's `aria-label`, `ref`, `handleRef` and the styling props belong to the web contract (`spec:AST-082` FR3, FR4, FR7). React Native adds `itemWidth` (DEC-2), `hasPageDots` (DEC-3) and `backGesture` (FR7).                                                                                                                                                                                                                                                                                                                  | `spec:AST-082` FR3, FR4, FR7; DEC-1–DEC-3   | verify             |
| FR2 | The row MUST be a horizontal scroll view with no scroll indicator, its items in a row `gap` apart and `padding` inside its ends, both from the spacing scale. Each item sits in a box the row measures, and a card in an item fills the box's height, the row's tallest, so a row of cards is even. `itemWidth` sizes each item against the view: `auto` keeps its own width; `peek` draws one item per view with `space.s8` of the next showing at the trailing edge; `shelf` draws the largest number of items, at least two, at which each item is at least 140 dp wide, with `space.s8` of the next showing, in every theme: a layout constant no theme role sets, as core AlertDialog's phone width is; `page` makes each item as wide as the view inside the padding, `gap` apart, so each item rests at the leading padding.                                                                       | `component:Carousel` FR6; DEC-2             | verify             |
| FR3 | Without `hasSnap`, the row scrolls freely with the platform's normal deceleration. With `hasSnap`, it rests at each item's start less the padding, clamped to the scroll range, so every item is a stop and the platform's momentum, at its fast rate, picks the rest (`component:Carousel` FR6); items that cannot reach the leading edge share the end's stop. `page` follows the same rules: with `hasSnap` it rests on a page's start where the momentum picks, and without it it scrolls freely; the row never pages (`component:Carousel` FR5). Under right-to-left every stop counts from the start edge, so the next item lies to the left.                                                                                                                                                                                                                                                       | `component:Carousel` FR5, FR6; DEC-1, DEC-2 | verify             |
| FR4 | With `hasEdgeFade`, the row MUST fade its leading and trailing edges where content overflows, to show that more items lie past them (`component:Carousel`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `component:Carousel`                        | verify             |
| FR5 | While the row overflows and `hasButtons` is set, it MUST show a previous button where it can scroll back and a next button where it can scroll on (`component:Carousel` FR1, FR4); with `hasLoop` both show, and next at the end returns to the start and previous at the start goes to the end. Each is a small ghost `IconButton` in a pill of `color.backgroundPopover` with `radius.full` and the theme's medium shadow, `space.s1` in from the row's edge and centred on the row. Next brings the first item not fully in view to the start edge, and previous does the reverse; the row scrolls there with motion, and at once under Reduce Motion. A drag that starts on a pill moves the row, and with snapping it rests on the next or previous stop for a flick and the nearest one otherwise. When the focused button goes away at an edge, focus moves to the row (`component:Carousel` FR2). | `component:Carousel` FR1, FR2, FR4          | verify             |
| FR6 | With `hasPageDots`, while the row overflows, page dots MUST sit centred `space.s2` under the row: one dot per item start the row can bring to its leading edge (FR3's stops, also on a row that scrolls freely), the current one the stop nearest the row's offset. The dots are `space.s1_5` circles in `color.border`, `space.s1` apart, and the current one is a `space.s4` pill in `color.accent` with `radius.full` that grows over the theme's fast duration, at once under Reduce Motion; the dots' row is at least the touch minimum tall. A tap on the trailing or leading half of the dots' row, or a dot's adjustment, scrolls the row one stop.                                                                                                                                                                                                                                               | DEC-3                                       | verify             |
| FR7 | The row MUST own a horizontal drag only in a direction it can still scroll (`spec:AST-124` FR3). `backGesture` decides the back direction: `atLeadingEdge`, the default, gives a drag toward the back direction to the back gesture once the row shows its first item, and until then the drag scrolls; `always` gives it from any position, while the other direction still scrolls; `never` keeps every horizontal drag. On iOS the leading screen-edge back swipe goes back under every value; on Android the system back gesture starts only at the screen edge and goes back under every value, and under `always` and `atLeadingEdge` a back-direction drag inside the row that the row gives away goes to an enclosing stack's back swipe where one exists, and otherwise moves nothing.                                                                                                           | `spec:AST-124` FR3                          | verify             |

### Allowed variation

- **AV1 — The platform's scroll view.** Momentum, deceleration and
  the snap motion are the platform scroll view's own and may differ between
  iOS and Android.
- **AV2 — Line metrics.** A line's height comes from the theme's leading over
  the platform's own text metrics, so a face can differ by a point.

### Representative states

| State                                       | Required invariant                                         | Allowed variation |
| ------------------------------------------- | ---------------------------------------------------------- | ----------------- |
| `auto`, no snap                             | free scroll; items at their own width                      | AV1               |
| `peek` with `hasSnap`                       | rests on an item start; the next one peeking               | AV1               |
| `shelf`                                     | two or more items per view; the next one peeking           | none              |
| `page` with `hasSnap`                       | rests on a page's start the momentum picks; never pages    | AV1               |
| `page` without `hasSnap`                    | free scroll                                                | AV1               |
| at the start, `atLeadingEdge`               | a drag toward the back direction goes back                 | none              |
| mid-row                                     | the drag scrolls in both directions                        | none              |
| at an edge                                  | that edge's button gone                                    | none              |
| `hasLoop` at the end                        | next returns to the start                                  | none              |
| a screen reader running, `hasButtons` false | no buttons; the row's next and previous actions            | none              |
| page dots                                   | one per item start the row can reach; the current one long | none              |
| right-to-left                               | the next item to the left                                  | none              |
| content that fits                           | no buttons, no dots                                        | none              |

### Transformation and precedence order

- **ORD1 — Rest.** `hasSnap` (an item start the momentum picks), then
  free.
- **ORD2 — Buttons.** No overflow or `hasButtons` off (none), then
  `hasLoop` (both), then the directions the row can scroll.
- **ORD3 — Back gesture.** `backGesture`, then `atLeadingEdge`.

### Performance and resources

- **PR1 — The platform's scrolling.** The row's scrolling, momentum and
  snapping run in the platform's scroll view; JavaScript hears the offset to
  place the buttons and the dots.

## Accessibility contract

- **AR1 — A named region of separate items.** The row is a region named by
  the library's carousel word (OQ1), and each item stays its own element.
- **AR2 — Next and previous.** The row offers next and previous actions that
  scroll it as the buttons do, so no item needs a swipe (`component:Carousel`
  AR3), with `hasButtons` on or off. A gone button is out of the reading
  order (`component:Carousel` AR1).
- **AR3 — Page dots.** With `hasPageDots`, the dots are one adjustable element
  ("Page 2 of 5") whose adjustments move one place.
- **AR4 — Text and motion.** Items scale with Dynamic Type and Android's font
  scale; under Reduce Motion the buttons and the dots move the row at once.

## Design relationships

| Anatomy or state | Design requirement                          | Representation authority   | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------- | -------------------------- | -------------- | ------------------ |
| Row              | a horizontal row of items                   | prescribed by core         | prominent      | FR2, FR3           |
| Peek             | the next item showing at the trailing edge  | prescribed by the platform | supporting     | FR2                |
| Edge buttons     | previous and next pills over the row's ends | prescribed by core         | supporting     | FR5                |
| Page dots        | where the row is                            | prescribed by the platform | supporting     | FR6                |

The component implements design requirements without copying their rationale.

Platform control (`spec:AST-093` FR2): the platform's horizontal scroll view,
UIScrollView on iOS and the horizontal scroll view on Android, through React
Native's `ScrollView`, with its snapping. Neither platform has a
carousel control of its own in React Native. Guideline pages (`spec:AST-093`
FR3): Scroll views, Page controls and Accessibility in the Apple Human
Interface Guidelines; Carousel in Material 3.

Theme values read (`spec:AST-093` FR4): the spacing scale for `gap` and
`padding`, `space.s1`, `space.s1_5`, `space.s2`, `space.s4`, `space.s8`,
`color.backgroundPopover`, `color.border`, `color.accent`, `radius.full`, the
medium shadow, the fast duration, `IconButton`'s tokens, and the theme's
Reduce Motion setting.

### Native pieces

| Native piece             | Record             | What this record uses it for                                                          |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------- |
| `AstryxGestureOwnerView` | `spec:AST-124` FR3 | the row's drag ownership against back gestures and scrollers, and `backGesture` (FR7) |

## Family and system relationships

- `component:Carousel` owns the props, the edge buttons' rule and native snap;
  this record states how React Native scrolls and pages them.
- `spec:AST-124` owns the gesture owner view and how frames arbitrate drags.

## Verification map

| Contract | Verification                                                                                                                              | Representative states                                                                                                                                              | Mutation or failure expectation                                                                                                                                           | Audit section                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| FR1      | Type tests of Carousel's props against the core contract; a contract drift test                                                           | each core prop; each web-only prop                                                                                                                                 | a renamed prop, an offered web-only prop, or an accepted and ignored prop fails                                                                                           | `audit:react-native/Carousel/api`      |
| FR2, FR3 | Unit tests of item sizing and rest stops through the package's testing doubles (`spec:AST-112` FR15); Simulator and emulator swipe checks | each `itemWidth`; a shelf at several view widths; `hasSnap` on and off; `page` with and without `hasSnap`; a `gap` with `page`; a partial last page; right-to-left | a wrong item width or shelf count, a stop off an item start, a snapping row with `hasSnap` off, a row that pages, or a dropped `gap` fails                                | `audit:react-native/Carousel/scroll`   |
| FR4      | Captures with content overflowing each edge                                                                                               | at the start; mid-row; at the end                                                                                                                                  | an edge with overflow and no fade fails                                                                                                                                   | `audit:react-native/Carousel/look`     |
| FR5, FR6 | Unit tests of the buttons, the loop and the dots; captures                                                                                | each edge; `hasLoop`; `hasButtons` off with a screen reader on; a drag on a pill; page dots on a snapping and a free row                                           | a button where the row cannot scroll, a button with `hasButtons` off, a loop that does not wrap, or a dot count that differs from the item starts the row can reach fails | `audit:react-native/Carousel/controls` |
| FR7      | Simulator and emulator checks of back gestures against the row                                                                            | at the start; mid-row; each `backGesture`                                                                                                                          | a back gesture that takes a drag the row can scroll, or a row that keeps a drag it cannot scroll under `atLeadingEdge`, fails                                             | `audit:react-native/Carousel/drag`     |
| AR1–AR4  | VoiceOver and TalkBack checks; unit tests of the region, the actions and the dots                                                         | next and previous actions; page dots; Reduce Motion                                                                                                                | an unnamed region, an item merged into another, or a row with no actions fails                                                                                            | `audit:react-native/Carousel/a11y`     |

## Decision log

### DEC-1 — Paging is the scroll view's own

**Reference:** `component:react-native/Carousel/DEC-1`
**Decider:** imdreamrunner, 2026-11-18

On a phone, the platform's scroll view already snaps to offsets and pages with
its own momentum, on the UI thread and with no code of the library's. React
Native's `hasSnap` is therefore a boolean that turns on snapping to item
starts, where the platform's momentum picks the stop, for every item width.
`useSnapPaging`, which exists to keep a web pager out of bundles that do not
use it, has no React Native form.

### DEC-2 — Items can size themselves against the view

**Reference:** `component:react-native/Carousel/DEC-2`
**Decider:** imdreamrunner, 2026-11-18

A web caller sizes items against the viewport with CSS, a percentage or
container units. A child of a React Native horizontal scroll view has no
viewport width to resolve against, so `itemWidth` sizes peeking cards, a shelf
or full-width pages for the caller.

### DEC-3 — A phone carousel can show page dots

**Reference:** `component:react-native/Carousel/DEC-3`
**Decider:** imdreamrunner, 2026-11-18

A phone carousel of peeking cards or full-width pages shows where it is with
page dots, and the dots are also its adjustable control for screen readers.
`hasPageDots` turns them on.

## Open questions

- **OQ1 — How does a React Native carousel take its own name?**
  (`human-api`) The web names each carousel region with `aria-label`, which
  stays in the web contract, so every React Native carousel reads the same
  library word and two rows on one screen sound alike. Options: a portable
  name prop for the region, defaulting to the carousel word; or the carousel
  word only, with the rows' own headings telling them apart.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
