---
schema_version: 3
template_version: 7
kind: component
id: component:TopNav
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/TopNav/TopNav.test.tsx,
    packages/core/src/TopNav/__tests__/TopNavMobileLongHeading.a11y.chromium.spec.ts,
    packages/core/src/AppShell/AppShell.test.tsx,
    apps/storybook/stories/TopNav.stories.tsx,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: []
---

# TopNav component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `TopNav` with `heading`, `startContent` (alias `children`), `centerContent`, `endContent`, and `label`; target `top-nav` with a `mode` state.                                                                                                                     |
| Behavior                | A labeled navigation landmark with start, optional center, and end regions. Inside AppShell's mobile layout it becomes a compact bar (heading, end content, and, while auto toggles are on, a drawer toggle) and its start and center content move into a drawer. |
| End-user impact         | Screen-reader users get a named navigation landmark; phone-width users keep the product heading, end controls, and, while auto toggles are on, a drawer toggle in view while the navigation items move into the drawer.                                           |
| Builder impact          | None. Callers fill slots; `children` is accepted so nav items are not dropped.                                                                                                                                                                                    |
| Compatibility/readiness | Records shipped behavior; no prop, default, target, or export changes. Two implementation gaps (see Current-state impact).                                                                                                                                        |
| Review checks           | Reject dropping `children` when `startContent` is absent, dropping the three-column layout when `centerContent` is present, an unlabeled landmark, or a mobile bar that hides the toggle while drawer content exists and auto toggles are on (FR5).               |
| Governing rules         | `component:AppShell` FR9–FR10 select the render mode; MobileNav owns the drawer dialog; `architecture:component-theming-surface`.                                                                                                                                 |

This table is a review projection; the body below is authoritative.

## Intent

