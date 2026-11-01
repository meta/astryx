---
schema_version: 3
template_version: 7
kind: component
id: component:TopNavMegaMenu
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, accessibility]
verified_by:
  [
    packages/core/src/TopNav/TopNavMegaMenu.test.tsx,
    apps/storybook/stories/TopNavMenu.stories.tsx,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:interaction-modality,
    architecture:public-component-api,
    architecture:component-theming-surface,
  ]
contributing: []
system_specs: []
---

# TopNavMegaMenu component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `TopNavMegaMenu` with `label`, `items` and `featured` slots, `delay` (150), `hideDelay` (250), and `onOpenChange`; target `top-nav-mega-menu` with a `mode` state.                                                                                    |
| Behavior                | In the bar, a button that opens a wide panel of links below the whole TopNav on hover or click; the panel is a labeled group, not an ARIA menu. In the drawer, a disclosure that expands items and featured content inline. Hidden in the mobile bar. |
| End-user impact         | Users browse a grid of destinations with descriptions and a featured card; keyboard users reach the panel's links from the trigger; drawer users expand the group in place.                                                                           |
| Builder impact          | None.                                                                                                                                                                                                                                                 |
| Compatibility/readiness | Records shipped behavior; no public change. Four current-state gaps (see Current-state impact).                                                                                                                                                       |
| Review checks           | Reject exposing the panel as `role="menu"`, wrapping it in a modal dialog, keyboard activation that closes an open panel, or a collapsed drawer group that stays reachable.                                                                           |
| Governing rules         | `architecture:public-component-api` INV5 and INV7; `architecture:interaction-modality`; `component:TopNav` render modes.                                                                                                                              |

This table is a review projection; the body below is authoritative.

## Intent

