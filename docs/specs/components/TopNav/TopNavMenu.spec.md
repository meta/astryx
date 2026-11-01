---
schema_version: 3
template_version: 7
kind: component
id: component:TopNavMenu
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/core/src/TopNav/TopNavMenu.test.tsx,
    packages/core/src/hooks/useMenuHover.test.tsx,
    apps/storybook/stories/TopNavMenu.stories.tsx,
  ]
modules: []
families:
  [
    family:navigation-destinations,
    family:overlay-dismissal,
    family:action-groups,
  ]
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

# TopNavMenu component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `TopNavMenu` with `label`, `items` (`{title, description?, icon?, href?, onClick?}`), `delay` (150), and `hideDelay` (200); target `top-nav-menu`.                                           |
| Behavior                | In the bar, a button that opens a menu of rich items on hover or click, with APG menu keyboard support. In the drawer, a disclosure that expands its items inline. Hidden in the mobile bar. |
| End-user impact         | Mouse users preview destinations on hover; keyboard users move through items with arrows and typeahead; drawer users expand the group in place.                                              |
| Builder impact          | None.                                                                                                                                                                                        |
| Compatibility/readiness | Records shipped behavior; no public change. Three current-state gaps (see Current-state impact).                                                                                             |
| Review checks           | Reject wrapping the popup in a modal dialog, more than one tab stop among items, a collapsed drawer group that stays reachable, or caller trigger handlers that replace the built-in ones.   |
| Governing rules         | `architecture:public-component-api` INV5 and INV7; `architecture:interaction-modality`; `component:TopNav` render modes.                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

