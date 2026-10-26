---
schema_version: 3
template_version: 7
kind: component
id: component:SideNavItem
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/core/src/SideNav/SideNav.test.tsx,
    apps/storybook/stories/SideNav.stories.tsx,
  ]
modules: []
families: [family:navigation-destinations, family:overlay-dismissal]
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:component-size-cascade,
    architecture:interaction-modality,
    architecture:public-component-api,
    architecture:component-theming-surface,
  ]
contributing: []
system_specs: [spec:AST-085]
---

# SideNavItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `SideNavItem` with `label`, `href`, `as`, `onClick`, `icon`, `selectedIcon`, `isSelected`, `isDisabled`, `endContent`, `actions`, `children`, `collapsible`, and `size`; target `side-nav-item` with `size`, `selected`, and `disabled` states.               |
| Behavior                | One SideNav row: a link or button with optional icon and passive end content, optional row-level actions beside it, and optional nested children that can expand and collapse. In a collapsed rail it is icon-only with a tooltip or a flyout.                |
| End-user impact         | Users see and hear the current page, reach row actions before nested items, expand or collapse groups without navigating, and return to the page after choosing a destination in the mobile drawer.                                                           |
| Builder impact          | None.                                                                                                                                                                                                                                                         |
| Compatibility/readiness | Records shipped behavior; no public change. Four implementation gaps (see Current-state impact).                                                                                                                                                              |
| Review checks           | Reject an interactive control rendered inside the primary element, a link that also toggles collapse, a toggle or action that activates the row, collapsed children that stay reachable, or a drawer activation that leaves the drawer open after navigating. |
| Governing rules         | `component:SideNav` FR1–FR5, DD1 (nesting and row geometry); `family:navigation-destinations`; `architecture:interaction-modality`; `architecture:public-component-api`.                                                                                      |

This table is a review projection; the body below is authoritative.

## Intent