TopNavMegaMenu is a TopNav entry that reveals a large panel of destinations and
featured content. It owns the trigger, the panel's open, close, and dismissal
behavior, the panel layout, and the expandable drawer group. Consumer usage
lives in `TopNavMegaMenu.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: open state is internal; `onOpenChange`
  reports it
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **The trigger announces a menu.** The trigger carries `aria-haspopup="true"`,
  which WAI-ARIA 1.2 defines as a menu popup, while the panel is a
  `role="group"` (FR5).
- **Motion under reduced motion.** The panel's fade and 4 px slide, the drawer
  group's height, the chevrons' rotation, and the trigger's background and text
  color still animate when reduced motion is requested. `design:reduced-motion` DR1–DR3 allow no animated property for a
  fine pointer and only a short opacity change for touch.
- **Same-label drawer groups share an id.** The drawer group's id is derived
  from `label`, so two mega menus with the same label in one drawer produce
  duplicate ids.
- **The drawer trigger drops the ref.** In `drawer` mode the disclosure button
  receives the caller's other DOM props but not `ref`.
  `architecture:public-component-api` INV8 has the ref reach the element the
  contract promises.

## Ownership boundary

**Owns**

- The trigger, panel, open/close and dismissal behavior, panel layout, and
  drawer group (FR1–FR11).

**Does not own / non-goals**

- Item rendering — owned by `component:TopNavMegaMenuItem`; featured cards —
  owned by `component:TopNavMegaMenuFeaturedCard` or the caller.
- Render mode and slot — owned by `component:TopNav`.
- Native popover dismissal and layer hosting — owned by the shared popover and
  layer runtime.

## Public concepts

No component-local concept beyond the consumer props in
`TopNavMegaMenu.doc.mjs`.

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Basis                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| FR1  | In `default` mode the trigger is a `<button>` showing `label` and a chevron that turns when open; it carries `top-nav-mega-menu`, the forwarded `ref`, and other DOM props, exposes `aria-expanded`, and its `aria-controls` names the panel.                                                                                                                                                                                                                                                                      | Current source and tests |
| FR2  | The panel is an auto popover with the trigger as its native invoker, anchored below the closest enclosing `<nav>` and aligned to the trigger's TopNav slot. The browser's light dismiss closes it, and opening a sibling mega menu closes it.                                                                                                                                                                                                                                                                      | Current source and tests |
| FR3  | On a hover-capable pointer, hovering opens after `delay` ms and the panel stays transient: leaving the trigger and panel closes it after `hideDelay` ms, and re-entering the trigger cancels a pending close. A click pins it open. A click within 500 ms of a hover-open pins rather than closes; re-hovering an open panel does not restart that window. After a close, the pointer entering the panel does not reopen it.                                                                                       | Current source and tests |
| FR4  | Enter and Space open the panel and never close an open one. Escape closes it and returns focus to the trigger.                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests |
| FR5  | The panel is a `role="group"` named by `label`, not a `menu` and not a modal dialog. The group is followed by a close button named by `@astryx.popover.close` that stays visually hidden until it holds focus. A click-open moves focus to the panel's first link or button; a hover-open does not move focus.                                                                                                                                                                                                     | Current source and tests |
| FR6  | The panel paints its own surface: `items` in a two-column grid, then `featured` beside it, wrapping on narrow widths. The panel is at most `min(960px, 100dvw − 16px)` wide and at most the space below the nav tall; taller content scrolls inside the panel. Without a reduced-motion preference, opening fades and slides in from 4 px above.                                                                                                                                                                   | Current source           |
| FR7  | `onOpenChange` fires `true` when the panel shows and `false` when it hides, whatever the cause.                                                                                                                                                                                                                                                                                                                                                                                                                    | Current source           |
| FR8  | Caller `onClick`, `onMouseEnter`, and `onMouseLeave` on the trigger run before the built-in behavior and compose with it; a caller handler that calls `preventDefault()` cancels the built-in open or toggle for that event.                                                                                                                                                                                                                                                                                       | Current source and tests |
| FR9  | In `drawer` mode the trigger is a full-width disclosure button with `aria-expanded` and `aria-controls` and `data-mode="drawer"`; activating it toggles the group, which holds `items` (rendering their drawer form) then `featured`. Collapsed content is `inert` and `aria-hidden`, and the group clips while collapsed and while it expands, and stops clipping once fully expanded. Without a reduced-motion preference, expansion animates the group's height. The trigger's `aria-controls` names the group. | Current source and tests |
| FR10 | In `mobile-bar` mode TopNavMegaMenu renders nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and tests |
| FR11 | The bar trigger and drawer trigger paint the shared focus outline.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source and tests |

### Allowed variation

- **AV1 — Slot content.** `items` may be any nodes; `featured` may be any nodes.

### Representative states

| State            | Required invariant                              | Allowed variation |
| ---------------- | ----------------------------------------------- | ----------------- |
| Hover-open       | Transient; closes when the pointer leaves.      | Delays.           |
| Click-open       | Pinned; stays open when the pointer leaves.     | —                 |
| Keyboard-open    | Opens on Enter or Space; Escape returns focus.  | —                 |
| Tall content     | Panel scrolls inside; surface edges stay fixed. | Height.           |
| Drawer collapsed | Content inert and hidden.                       | —                 |

### Transformation and precedence order

- **ORD1 — Trigger handlers.** Caller handler first, then the built-in handler.

### Performance and resources

- **PR1 — Timers.** Hover timers clear on close and unmount.

## Accessibility contract

- **AR1 — Group, not menu.** A link grid is exposed as a named group, not an
  ARIA menu, and not a modal dialog.
- **AR2 — Trigger state.** The trigger exposes its expanded state and the panel
  it controls.
- **AR3 — Drawer disclosure.** The drawer trigger exposes its expanded state;
  collapsed content is unreachable.

## Design relationships

| Anatomy or state | Design requirement                                       | Representation authority       | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Trigger          | Bar-item styling with a chevron.                         | Current source and public docs | Prominent      | FR1                |
| Panel            | Wide surface below the nav: item grid and featured area. | Current source and public docs | Prominent      | FR6                |
| Drawer group     | Disclosure row with items and featured content.          | Current source                 | Supporting     | FR9                |

`TopNavMegaMenu.doc.mjs` declares no anatomy of its own, so no anatomy-theming
map is recorded.

## Family and system relationships

- `family:overlay-dismissal` owns Escape and close-request ordering for this
  component's popover.
- `component:TopNav` supplies the render mode and slot and is the panel's anchor.
- `architecture:public-component-api` INV5 and INV7 govern forwarding and
  handler composition.

## Verification map

| Contract          | Verification                                                        | Representative states                       | Mutation or failure expectation                      | Audit section                        |
| ----------------- | ------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------- | ------------------------------------ |
| FR1, FR5, AR1–AR2 | `TopNavMegaMenu.test.tsx` default-mode and popup-semantics suites   | Closed and open                             | A menu role, dialog wrapper, or broken link fails.   | `audit:TopNavMegaMenu/accessibility` |
| FR2, FR3          | `TopNavMegaMenu.test.tsx` hover/click guard and dismissal suites    | Hover, click, leave, sibling, light dismiss | A lost guard or stale open state fails.              | `audit:TopNavMegaMenu/behavior`      |
| FR4               | `TopNavMegaMenu.test.tsx` keyboard suite                            | Enter, Space, Escape                        | Toggling closed or lost focus return fails.          | `audit:TopNavMegaMenu/accessibility` |
| FR8               | `TopNavMegaMenu.test.tsx` pass-through and owned-handler suites     | Bar and drawer                              | A replaced handler fails.                            | `audit:TopNavMegaMenu/behavior`      |
| FR9–FR11, AR3     | `TopNavMegaMenu.test.tsx` mobile-bar, drawer, and focus-ring suites | Collapsed and expanded                      | Reachable collapsed content or a missing ring fails. | `audit:TopNavMegaMenu/behavior`      |

Read from source, with no focused test yet: the visually hidden close button after the group (FR5); the forwarded `ref`, the `top-nav-mega-menu` target and its `mode` state, and the bar and drawer chevrons' turn (FR1, FR9); the drawer group's clipping while it expands and its height animation (FR9); where a click-open puts focus (FR5); the caller `preventDefault()` cancellation (FR8); anchoring below the enclosing `<nav>` and slot alignment (FR2); FR6; FR7; and the bar trigger's focus outline (FR11).

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, or popover
mechanics. It links to their owners.