TopNavMenu is a TopNav entry that groups several destinations under one label.
It owns the trigger, the hover or click menu popover in the bar, and the
expandable group in the mobile drawer. Consumer usage lives in
`TopNavMenu.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: open and expanded states are internal
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Drawer action items are not keyboard operable.** A drawer item with only
  `onClick` renders a link without `href`, so keyboard users cannot reach or
  activate it. WCAG 2.1.1 and `architecture:interaction-modality` INV4 require an
  operable keyboard path.
- **Motion under reduced motion.** The drawer group's height, the bar and
  drawer chevrons' rotation, the trigger's background and text color, and each
  bar item's background color still animate when reduced motion is requested;
  `design:reduced-motion` DR1–DR3 allow no animated property for a fine pointer
  and only a short opacity change for touch.
- **The drawer trigger drops the ref.** In `drawer` mode the disclosure button
  receives the caller's other DOM props but not `ref`.
  `architecture:public-component-api` INV8 has the ref reach the element the
  contract promises.

## Ownership boundary

**Owns**

- The trigger button, the menu popover and its items, keyboard handling, and the
  drawer group (FR1–FR10).

**Does not own / non-goals**

- Destination acceptance and blocking for every `href` this component renders —
  owned by `family:navigation-destinations`.
- Render mode and slot — owned by `component:TopNav`.
- Popover positioning, native light dismiss, and layer hosting — owned by the
  shared popover and layer runtime.
- Rich panel layouts — owned by `component:TopNavMegaMenu`.

## Public concepts

| Concept   | Closed values or states                                    | Meaning                    | Availability by variant/orientation/state | Default | Owner                  | Stability | Invalid-value behavior               |
| --------- | ---------------------------------------------------------- | -------------------------- | ----------------------------------------- | ------- | ---------------------- | --------- | ------------------------------------ |
| Menu item | `title`, optional `description`, `icon`, `href`, `onClick` | One destination or action. | Bar and drawer.                           | —       | `component:TopNavMenu` | Stable    | A rejected `href` renders no `href`. |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Basis                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1  | In `default` mode the trigger is a `<button>` showing `label` and a chevron that turns when open; it carries `top-nav-menu`, the forwarded `ref`, and other DOM props, and announces a menu popup with its expanded state.                                                                                                                                                                                                                                                                                                                                                                                                                                    | Current source and tests |
| FR2  | On a hover-capable pointer, hovering the trigger opens the menu after `delay` ms and leaving the trigger and the menu closes it after `hideDelay` ms; a hover-open does not move focus. A click opens the menu and moves focus to the first item; a click within 500 ms of a hover-open keeps it open.                                                                                                                                                                                                                                                                                                                                                        | Current source and tests |
| FR3  | The popup is a non-modal popover below the trigger, aligned to the trigger's TopNav slot (start, center, or end). It contains one `role="menu"` named by `label`, followed by a close button named by `@astryx.popover.close` that stays visually hidden until it holds focus.                                                                                                                                                                                                                                                                                                                                                                                | Current source and tests |
| FR4  | Each item is a `role="menuitem"`: an `<a>` when `href` is set (rendering its `href` only when the URL is accepted), else a `div`. Bar items render a native `<a>`, not the `LinkProvider` link. It shows an icon box, the title, and the description, and runs the item's `onClick` on activation.                                                                                                                                                                                                                                                                                                                                                            | Current source and tests |
| FR5  | Items use a roving tab index with exactly one tab stop. ArrowDown and ArrowUp move focus and wrap at both ends; typing a character moves to the matching item; Enter or Space activates the focused item; Escape closes the menu and returns focus to the trigger.                                                                                                                                                                                                                                                                                                                                                                                            | APG menu pattern; tests  |
| FR6  | Caller `onClick`, `onMouseEnter`, and `onMouseLeave` on the trigger run before the built-in open behavior and compose with it instead of replacing it; a caller handler that calls `preventDefault()` cancels the built-in open or toggle for that event. Caller attributes never override the popup wiring.                                                                                                                                                                                                                                                                                                                                                  | Current source and tests |
| FR7  | In `drawer` mode the trigger is a full-width disclosure button with `aria-expanded` and `aria-controls`; activating it toggles the group. Collapsed items are `inert` and `aria-hidden`, and the group clips while collapsed and while it expands, and stops clipping once fully expanded. Without a reduced-motion preference, expansion animates the group's height.                                                                                                                                                                                                                                                                                        | Current source and tests |
| FR8  | Drawer items render through the `LinkProvider` link component; activating one runs the item's `onClick` and then closes the AppShell drawer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source           |
| FR9  | In `mobile-bar` mode TopNavMenu renders nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current source           |
| FR10 | The trigger, each bar item, and each drawer control paint the shared focus outline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Current source and tests |
| FR11 | In the open menu, a press (finger, pen or mouse) that lands on an enabled item and slides across the items acts on the one it lifts on, once, through that item's own activation, with the highlight following the pointer; a lift outside acts on nothing, and a mouse released outside closes the menu. The menu adopts `module:DropdownMenu/useMenuPress` for this (`family:action-groups` FR1–FR5; `module:DropdownMenu/useMenuPress` DEC-7). Link items are undraggable, so a mouse slide is not a drag; a Ctrl-, Cmd- or Shift-click or a middle click on a link item stays the browser's; and keyboard and assistive-technology behavior is unchanged. | Current source and tests |

### Allowed variation

- **AV1 — Timing.** `delay` and `hideDelay` vary per caller.

### Representative states

| State            | Required invariant                                | Allowed variation |
| ---------------- | ------------------------------------------------- | ----------------- |
| Closed           | Trigger with collapsed state.                     | Theme styling.    |
| Hover-open       | Menu open; focus does not move.                   | Delay.            |
| Click-open       | Menu open; focus on the first item.               | —                 |
| Drawer collapsed | Items inert and hidden from assistive technology. | —                 |
| Drawer expanded  | Items reachable; activation closes the drawer.    | Animation.        |

### Transformation and precedence order

- **ORD1 — Trigger handlers.** Caller handler first, then the built-in handler
  (FR6).

### Performance and resources

- **PR1 — Timers.** Hover timers clear on close and on unmount.

## Accessibility contract

- **AR1 — Menu semantics.** The popup is not a modal dialog; the trigger
  announces a menu popup; items are `menuitem`s inside one named `menu`.
- **AR2 — Keyboard.** FR5's keys follow the APG menu pattern.
- **AR3 — Drawer disclosure.** The drawer trigger exposes its expanded state and
  controls the group; collapsed items are unreachable.

## Design relationships

| Anatomy or state | Design requirement                  | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ----------------------------------- | ------------------------------ | -------------- | ------------------ |
| Trigger          | Bar-item styling with a chevron.    | Current source and public docs | Prominent      | FR1                |
| Menu item        | Icon box, title, description.       | Current source and public docs | Supporting     | FR4                |
| Drawer group     | Disclosure row with indented items. | Current source                 | Supporting     | FR7                |

`TopNavMenu.doc.mjs` declares no anatomy of its own, so no anatomy-theming map is
recorded.

## Family and system relationships

- `family:overlay-dismissal` owns Escape and close-request ordering for this
  component's popover.
- `family:navigation-destinations` owns the accept/block decision for each
  destination this component renders.
- `component:TopNav` supplies the render mode and slot.
- `architecture:public-component-api` INV5 and INV7 govern forwarding and
  handler composition.
- `architecture:interaction-modality` provides the shared focus indicator.

## Verification map

| Contract          | Verification                                                      | Representative states                                       | Mutation or failure expectation                                               | Audit section                    |
| ----------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------- |
| FR1, FR3, AR1     | `TopNavMenu.test.tsx` trigger and semantics tests                 | Closed and open                                             | A dialog wrapper or wrong popup type fails.                                   | `audit:TopNavMenu/accessibility` |
| FR4, FR5, AR2     | `TopNavMenu.test.tsx` keyboard tests                              | Arrows, wrap, typeahead, Enter, Escape                      | Extra tab stops or lost activation fails.                                     | `audit:TopNavMenu/accessibility` |
| FR6               | `TopNavMenu.test.tsx` pass-through and owned-handler tests        | Bar and drawer triggers                                     | A replaced built-in handler or lost prop fails.                               | `audit:TopNavMenu/behavior`      |
| FR7, FR10, AR3    | `TopNavMenu.test.tsx` drawer tests                                | Collapsed and expanded                                      | Reachable collapsed items or a missing ring fails.                            | `audit:TopNavMenu/behavior`      |
| Shared menu focus | `useMenuHover.test.tsx`                                           | Hover-open, click-open, Escape, Enter and Space             | Focus moved on hover, not moved in on click, or not returned on Escape fails. | `audit:TopNavMenu/accessibility` |
| FR11              | `TopNavMenu.test.tsx` action-group suite (touch and mouse slides) | Touch and mouse slides across items; undraggable link items | Removing the adoption fails the slide tests.                                  | —                                |

Read from source, with no focused test yet: the visually hidden close button after the menu (FR3); the native `<a>` for bar items, the icon box, and the description (FR4); the forwarded `ref`, the `top-nav-menu` target, and the bar and drawer chevrons' turn (FR1, FR7); the drawer group's clipping while it expands and its height animation (FR7); the caller `preventDefault()` cancellation (FR6); hover opening and closing with `delay` and `hideDelay` (FR2); slot alignment (FR3); FR8; FR9; and the bar trigger and item parts of FR10.

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — Should bar menu items render through the `LinkProvider` link, as the
  drawer items do?** (`human-api`) Today bar items render a native `<a>` and
  drawer items the `LinkProvider` link (FR4, FR8).

## Content boundary

This file does not duplicate consumer prop tables, examples, or popover
mechanics. It links to their owners.
