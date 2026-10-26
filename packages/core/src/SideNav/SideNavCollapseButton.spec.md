---
schema_version: 3
template_version: 7
kind: component
id: component:SideNavCollapseButton
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
    apps/storybook/stories/SideNavCollapseOwnership.stories.tsx,
  ]
modules: []
families: []
design_specs: [design:bidirectionality, design:reduced-motion]
architecture: [architecture:public-component-api]
contributing: []
system_specs: []
---

# SideNavCollapseButton component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `SideNavCollapseButton` with `collapsible` (`{isCollapsed, onCollapsedChange}`), `handleRef` (deprecated), `label`, `size`, and `children` (replacement icon).                                                            |
| Behavior                | An icon-only ghost Button that toggles the SideNav rail between expanded and collapsed, inside SideNav or anywhere else on the page. It renders nothing when collapse is unavailable or AppShell is in its mobile layout. |
| End-user impact         | Users collapse and expand the side rail with one named button whose chevron points the right way in either writing direction.                                                                                             |
| Builder impact          | None.                                                                                                                                                                                                                     |
| Compatibility/readiness | Records shipped behavior; no public change. One implementation gap (see Current-state impact).                                                                                                                            |
| Review checks           | Reject a caller `onClick` that replaces the toggle, a button rendered in AppShell's mobile layout, or a chevron that does not mirror in right-to-left.                                                                    |
| Governing rules         | `architecture:public-component-api` INV7; `design:bidirectionality` DR4; `component:Button`.                                                                                                                              |

This table is a review projection; the body below is authoritative.

## Intent

SideNavCollapseButton is the control that collapses and expands the SideNav
rail. It owns where its collapse state comes from, its name, and its chevron.
Consumer usage lives in `SideNavCollapseButton.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: reads state from `collapsible`, else the
  deprecated `handleRef`, else the enclosing SideNav (FR1)
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Reduced motion on touch changes at once.** Under reduced motion the
  chevron's rotation changes at once on every pointer; `design:reduced-motion`
  DR2 has a touch-screen change cross-fade within 200 ms.

## Ownership boundary

**Owns**

- The state source, visibility, name, toggle, and chevron (FR1–FR5).

**Does not own / non-goals**

- The rail's collapse, resize, and persistence behavior — owned by SideNav.
- Button rendering, sizes, and focus ring — owned by `component:Button`.

## Public concepts

| Concept      | Closed values or states                                    | Meaning                                   | Availability by variant/orientation/state | Default           | Owner                             | Stability                      | Invalid-value behavior |
| ------------ | ---------------------------------------------------------- | ----------------------------------------- | ----------------------------------------- | ----------------- | --------------------------------- | ------------------------------ | ---------------------- |
| State source | `collapsible`, `handleRef` (deprecated), enclosing SideNav | Where collapse state is read and toggled. | Everywhere.                               | Enclosing SideNav | `component:SideNavCollapseButton` | Stable; `handleRef` deprecated | Not applicable.        |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                           | Basis                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | State comes from `collapsible` when given (always collapsible; toggling calls `onCollapsedChange` with the opposite of `isCollapsed`), else from the SideNav that the deprecated `handleRef` points at, else from the enclosing SideNav.                                                                                                                                                                                                            | Current source and tests |
| FR2 | It renders nothing when the state source is not collapsible or AppShell reports its mobile layout.                                                                                                                                                                                                                                                                                                                                                  | Current source and tests |
| FR3 | It renders an icon-only ghost Button named by `label`, else by the translated `@astryx.sideNavCollapseButton.collapseSidebar` or `.expandSidebar` for the current state, at `size`, with the forwarded `ref` and other props.                                                                                                                                                                                                                       | Current source and tests |
| FR4 | A caller `onClick` runs, then the toggle; a caller `onClick` that calls `preventDefault()` cancels the toggle for that click.                                                                                                                                                                                                                                                                                                                       | Current source and tests |
| FR5 | The default icon is a chevron pointing toward the inline start while expanded and turned while collapsed; it mirrors in right-to-left; its rotation animates only without a reduced-motion preference; under reduced motion it changes at once for a fine pointer, and on a touch screen it MUST cross-fade within 200 ms (`design:reduced-motion` DR2, DR3). Implementation gap: on a touch screen it also changes at once. `children` replace it. | Current source           |

### Allowed variation

- **AV1 — Icon.** `children` may replace the chevron.

### Representative states

| State                  | Required invariant                                 | Allowed variation |
| ---------------------- | -------------------------------------------------- | ----------------- |
| Inside SideNav         | Toggles that SideNav.                              | —                 |
| Outside with handleRef | Toggles the referenced SideNav.                    | —                 |
| Controlled             | Calls `onCollapsedChange`; state follows the prop. | —                 |
| Mobile layout          | Not rendered.                                      | —                 |

### Transformation and precedence order

- **ORD1 — State source.** FR1's order.
- **ORD2 — Name.** `label`, then the state-dependent default.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Named control.** The button always has a name describing its action
  (FR3).

## Design relationships

| Anatomy or state | Design requirement                    | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------- | ------------------------ | -------------- | ------------------ |
| Chevron          | Points toward the collapse direction. | Current source           | Supporting     | FR5                |

`SideNavCollapseButton.doc.mjs` declares no anatomy of its own, so no
anatomy-theming map is recorded.

## Family and system relationships

- `component:Button` renders the control.
- `design:bidirectionality` DR4 governs the chevron's mirroring.

## Verification map

| Contract       | Verification                                                               | Representative states                                                     | Mutation or failure expectation                                          | Audit section                               |
| -------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| FR1, FR2       | `SideNav.test.tsx` handleRef, outside-button, and collapse-ownership tests | Inside, handleRef, controlled                                             | A stale or wrong state source fails.                                     | `audit:SideNavCollapseButton/behavior`      |
| FR1, FR3, ORD2 | `SideNav.test.tsx` outside-button and controlled-collapsible tests         | Own `collapsible`; `label` override; expanded and collapsed default names | A wrong state source, an ignored `label`, or a stale default name fails. | `audit:SideNavCollapseButton/accessibility` |
| FR4            | `SideNav.test.tsx` consumer onClick test                                   | Outside with handleRef                                                    | A replaced toggle fails.                                                 | `audit:SideNavCollapseButton/behavior`      |
| FR3            | `SideNav.test.tsx` footer icon row sizing tests                            | Built-in button; explicit `size` outside the nav                          | A Button-default size or an ignored explicit size fails.                 | `audit:SideNavCollapseButton/behavior`      |

Read from source, with no focused test yet:

- FR2: rendering nothing when the state source is not collapsible or AppShell
  is in its mobile layout.
- FR3: the ghost variant and the forwarded `ref`.
- FR4: that the caller `onClick` runs before the toggle, and its
  `preventDefault()` cancellation.
- FR5.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples. It links to their
owners.
