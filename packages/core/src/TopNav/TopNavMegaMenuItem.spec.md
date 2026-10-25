---
schema_version: 3
template_version: 7
kind: component
id: component:TopNavMegaMenuItem
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by: [packages/core/src/TopNav/TopNavMegaMenu.test.tsx]
modules: []
families: [family:navigation-destinations]
design_specs: [design:reduced-motion]
architecture:
  [architecture:interaction-modality, architecture:component-theming-surface]
contributing: []
system_specs: []
---

# TopNavMegaMenuItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `TopNavMegaMenuItem` with `title`, `description`, `icon`, `href`, `onClick`, and `as`; target `top-nav-mega-menu-item` with a `mode` state.                                   |
| Behavior                | One destination in a mega menu: a rich tile in the desktop panel and a row in the drawer. A drawer row closes the drawer on activation.                                       |
| End-user impact         | Users see a title, description, and icon per destination. Keyboard users cannot reach or activate a desktop item that has `onClick` but no `href` (see Current-state impact). |
| Builder impact          | None.                                                                                                                                                                         |
| Compatibility/readiness | Records shipped behavior; no public change. Two implementation gaps (see Current-state impact).                                                                               |
| Review checks           | Reject a drawer item that leaves the drawer open after activation or drops caller props and styling.                                                                          |
| Governing rules         | `architecture:interaction-modality` INV4; WCAG 2.1.1; `component:TopNav` render modes.                                                                                        |

This table is a review projection; the body below is authoritative.

## Intent

TopNavMegaMenuItem is one destination inside a TopNavMegaMenu. It renders itself
for the desktop panel or the mobile drawer from the TopNav render mode. Consumer
usage lives in `TopNavMegaMenuItem.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Desktop action items are not keyboard operable.** In the desktop panel, an
  item with `onClick` and no `href` renders a `div` with no role and no tab
  stop, so keyboard users cannot reach or activate it. WCAG 2.1.1 and
  `architecture:interaction-modality` INV4 require an operable keyboard path.
- **Color transition under reduced motion.** The desktop tile's background color
  still animates when reduced motion is requested; `design:reduced-motion` DR3
  allows no animated property for a fine pointer.

## Ownership boundary

**Owns**

- The item element in both modes, its content order, and drawer close on
  activation (FR1–FR4).

**Does not own / non-goals**

- Destination acceptance and blocking for every `href` this component renders —
  owned by `family:navigation-destinations`.
- Panel layout, grid, and the drawer group — owned by
  `component:TopNavMegaMenu`.
- Router link rendering — owned by `LinkProvider` and `as`.

## Public concepts

No component-local concept beyond the consumer props.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                       | Basis                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | Outside the drawer the item is the `as` component, else the `LinkProvider` link, else `<a>` when `href` is set, and a `div` otherwise. It shows an icon box, then the title and the description, carries `top-nav-mega-menu-item`, and runs `onClick` on click. | Current source and tests |
| FR2 | In `drawer` mode the item is a link when `href` is set and a `<button type="button">` otherwise, carries `data-mode="drawer"`, and on activation runs `onClick` and then closes the AppShell drawer.                                                            | Current source and tests |
| FR3 | Both modes forward the `ref`, `tabIndex`, other DOM props, and event handlers, and merge `className`, `style`, and `xstyle` after component styles.                                                                                                             | Current source and tests |
| FR4 | Both modes paint the shared focus outline on keyboard focus and use the shared press feedback.                                                                                                                                                                  | Current source and tests |

### Allowed variation

- **AV1 — Optional parts.** Icon and description may be absent.

### Representative states

| State         | Required invariant                        | Allowed variation |
| ------------- | ----------------------------------------- | ----------------- |
| Desktop link  | Link tile with title and description.     | Icon.             |
| Drawer link   | Row link; activation closes the drawer.   | —                 |
| Drawer action | Button row; activation closes the drawer. | —                 |

### Transformation and precedence order

- **ORD1 — Link element.** `as`, then `LinkProvider`, then `<a>`.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Drawer actions are buttons.** A drawer item without `href` is a native
  button.
- **AR2 — Link names.** A link item's name is its title and description text.

## Design relationships

| Anatomy or state | Design requirement                         | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------ | ------------------------------ | -------------- | ------------------ |
| Tile             | Icon box, title, description.              | Current source and public docs | Supporting     | FR1                |
| Drawer row       | Nav-row styling with optional description. | Current source                 | Supporting     | FR2                |

`TopNavMegaMenuItem.doc.mjs` declares no anatomy of its own, so no
anatomy-theming map is recorded.

## Family and system relationships

- `family:navigation-destinations` owns the accept/block decision for each
  destination this component renders.
- `component:TopNavMegaMenu` places items in its panel grid and drawer group.

## Verification map

| Contract | Verification                                                       | Representative states       | Mutation or failure expectation          | Audit section                            |
| -------- | ------------------------------------------------------------------ | --------------------------- | ---------------------------------------- | ---------------------------------------- |
| FR1, FR2 | `TopNavMegaMenu.test.tsx` TopNavMegaMenuItem and drawer-item tests | Desktop; drawer link/button | Wrong element or lost description fails. | `audit:TopNavMegaMenuItem/behavior`      |
| FR3      | `TopNavMegaMenu.test.tsx` TopNavMegaMenuItem pass-through tests    | Both modes                  | Dropped props or styling fails.          | `audit:TopNavMegaMenuItem/behavior`      |
| FR4      | `TopNavMegaMenu.test.tsx` drawer focus-ring test                   | Drawer item                 | Missing shared ring classes fail.        | `audit:TopNavMegaMenuItem/accessibility` |

Read from source, with no focused test yet: the drawer button's `type="button"` (FR2); a desktop item's `onClick` and icon box (FR1); press feedback (FR4); the `div` for a desktop item without `href` (FR1); the desktop item's forwarded `tabIndex` (FR3); the forwarded `ref` and the `top-nav-mega-menu-item` target and its `mode` state (FR1–FR3); the `as` and `LinkProvider` precedence (FR1, ORD1); closing the drawer on activation (FR2) and the desktop focus outline (FR4).

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples. It links to their
owners.
