---
schema_version: 3
template_version: 7
kind: component
id: component:MobileNav
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
owners: [cixzhang]
review_triggers: [behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/MobileNav/MobileNav.test.tsx,
    packages/core/src/MobileNav/MobileNavToggle.test.tsx,
    packages/core/src/MobileNav/MobileNavFocus.test.tsx,
    packages/core/src/MobileNav/MobileNavCloseEdgeCases.test.tsx,
    packages/core/src/MobileNav/MobileNavCloseVisibility.test.tsx,
    packages/core/src/MobileNav/MobileNavCloseTiming.test.ts,
    packages/core/src/MobileNav/MobileNavEntryAnimation.test.tsx,
    packages/core/src/MobileNav/MobileNavReopen.test.tsx,
    packages/core/src/MobileNav/MobileNavScrollbarGutter.test.tsx,
    packages/core/src/MobileNav/MobileNavPinchZoom.a11y.chromium.spec.ts,
    packages/core/src/Layer/layerDismissalFamilies.test.tsx,
    packages/core/src/MobileNav/__tests__/MobileNavWidth.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: [design:bidirectionality, design:reduced-motion]
architecture:
  [
    architecture:component-theming-surface,
    architecture:layer-runtime,
    architecture:public-component-api,
  ]
contributing: []
system_specs: []
---

# MobileNav component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `MobileNav` with `isOpen`, `onOpenChange`, `header`, `width` (320), `side` (`start`, `end`, `auto`; default `auto`), `label`, and `children`; target `mobile-nav` with a `side` state; `MobileNavToggle` with `label` and `children`.                                                                                      |
| Behavior                | A modal native dialog with a drawer that slides in from one inline edge, a header with a Close button, and a scrolling content region. Escape, the backdrop, and Close request closing; the dialog stays open while the drawer starts sliding out and closes within the slide-out (FR5), then focus returns to the opener. |
| End-user impact         | Phone users open navigation in a drawer that contains focus, lock the page behind it, close it any usual way, and land back on the control that opened it.                                                                                                                                                                 |
| Builder impact          | None.                                                                                                                                                                                                                                                                                                                      |
| Compatibility/readiness | Records shipped behavior; no public change. Six implementation gaps: automatic side selection uses physical position, reduced motion still animates, its own top layer, close hold, and backdrop, a caller `id` disconnects the Toggle, and a caller `aria-label` and `onCancel` are dropped (see Current-state impact).   |
| Review checks           | Reject a non-modal drawer, a close that hides the drawer before its slide-out runs, focus not returned to a connected opener, a backdrop click inside the drawer that closes it, or a Toggle rendered outside an enabled AppShell mobile layout.                                                                           |
| Governing rules         | `family:overlay-dismissal`; `architecture:layer-runtime` INV14; `component:AppShell` FR10–FR13; `design:bidirectionality` DR7; `design:reduced-motion` DR1–DR3; `architecture:public-component-api` INV5, INV7; `architecture:component-theming-surface`.                                                                  |

This table is a review projection; the body below is authoritative.

## Intent

MobileNav presents mobile navigation in a modal drawer and exports an
AppShell-aware Toggle button for opening and closing it. It owns the drawer's
dialog, placement, motion, close timing, focus return, page scroll lock, and the
Toggle's link to the drawer. Consumer usage lives in `MobileNav.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; runtime, DOM, styling,
  targets, aliases, and public API remain unchanged
- Controlled/uncontrolled behavior: `isOpen` and `onOpenChange` control the
  drawer; without them it follows the enclosing AppShell's drawer state (FR2)
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Automatic side follows physical position.** With `side="auto"`, a trigger
  whose center is in the left half of the viewport opens the drawer at the
  inline start, otherwise at the inline end. In a right-to-left layout the
  inline start is the right edge, so every trigger opens the drawer on the far
  side. `design:bidirectionality` DR7 requires a layered surface to keep
  its start and end relationship to its trigger.
- **A caller `id` disconnects the Toggle.** A caller `id` prop, even
  `undefined`, replaces the drawer id on the dialog, so inside AppShell the
  Toggle's `aria-controls` names no element, breaking `component:AppShell` FR13
  and AR3. `architecture:public-component-api` INV5 keeps component-owned
  accessibility from being overwritten by accident.
- **A caller `aria-label` is dropped.** MobileNav's own name (FR10) replaces a
  caller `aria-label` on the dialog. `architecture:public-component-api` INV5
  has supported ARIA inputs reach the element.
- **A caller `onCancel` never runs.** MobileNav's own cancel handler replaces a
  caller `onCancel` on the dialog. `architecture:public-component-api` INV5 and
  INV7 have supported event inputs reach the element and compose.
- **MobileNav builds its own top layer, close hold, and backdrop.** MobileNav
  calls `showModal()` itself, keeps the dialog open through its close with its
  own timer, and paints its own backdrop fade. `architecture:layer-runtime`
  INV14 has a layer use the runtime's top-layer mounting, presentation hold, and
  backdrop tint rather than building its own.
- **Motion under reduced motion.** Under reduced motion the Drawer's slide and
  the backdrop's fade still run, for 0.01 s, rather than changing at once for a
  fine pointer or cross-fading for touch. `design:reduced-motion` DR2 and DR3
  allow no travel and, for a fine pointer, no animated property.

## Ownership boundary

**Owns**

- The Navigation overlay and its current `mobile-nav` target.
- Drawer placement and motion, the stable Header and Content regions, and the
  connection between AppShell state, MobileNav, and MobileNavToggle (FR1–FR12).
- Canonical anatomy for both exported components. `component:MobileNav` is the
  parent owner; MobileNavToggle has no consumer doc of its own and no separate
  component contract.

**Does not own / non-goals**

- The Close and Toggle button surfaces — delegated to `component:Button`.
- Header or navigation content supplied by the caller.
- A public target for the painted Drawer, Header, or Content region; none exists.
- AppShell responsive policy, when the drawer renders, and its close hold —
  owned by `component:AppShell`.
- Shared Escape and close-request ordering — owned by `family:overlay-dismissal`;
  shared layer hosting — owned by `architecture:layer-runtime`.

## Public concepts

| Concept | Closed values or states | Meaning                                                                          | Availability by variant/orientation/state | Default | Owner                 | Stability | Invalid-value behavior           |
| ------- | ----------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- | ------- | --------------------- | --------- | -------------------------------- |
| Side    | `start`, `end`, `auto`  | The inline edge the drawer enters from; `auto` picks from the opener's position. | Every open.                               | `auto`  | `component:MobileNav` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                      | Basis                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1  | MobileNav renders one native `<dialog>` Navigation overlay containing a Drawer with a stable Header, Close button, and scrollable Content region. The overlay carries `mobile-nav` with the resolved `side`; Drawer, Header, and Content carry no MobileNav public target.                                                                                                                                                                     | Current source, docs, and tests |
| FR2  | `isOpen` and `onOpenChange` win when given; otherwise the drawer reads and changes the enclosing AppShell's drawer state. The dialog uses AppShell's drawer id when there is one, else its own; a caller `id` replaces either (Current-state impact).                                                                                                                                                                                          | Current source and tests        |
| FR3  | Opening calls `showModal()`, and records the focused element as the opener; where focus lands inside the open drawer is uncontracted here. While open, the page's root clips its overflow and keeps its scrollbar gutter; closing releases both.                                                                                                                                                                                               | Current source and tests        |
| FR4  | The native cancel request (Escape) is routed through the shared dismissal stack and requests close only when this drawer is topmost. A click on the overlay outside the Drawer requests close; a click inside does not. The Close button, named by `@astryx.mobileNav.closeNavigation`, requests close. A caller `onClick` on the dialog runs before the backdrop check; one that calls `preventDefault()` cancels that backdrop close.        | Current source and tests        |
| FR5  | After a close request the drawer slides out while the dialog stays open, and the dialog closes within its slide-out transition and no later than 250 ms after the request (on the next task, never in the commit that requests it, under reduced motion or a zero-length transition). Reopening before then cancels the close. Unmounting closes the dialog.                                                                                   | Current source and tests        |
| FR6  | When the dialog closes, focus returns to the recorded opener if it is still connected and was not the document body; otherwise focus is left alone. A reopen that interrupted a close keeps the original opener.                                                                                                                                                                                                                               | Current source and tests        |
| FR7  | The Drawer enters from its resolved inline edge, from off-screen to on-screen, and the backdrop fades in from transparent, without a reduced-motion preference. Under reduced motion, motion follows `design:reduced-motion` DR1–DR3 (Current-state impact records today's shortfall). The overlay clips the off-screen drawer without becoming a scroll container and allows pinch zoom.                                                      | Current source and tests        |
| FR8  | `side="start"` or `"end"` sets the edge. `side="auto"` MUST keep the drawer's start and end relationship to the element that opened it (`design:bidirectionality` DR7). Implementation gap: it resolves on each open from the focused element's physical half of the viewport (left half picks `start`, otherwise `end`); when nothing is focused at open it keeps its last value, and before any open it is `end`.                            | Current source                  |
| FR9  | The Drawer is `width` px wide (default 320), never wider than 85% of the viewport, so a strip of the page stays beside it.                                                                                                                                                                                                                                                                                                                     | Current source and tests        |
| FR10 | The dialog is named by `label`, else a string `header`, else `@astryx.mobileNav.navigation`; a caller `aria-labelledby` outranks all three. A string `header` renders as a level-2 heading; other header content renders as given.                                                                                                                                                                                                             | Current source and tests        |
| FR11 | MobileNavToggle renders only while AppShell reports its mobile layout with mobile navigation enabled. It is an icon-only ghost Button named by default by `@astryx.mobileNav.toggle.open`, with a menu icon unless `children` replace it; it toggles the drawer, exposes `aria-expanded`, and its `aria-controls` carries AppShell's drawer id, which a MobileNav inside that AppShell applies to its dialog unless a caller `id` replaces it. | Current source, docs, and tests |
| FR12 | MobileNav forwards its `ref`, `data-testid`, other DOM props, `className`, `style`, and `xstyle` to the dialog, except that its own `aria-label` (FR10) replaces a caller's (Current-state impact), a caller `onCancel` never runs (Current-state impact), and a caller `id` replaces its id (FR2).                                                                                                                                            | Current source and tests        |

### Allowed variation

- **AV1 — Drawer edge.** The Drawer may resolve to logical start or end through
  the explicit or trigger-derived side behavior.
- **AV2 — Header content.** Header may contain a string rendered through Heading,
  caller-provided content, or only the Close button.
- **AV3 — Navigation content.** Caller-provided navigation content may vary
  without becoming MobileNav-owned anatomy.
- **AV4 — Toggle presence.** Toggle button is absent outside an enabled AppShell
  mobile context.

### Representative states

| State                    | Required invariant                                                                                               | Allowed variation                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Standalone drawer        | Navigation overlay contains Drawer, Header, Close button, and Content.                                           | Caller controls open state and may choose an edge. |
| AppShell drawer          | The same drawer anatomy consumes AppShell mobile state.                                                          | Header and navigation content remain caller-owned. |
| AppShell mobile toggle   | Toggle button controls and references the current drawer.                                                        | Custom button content may replace the menu glyph.  |
| Non-mobile/disabled host | Toggle button does not render.                                                                                   | MobileNav remains owned by the parent contract.    |
| Closing                  | Dialog stays open while the drawer starts sliding out and closes within the slide-out (FR5); then focus returns. | Duration by theme.                                 |
| Reopen mid-close         | Pending close is cancelled; focus stays in the drawer.                                                           | —                                                  |

### Transformation and precedence order

- **ORD1 — Open state.** `isOpen`, then AppShell's drawer state.
- **ORD2 — Name.** A caller `aria-labelledby`, then `label`, then string
  `header`, then the translated default.
- **ORD3 — Close delay.** Bounded by the dialog's slide-out transition and by
  250 ms; the next task under reduced motion or a zero-length transition.

### Performance and resources

- **PR1 — Cleanup.** A pending close timer clears on reopen and unmount, and the
  root overflow and scrollbar gutter are restored on close and unmount.

## Accessibility contract

- **AR1 — Modal dialog.** The open drawer is a modal native dialog with an
  accessible name (FR3, FR10); the page behind it is inert.
- **AR2 — Focus return.** FR6.
- **AR3 — Toggle wiring.** FR11's `aria-expanded` and `aria-controls`.
- **AR4 — Zoom.** Pinch zoom stays available while the drawer is open.

## Design relationships

| Anatomy or state   | Design requirement                                                    | Representation authority       | Hierarchy role | Component contract |
| ------------------ | --------------------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Navigation overlay | Hosts the modal navigation layer and its backdrop.                    | Current source and public docs | Supporting     | FR1, FR4           |
| Drawer             | Paints the sliding mobile navigation surface.                         | Current source and public docs | Prominent      | FR1, FR7–FR9       |
| Header             | Arranges optional header content with the persistent Close button.    | Current source and public docs | Supporting     | FR1, FR10          |
| Content            | Provides the scrolling region for caller-supplied navigation content. | Current source and public docs | Prominent      | FR1                |
| Close button       | Dismisses the current drawer.                                         | `component:Button`             | Supporting     | FR4                |
| Toggle button      | Opens or closes the AppShell-owned mobile drawer state.               | `component:Button`             | Supporting     | FR11               |

Drawer is the primary painted surface, but the only current MobileNav target is
on the full-viewport dialog overlay. Its `none` disposition is a factual
reachability gap, not a decision that the Drawer must remain unthemeable. Header
and Content likewise have no current local target. Close and Toggle retain Button
ownership.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Navigation overlay": {"target": "mobile-nav"},
  "Drawer": {
    "none": {
      "reason": "reachability-gap: No current public target is applied to the painted drawer panel"
    }
  },
  "Header": {
    "none": {
      "reason": "reachability-gap: No current public target is applied to the stable header row"
    }
  },
  "Content": {
    "none": {
      "reason": "reachability-gap: No current public target is applied to the scrollable content region"
    }
  },
  "Close button": {
    "delegatesTo": {"owner": "component:Button", "target": "button"}
  },
  "Toggle button": {
    "delegatesTo": {"owner": "component:Button", "target": "button"}
  }
}
```

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, target
  mapping, delegation, and factual `none` dispositions.
- `architecture:layer-runtime` INV14 gives the runtime top-layer mounting,
  close-request delivery, the presentation hold, the shared exit copy, and the
  backdrop tint; MobileNav decides when it dismisses and how it is presented,
  including its drawer motion and the backdrop's color (Current-state impact
  records today's shortfall).
- `design:reduced-motion` DR1–DR3 govern the drawer's motion under reduced
  motion; `architecture:public-component-api` INV5 and INV7 govern the caller
  `id` and `onCancel` gaps.
- `family:overlay-dismissal` owns shared Escape and platform-close ordering and
  records MobileNav as an adopter.
- `component:AppShell` decides when the drawer renders and holds it visible
  through a close.
- `design:bidirectionality` DR7 governs the automatic-side gap.

## Verification map

| Contract             | Verification                                                                                            | Representative states                                                     | Mutation or failure expectation                                                            | Audit section                   |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------- |
| FR1, FR2, FR10, FR12 | `MobileNav.test.tsx`                                                                                    | Open and closed; string and no header; caller `id` on a standalone drawer | Losing the dialog, name, Close, or forwarded props fails.                                  | `audit:MobileNav/anatomy`       |
| FR2, FR3, FR4        | `MobileNav.test.tsx`; `MobileNavCloseEdgeCases.test.tsx`; `MobileNavScrollbarGutter.test.tsx`           | Escape, backdrop, content click, Close                                    | A wrong close source or a lingering scroll lock fails.                                     | `audit:MobileNav/behavior`      |
| FR4                  | `layerDismissalFamilies.test.tsx` MobileNav cases                                                       | Escape over a required Dialog; cancel while topmost and while not         | Closing when not topmost, or not closing when topmost, fails.                              | `audit:MobileNav/behavior`      |
| FR5, ORD3            | `MobileNavCloseVisibility.test.tsx`; `MobileNavCloseEdgeCases.test.tsx`; `MobileNavCloseTiming.test.ts` | Close, reduced motion, reopen, unmount, the 250 ms bound                  | Closing before the slide-out or a stuck dialog fails.                                      | `audit:MobileNav/behavior`      |
| FR6, AR2             | `MobileNavFocus.test.tsx`                                                                               | Standalone, AppShell, Escape, removed opener                              | Focus not returned, or returned too early, fails.                                          | `audit:MobileNav/accessibility` |
| FR7                  | `MobileNavEntryAnimation.test.tsx`                                                                      | Start and end edges                                                       | Missing starting style or a scroll-container overlay fails.                                | `audit:MobileNav/behavior`      |
| FR11, AR3            | `MobileNavToggle.test.tsx`; `MobileNavReopen.test.tsx`                                                  | Closed, open, reopen                                                      | Broken expanded state or id link fails.                                                    | `audit:MobileNav/accessibility` |
| AR4                  | `MobileNavPinchZoom.a11y.chromium.spec.ts`                                                              | Open drawer on a touch viewport                                           | Pinch zoom blocked fails.                                                                  | `audit:MobileNav/accessibility` |
| FR9                  | `MobileNav.test.tsx` drawer cap test; `MobileNavWidth.a11y.chromium.spec.ts`                            | Default and wide `width` on a narrow viewport                             | A drawer wider than 85% of the viewport fails.                                             | `audit:MobileNav/behavior`      |
| Theming anatomy map  | `scripts/check-knowledge.mjs`; `themingTargets.test.ts`                                                 | Canonical parent anatomy and current target                               | Missing, extra, prefixed, stale, or multiply assigned mappings fail repository validation. | `audit:MobileNav/theming`       |

Read from source, with no focused test yet:

- FR1: the distinct Drawer, Header, and Content elements, and the `mobile-nav`
  target with its `side` state.
- FR2 and FR11: the dialog's own id outside AppShell, and a caller `id`
  replacing AppShell's drawer id inside AppShell.
- FR4: the caller `onClick` running before the backdrop check, and its
  `preventDefault()` cancellation.
- FR8's shipped resolution.
- FR10 and ORD2: the `label` prop, a caller `aria-labelledby` outranking the
  name, the level-2 heading for a string `header`, and other header content
  rendering as given.
- FR11: rendering only in an enabled AppShell mobile layout, the icon-only
  ghost Button, a Toggle `label` replacing the default name, the menu icon, and
  `children` replacing it.
- FR12: the forwarded `ref` and `xstyle`, and the replaced caller `aria-label`
  and `onCancel`.

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — Should Drawer gain a stable public theming target?** (`human-api`) The
  current target reaches the Navigation overlay rather than the primary painted
  drawer surface; this is an audit gap, not settled intent.

## Content boundary

This file does not duplicate consumer prop tables/examples, AppShell responsive
policy, shared layer rules, current audit results, or implementation steps. It
links to their owners.