SideNavItem is one destination or group row in SideNav. It owns the row's
primary element, its selected and disabled states, its icon swap, the
placement of passive end content and row-level actions, the expand and collapse
behavior of its nested children, its collapsed-rail tooltip and flyout
interaction, and closing the mobile drawer on activation. Consumer usage lives
in `SideNavItem.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: nested children start expanded and the item
  owns that state unless `collapsible.isCollapsed` is defined; a controlled item
  reports toggle intent through `onCollapsedChange` and flips only when the prop
  changes (FR6)
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **A disabled item leaves the tab order.** A disabled item renders a
  `<button>` with the native `disabled` attribute, so it is skipped by Tab and
  exposes no focusable disabled state. `spec:AST-085` FR1 has a disabled control
  expose `aria-disabled="true"` and keep its tab stop.
- **A disabled parent stays operable in a collapsed rail.** In a collapsed rail,
  a disabled item with children renders its flyout trigger with neither
  `disabled` nor `aria-disabled`, so it keeps its tab stop and announces no
  disabled state; a click does nothing, while Enter opens its flyout. `spec:AST-085` FR2 and
  FR5 have a disabled control block activation and expose its disabled state.
- **A disabled split row's toggle answers only the keyboard.** On a disabled
  item with `href` or `onClick` and children, the expand toggle inherits the
  row's pointer blocking but carries neither `disabled` nor `aria-disabled`, so
  a click does nothing while Tab reaches it and Enter collapses the group. Its
  pointer and keyboard behavior disagree, and its disabled state is not exposed
  (`spec:AST-085` FR5). OQ1 asks whether a disabled item's children stay
  expandable.
- **Reduced motion on touch changes at once.** Under reduced motion the
  chevron's rotation and the group's height change at once on every pointer;
  `design:reduced-motion` DR2 has a touch-screen change cross-fade within
  200 ms.

## Ownership boundary

**Owns**

- The primary element, states, icons, end content, and actions placement
  (FR1–FR5).
- Expand and collapse of nested children, including the independent toggle
  (FR6, FR7).
- Collapsed-rail tooltip and flyout interaction (FR8, FR9).
- Mobile drawer close on activation (FR10).
- Focus outline and reduced-motion behavior (FR11, FR12).

**Does not own / non-goals**

- The nested group's labelling, its collapsed inert state, collapsed-rail
  rendering rules, row width, indent, indent target, and group clipping — owned
  by `component:SideNav` FR1–FR5 and DD1.
- Destination acceptance and blocking — owned by
  `family:navigation-destinations`.
- The rail's collapsed state — owned by SideNav and `component:SideNavCollapseButton`.
- Each control placed in `actions` — owned by that control (name, keyboard,
  disabled state).
- Row fill colors, radius, height, and padding per size — owned by the shared
  nav item styles and the `side-nav-item` target.

## Public concepts

| Concept     | Closed values or states                                                 | Meaning                                                                | Availability by variant/orientation/state | Default               | Owner                   | Stability | Invalid-value behavior    |
| ----------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- | --------------------- | ----------------------- | --------- | ------------------------- |
| Collapsible | `false`, `true`, `{defaultIsCollapsed, isCollapsed, onCollapsedChange}` | Whether and how nested children expand and collapse.                   | Items with children, expanded rail.       | Collapsible, expanded | `component:SideNavItem` | Stable    | Ignored without children. |
| Row shape   | whole-row, split (link or `onClick` plus toggle), with actions          | Derived from `href`/`onClick`, children, `collapsible`, and `actions`. | Expanded rail and drawer.                 | Whole-row             | `component:SideNavItem` | Stable    | Not applicable.           |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Basis                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1  | The primary element is the `as` component, else the `LinkProvider` link, else `<a>`, when `href` is set and the item is enabled; otherwise a `<button type="button">`. A disabled item MUST stay focusable with `aria-disabled="true"` and keep its tab stop (`spec:AST-085` FR1). Implementation gap: a disabled item renders native `disabled` instead, which removes it from the tab order. It shows the icon (`selectedIcon` when selected and given), the label, `endContent`, and, for a whole-row collapsible item, a chevron. `endContent` is passive and renders inside the primary element.                                                                       | Current source and tests |
| FR2  | In an expanded rail and on a collapsed leaf, `isSelected` sets `aria-current="page"` on the primary element, never on a row wrapper. A collapsed parent's flyout trigger carries no `aria-current`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and tests |
| FR3  | A disabled item does not fire `onClick` or navigate. Its row actions stay operable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and tests |
| FR4  | `actions` render as siblings of the primary element at the row's trailing edge, after the toggle and before nested children in DOM and focus order, at the row's control size (`sm`) unless a control sets its own (`architecture:component-size-cascade`). Clicking an action neither activates nor toggles the row. A row wrapper exists only when there are actions or an independent toggle; a falsy `actions` adds none.                                                                                                                                                                                                                                               | Current source and tests |
| FR5  | The forwarded `ref`, other DOM props, `className`, and `style` reach the primary element; `data-testid` marks the row wrapper when one exists, else the primary element; `xstyle` styles the item's outer box.                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current source and tests |
| FR6  | Whether an item with children collapses follows `component:SideNav` FR1. A collapsible item starts expanded unless `defaultIsCollapsed` is true; a controlled item calls `onCollapsedChange` with the next state and changes only when `isCollapsed` changes.                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and tests |
| FR7  | With `href` or `onClick` in an expanded rail, a collapsible item is split: the primary element navigates or fires `onClick` and never toggles, and a separate toggle button named by `@astryx.sideNavItem.expand` or `.collapse` owns `aria-expanded` and `aria-controls`. Without either, the whole primary element toggles and carries `aria-expanded` and `aria-controls`.                                                                                                                                                                                                                                                                                               | Current source and tests |
| FR8  | In a collapsed rail, a leaf item shows a tooltip with its label at the inline end, anchored to the item, including when the rail is collapsed at mount.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests |
| FR9  | In a collapsed rail, an item with children (rendered per `component:SideNav` FR2) opens its flyout: on a hover-capable pointer after a hover-intent delay, leaving closes a hover-opened flyout, and a click-opened one stays; a click under a stationary pointer does not spring it back open; no hover timers run on a coarse pointer. Keyboard opening moves focus into the flyout and Escape restores it to the trigger; hover opening does not move focus. The flyout is labeled by `@astryx.sideNavItem.submenuLabel`, shows the parent label as a header, light-dismisses, and closes when anything inside is clicked. Arrow keys inside it are left to the browser. | Current source and tests |
| FR10 | Inside the mobile drawer, activating a link or button item calls `onClick` and then closes the drawer. Toggling a collapsible parent, clicking a row action, or activating outside the drawer does not close it.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Current source and tests |
| FR11 | Every focusable part paints the shared focus outline; a row with actions paints it on the wrapper when the primary element has focus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests |
| FR12 | The expand chevron's rotation and the nested group's height change animate only without a reduced-motion preference. Under reduced motion they change at once for a fine pointer, and on a touch screen they MUST cross-fade within 200 ms (`design:reduced-motion` DR2, DR3). Implementation gap: on a touch screen they also change at once.                                                                                                                                                                                                                                                                                                                              | Current source           |

### Allowed variation

- **AV1 — Size.** `sm`, `md`, and `lg` change row height and padding.
- **AV2 — Theme styling.** Themes restyle `side-nav-item` per size, selected,
  and disabled state.

### Representative states

| State                      | Required invariant                                                                     | Allowed variation |
| -------------------------- | -------------------------------------------------------------------------------------- | ----------------- |
| Link, selected             | `aria-current="page"` on the link; selected icon if given.                             | Fill.             |
| Disabled button            | `aria-disabled`; focusable; no `onClick`. Implementation gap: native `disabled` (FR1). | Muted styling.    |
| Collapsible without action | Whole row toggles; chevron turns.                                                      | —                 |
| Collapsible with `href`    | Link navigates; separate toggle button collapses.                                      | —                 |
| Actions                    | Actions after toggle, before children; never activate the row.                         | Action content.   |
| Collapsed rail leaf        | Icon-only; tooltip with label.                                                         | —                 |
| Collapsed rail parent      | Icon-only trigger; flyout with header and children.                                    | Delay.            |
| Mobile drawer              | Activation closes the drawer.                                                          | —                 |

### Transformation and precedence order

- **ORD1 — Primary element.** Disabled or no `href` → button; else `as`, then
  `LinkProvider`, then `<a>`.
- **ORD2 — Icon.** `selectedIcon` when selected and given, else `icon`.

### Performance and resources

- **PR1 — Timers.** Flyout hover timers clear on close and unmount, and none are
  scheduled on a coarse pointer.

## Accessibility contract

- **AR1 — Current page.** FR2.
- **AR2 — Disclosure.** Exactly one element owns `aria-expanded` and
  `aria-controls` for the nested group (FR7).
- **AR3 — Focus order.** Row actions come after the primary element and toggle
  and before nested items (FR4).
- **AR4 — Collapsed names.** Collapsed-rail items keep a name per
  `component:SideNav` FR2.

## Design relationships

| Anatomy or state | Design requirement                                  | Representation authority       | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Primary element  | Icon, label, passive end content, optional chevron. | Current source and public docs | Prominent      | FR1                |
| Toggle           | Trailing chevron button of the row control size.    | Current source                 | Supporting     | FR7                |
| Actions          | Trailing row controls.                              | Current source and public docs | Supporting     | FR4                |
| Flyout           | Parent label header over the children.              | Current source                 | Supporting     | FR9                |

`SideNavItem.doc.mjs` declares no anatomy of its own, so no anatomy-theming map
is recorded. Row geometry visual intent is `component:SideNav` DD1.

## Family and system relationships

- `family:overlay-dismissal` owns Escape and close-request ordering for this
  component's popover.
- `component:SideNav` owns nesting geometry and collapsed-rail rendering rules
  this component follows.
- `family:navigation-destinations` owns the accept/block decision for `href`.
- `architecture:interaction-modality` provides the shared focus indicator.

## Verification map

| Contract      | Verification                                                        | Representative states                                                                                                     | Mutation or failure expectation                                                   | Audit section                     |
| ------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------- |
| FR1–FR3, FR5  | `SideNav.test.tsx` SideNavItem suite                                | Link, button, `as`, provider, disabled                                                                                    | Wrong element, lost `aria-current`, or a disabled item that runs `onClick` fails. | `audit:SideNavItem/behavior`      |
| FR4–FR7, AR3  | `SideNav.test.tsx` actions-slot suite                               | Actions with toggle, endContent, disabled; row-wrapper `data-testid`; `defaultIsCollapsed` with whole-row `aria-controls` | Actions inside the primary element or wrong order fails.                          | `audit:SideNavItem/behavior`      |
| FR6, FR7, AR2 | `SideNav.test.tsx` collapsible + href suite                         | Split, whole-row, controlled                                                                                              | A link that toggles or duplicated `aria-expanded` fails.                          | `audit:SideNavItem/accessibility` |
| FR8, FR9      | `SideNav.test.tsx` collapsed, hover-intent, and rail-tooltip suites | Leaf, parent, hover, click, keyboard, coarse                                                                              | Lost delay, focus restore, or tooltip anchor fails.                               | `audit:SideNavItem/behavior`      |
| FR10          | `SideNav.test.tsx` mobile drawer close-on-activate suite            | Link, button, toggle, action, outside drawer                                                                              | Wrong close behavior fails.                                                       | `audit:SideNavItem/behavior`      |
| FR11          | `SideNav.test.tsx` focus ring suite                                 | Plain, split, actions rows                                                                                                | Missing shared ring classes fail.                                                 | `audit:SideNavItem/accessibility` |
| FR3, FR7, FR9 | `SideNav.test.tsx` keyboard operation and focus management suites   | Tab order, Enter/Space toggle, flyout Escape                                                                              | Lost order, a stranded focus, or no focus return fails.                           | `audit:SideNavItem/accessibility` |

Pending conformance: the SideNavItem suite's native-`disabled` assertion and
the keyboard suite's disabled Tab-skip assertion pin FR1's implementation gap;
they change when disabled items follow `spec:AST-085`.

Read from source, with no focused test yet:

- FR1 and ORD1–ORD2: a disabled item with `href` rendering a button, the
  required focusable `aria-disabled` shape (no item renders it yet), the
  button's `type="button"`, the icon, the selected-icon swap, and the whole-row
  chevron.
- FR4: the actions' trailing-edge placement and the wrapper for an independent
  toggle without actions.
- FR5: the forwarded `ref` and `xstyle` on the outer box.
- FR7: the toggle's translated names.
- FR8: the tooltip's inline-end placement.
- FR9: the flyout's light dismiss and close on an inner click.
- FR12; PR1's timer clearing on close; and the `size` and `selected` theme
  states.

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — Do a disabled item's children stay expandable?** (`human-api`)
  Today a disabled split row's toggle ignores the pointer and answers the
  keyboard (Current-state impact).

## Content boundary

This file does not duplicate consumer prop tables, examples, or SideNav's
nesting geometry. It links to their owners.
