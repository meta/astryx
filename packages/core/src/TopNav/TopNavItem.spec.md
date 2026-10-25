---
schema_version: 3
template_version: 7
kind: component
id: component:TopNavItem
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/core/src/TopNav/TopNav.test.tsx,
    apps/storybook/stories/TopNav.stories.tsx,
  ]
modules: []
families: [family:navigation-destinations]
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

# TopNavItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `TopNavItem` with `label`, `href`, `target`, `as`, `isSelected`, `isDisabled`, `isIconOnly`, `icon`, `children`, and `size`; target `top-nav-item` with `mode` and `selected` states.                                       |
| Behavior                | A link in the TopNav bar or drawer. Selected marks the current page; disabled drops the destination and leaves the tab order; in the drawer, activating it closes the drawer.                                               |
| End-user impact         | Users see and hear which destination is current; a disabled item cannot navigate by any input; drawer users return to the page after choosing a destination.                                                                |
| Builder impact          | None.                                                                                                                                                                                                                       |
| Compatibility/readiness | Records shipped behavior; no prop, default, target, or export changes. Two implementation gaps (see Current-state impact).                                                                                                  |
| Review checks           | Reject a disabled item that keeps an `href` or fires `onClick`, a selected item without `aria-current="page"`, an icon-only item without an accessible name, or a drawer item that leaves the drawer open after navigating. |
| Governing rules         | `component:TopNav` render modes; `architecture:interaction-modality` (shared focus indicator); `architecture:component-theming-surface`.                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