TopNav is the horizontal navigation bar of an application header. It owns the
bar's landmark, its slot layout, and how the bar and its content render in each
of the three modes AppShell selects: the full bar, the mobile bar, and the
drawer. Consumer usage lives in `TopNav.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, target,
  or export changes
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Caller props can replace the landmark's role and name.** Other DOM props
  spread onto the `<nav>` after `role` and `aria-label`, so a caller `role` or
  `aria-label` replaces them. `architecture:public-component-api` INV5 keeps
  component-owned accessibility from being overwritten by accident.
- **Wide end content shifts the center.** The end column sets no minimum width
  of zero, so end content wider than its share widens that column and moves the
  center content toward the start.

## Ownership boundary

**Owns**

- The navigation landmark and its default name (FR1, AR1).
- Slot resolution and the flex and three-column layouts (FR2–FR4).
- The mobile-bar and drawer renderings of the bar itself (FR5, FR6).
- The `<nav>`'s positioning and styling inputs (FR8, FR9).
- The slot each descendant sits in, which TopNav menus read for popover
  alignment (FR7).

**Does not own / non-goals**

- Each item's rendering in each mode — owned by `component:TopNavItem`,
  `component:TopNavMenu`, `component:TopNavMegaMenu`,
  `component:TopNavMegaMenuItem`, `component:TopNavMegaMenuFeaturedCard`, and
  `component:TopNavHeading`.
- Which render mode applies and when — owned by `component:AppShell`.
- The drawer dialog, its header, focus behavior, and dismissal — owned by
  MobileNav; the toggle is MobileNav's `MobileNavToggle`.
- The exported `TopNavRenderContext` and `useTopNavRenderMode` — an uncontracted
  module; this record covers only how TopNav responds to the mode.

## Public concepts

| Concept     | Closed values or states           | Meaning                                         | Availability by variant/orientation/state | Default   | Owner                | Stability | Invalid-value behavior              |
| ----------- | --------------------------------- | ----------------------------------------------- | ----------------------------------------- | --------- | -------------------- | --------- | ----------------------------------- |
| Render mode | `default`, `mobile-bar`, `drawer` | Full bar, compact phone bar, or drawer content. | Set by AppShell or the exported context.  | `default` | `component:AppShell` | Stable    | TypeScript rejects other values.    |
| Slot        | `start`, `center`, `end`          | The region a descendant renders in.             | `default` mode.                           | `start`   | `component:TopNav`   | Stable    | Not caller-settable; set by TopNav. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                             | Basis                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | In `default` and `mobile-bar` modes TopNav renders one `<nav role="navigation">` named by `label`, or by the translated `@astryx.topNav.landmarkLabel` ("Top navigation") when `label` is omitted. It carries `top-nav`, the forwarded `ref`, and other DOM props; `mobile-bar` adds `data-mode="mobile-bar"`.                                                                        | Current source and tests |
| FR2 | `startContent` wins over `children`; `children` render as start content only when `startContent` is `null` or `undefined`.                                                                                                                                                                                                                                                            | Current source and tests |
| FR3 | Without `centerContent` the bar is a flex row: heading then start content at the inline start, end content pushed to the inline end.                                                                                                                                                                                                                                                  | Current source and tests |
| FR4 | With `centerContent` the bar is a three-column grid (`1fr auto 1fr`) that centers the center content while the start and end regions each fit their equal share.                                                                                                                                                                                                                      | Current source and tests |
| FR5 | `mobile-bar` mode renders the heading, then the end content and, when drawer content exists and auto toggles are on, the mobile nav toggle at the inline end. Start and center content do not render. The heading yields width first so end content and the toggle stay on screen. Drawer content exists when start or center content is present or AppShell passes side nav content. | Current source and tests |
| FR6 | `drawer` mode renders a MobileNav whose header is `heading` and whose body is start then center content in a vertical list, a divider when items and side nav content are both present, then any side nav content AppShell passes. With neither, TopNav renders nothing.                                                                                                              | Current source and tests |
| FR7 | In `default` mode TopNav tells start, center, and end descendants which slot they are in.                                                                                                                                                                                                                                                                                             | Current source           |
| FR8 | The `<nav>` itself is not a positioned element, so it creates no stacking context.                                                                                                                                                                                                                                                                                                    | Current source and tests |
| FR9 | `className`, `style`, and `xstyle` merge onto the `<nav>` after component styles in `default` and `mobile-bar` modes.                                                                                                                                                                                                                                                                 | Current source           |

### Allowed variation

- **AV1 — Slot content.** Caller content varies without becoming TopNav anatomy.
- **AV2 — Theme styling.** Themes may restyle `top-nav` per mode without changing
  regions, order, or the landmark.

### Representative states

| State                             | Required invariant                                                       | Allowed variation   |
| --------------------------------- | ------------------------------------------------------------------------ | ------------------- |
| Heading and items, no center      | Flex row; end content at the inline end.                                 | Gaps and padding.   |
| Center content present            | Three-column grid; center centered while each side fits its share (FR4). | Column content.     |
| Mobile bar with a long heading    | With auto toggles on, toggle and end content stay inside the bar.        | Heading truncation. |
| Mobile bar with no drawer content | No toggle.                                                               | —                   |
| Drawer with items and side nav    | Items, divider, side nav content.                                        | Item modes.         |

### Transformation and precedence order

- **ORD1 — Start content.** `startContent`, then `children` (FR2).

### Performance and resources

- **PR1 — No measurement.** TopNav observes no size and registers no listener.

## Accessibility contract

- **AR1 — Named landmark.** Every rendered bar is a navigation landmark with an
  accessible name (FR1).
- **AR2 — Toggle reachable.** In `mobile-bar` mode with drawer content and auto
  toggles on, the toggle stays fully on screen, and inside the opened drawer the close button
  stays fully in the viewport, even with a long heading.

## Design relationships

| Anatomy or state      | Design requirement                                | Representation authority       | Hierarchy role | Component contract |
| --------------------- | ------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Product icon and name | Heading slot at the inline start.                 | Current source and public docs | Prominent      | FR3, FR5           |
| Navigation items      | Start or center content.                          | Current source and public docs | Prominent      | FR2–FR4, FR6       |
| More menu             | A caller-placed menu; TopNav renders none itself. | Public docs                    | Supporting     | FR2                |
| Flex area             | End content for search, actions, or profile.      | Current source and public docs | Supporting     | FR3, FR5           |

No anatomy-theming map is recorded yet; the block is optional during migration.
Mapping TopNav's four anatomy parts against the family's seven targets, by
delegation where a part belongs to a sub-component, is deferred. Each family
component's record names its own target.

## Family and system relationships

- `component:AppShell` selects the render mode and passes side nav content.
- MobileNav renders the drawer TopNav fills.
- `architecture:component-theming-surface` owns target qualification.

## Verification map

| Contract     | Verification                                    | Representative states                           | Mutation or failure expectation                            | Audit section                |
| ------------ | ----------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- | ---------------------------- |
| FR1, AR1     | `TopNav.test.tsx` landmark tests                | Default and mobile-bar; default and custom name | A missing role or name fails.                              | `audit:TopNav/accessibility` |
| FR2–FR4, FR8 | `TopNav.test.tsx` slot tests                    | Each slot; all slots; center without start/end  | A dropped slot, wrong precedence, or positioned nav fails. | `audit:TopNav/layout`        |
| FR5, FR6     | `AppShell.test.tsx` mobile suites               | Heading-only; items; items with side nav        | A missing toggle or duplicated items fails.                | `audit:TopNav/behavior`      |
| AR2          | `TopNavMobileLongHeading.a11y.chromium.spec.ts` | Long heading at phone width                     | The toggle or close button leaves the viewport.            | `audit:TopNav/accessibility` |

Read from source, with no focused test yet: the mobile bar's part order (FR5); the drawer's `heading` header (FR6); other DOM props reaching the `<nav>` (FR1); the auto-toggle condition (FR5); rendering nothing in `drawer` mode with no content (FR6); the `top-nav` target and its `mode` state (FR1); the flex and grid layout geometry (FR3, FR4); that start and center content do not render in the mobile bar (FR5); the drawer's content order and divider (FR6); FR7; and FR9.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, item behavior, or
the drawer's dialog behavior. It links to their owners.