TopNavItem is one destination link inside TopNav. It owns the link's selected,
disabled, and icon-only states and its rendering in the bar and in the mobile
drawer. Consumer usage lives in `TopNavItem.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable; selection is caller-owned
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Caller props can replace item state.** Other DOM props spread onto the link
  after `aria-current`, `aria-disabled`, and `tabIndex`, so a caller value
  replaces them; a caller `tabIndex` makes a disabled item a tab stop again.
  `architecture:public-component-api` INV5 keeps component-owned accessibility
  from being overwritten by accident.
- **Color transition under reduced motion.** The bar link's background and text
  color still animate when reduced motion is requested; `design:reduced-motion`
  DR3 allows no animated property for a fine pointer.

## Ownership boundary

**Owns**

- The link element, its selected, disabled, and icon-only states, and its
  bar and drawer renderings (FR1–FR7).

**Does not own / non-goals**

- Destination acceptance and blocking for every `href` this component renders —
  owned by `family:navigation-destinations`.
- Which item is selected — owned by the caller.
- The bar's slots and render mode — owned by `component:TopNav` and
  `component:AppShell`.
- Router link rendering — owned by `LinkProvider` and the `as` component.

## Public concepts

| Concept   | Closed values or states | Meaning                                         | Availability by variant/orientation/state | Default | Owner                  | Stability | Invalid-value behavior            |
| --------- | ----------------------- | ----------------------------------------------- | ----------------------------------------- | ------- | ---------------------- | --------- | --------------------------------- |
| Selected  | `true`, `false`         | The item is the current page.                   | All modes.                                | `false` | `component:TopNavItem` | Stable    | Not applicable.                   |
| Disabled  | `true`, `false`         | The item cannot navigate.                       | All modes.                                | `false` | `component:TopNavItem` | Stable    | Not applicable.                   |
| Icon only | `true`, `false`         | Hides the visible text; `label` names the link. | All modes.                                | `false` | `component:TopNavItem` | Stable    | Without `icon` the link is empty. |
| Size      | `sm`, `md`, `lg`        | Drawer row height and padding.                  | Drawer mode only; no effect in the bar.   | `md`    | `component:TopNavItem` | Stable    | TypeScript rejects other values.  |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                | Basis                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | An enabled item renders the `as` component, else the `LinkProvider` link component, else `<a>`, with `href` and `target`, the forwarded `ref`, and other DOM props. It shows `icon`, then `children` if given, else `label`.                             | Current source and tests |
| FR2 | `isSelected` sets `aria-current="page"` and the selected treatment; the selected fill stays under hover and touch press with no overlay.                                                                                                                 | Current source and tests |
| FR3 | `isDisabled` renders a plain `<a>` with no `href` and no `target`, `aria-disabled="true"`, and `tabIndex=-1`, and suppresses clicks, so no input can navigate or fire `onClick`.                                                                         | Current source and tests |
| FR4 | `isIconOnly` hides the text and sets `aria-label` to `label`.                                                                                                                                                                                            | Current source and tests |
| FR5 | In `default` and `mobile-bar` modes the item is a horizontal bar link with `top-nav-item`. In `drawer` mode it is a full-width row sized by `size`, carries `data-mode="drawer"`, and on activation calls `onClick` and then closes the AppShell drawer. | Current source and tests |
| FR6 | Both renderings paint the shared focus outline on keyboard focus and use the shared press feedback.                                                                                                                                                      | Current source           |
| FR7 | `className`, `style`, and `xstyle` merge after component styles.                                                                                                                                                                                         | Current source           |

### Allowed variation

- **AV1 — Theme styling.** Themes may restyle `top-nav-item` per mode and
  selected state.

### Representative states

| State     | Required invariant                            | Allowed variation |
| --------- | --------------------------------------------- | ----------------- |
| Rest      | Link with label.                              | Theme styling.    |
| Selected  | `aria-current="page"`; selected fill.         | Fill color.       |
| Disabled  | No `href`, no tab stop, no click.             | Muted styling.    |
| Icon only | `aria-label` from `label`; no visible text.   | Icon.             |
| Drawer    | Full-width row; activation closes the drawer. | Row size.         |

### Transformation and precedence order

- **ORD1 — Root element.** Disabled `<a>`, then `as`, then `LinkProvider`, then
  `<a>`.
- **ORD2 — Content.** `children`, then `label`.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Current page.** The selected item exposes `aria-current="page"`.
- **AR2 — Disabled.** A disabled item is exposed as disabled and is not a tab
  stop.
- **AR3 — Name.** An icon-only item is named by `label`.

## Design relationships

| Anatomy or state | Design requirement                | Representation authority       | Hierarchy role | Component contract |
| ---------------- | --------------------------------- | ------------------------------ | -------------- | ------------------ |
| Link             | Label with optional leading icon. | Current source and public docs | Prominent      | FR1, FR4           |
| Selected state   | Neutral fill and stronger text.   | Current source                 | Prominent      | FR2                |

`TopNavItem.doc.mjs` declares no anatomy of its own, so no anatomy-theming map
is recorded.

## Family and system relationships

- `family:navigation-destinations` owns the accept/block decision for each
  destination this component renders.
- `component:TopNav` supplies the render mode; `component:AppShell` supplies
  the drawer close action.
- `architecture:interaction-modality` provides the shared focus indicator.

## Verification map

| Contract         | Verification                                                  | Representative states         | Mutation or failure expectation                        | Audit section                    |
| ---------------- | ------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------ | -------------------------------- |
| FR1, ORD1        | `TopNav.test.tsx` TopNavItem anchor, `as`, LinkProvider tests | Default, `as`, provider       | Wrong element or lost precedence fails.                | `audit:TopNavItem/behavior`      |
| FR2–FR4, AR1–AR3 | `TopNav.test.tsx` TopNavItem state tests                      | Selected, disabled, icon only | Missing attribute or a navigating disabled item fails. | `audit:TopNavItem/accessibility` |
| FR5              | `TopNav.test.tsx` disabled-navigation tests in both modes     | Default and drawer            | Lost click forwarding or href handling fails.          | `audit:TopNavItem/behavior`      |

Read from source, with no focused test yet: the disabled plain `<a>` taking precedence over `as` and `LinkProvider` (ORD1, FR3); other DOM props reaching the link (FR1); the `top-nav-item` target and its `mode` and `selected` states (FR5); the selected fill under hover and press (FR2); the drawer row size, `data-mode="drawer"`, and closing the drawer on activation (FR5); FR6; and FR7.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples. It links to
their owners.
