---
schema_version: 3
template_version: 7
kind: component
id: component:TopNavHeading
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
families: [family:navigation-destinations, family:overlay-dismissal]
design_specs: []
architecture:
  [
    architecture:component-style-authoring,
    architecture:interaction-modality,
    architecture:public-component-api,
    architecture:component-theming-surface,
  ]
contributing: []
system_specs: []
---

# TopNavHeading component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `TopNavHeading` with `logo`, `logoLabel`, `heading`, `superheading`, `subheading`, their `*Href` links, `headerEndContent`, `menu`, and `as`; target `top-nav-heading`. |
| Behavior                | The product identity block. Which parts are links and which part opens the menu follows from which `*Href` props and `menu` are set (FR2).                              |
| End-user impact         | Users reach product, suite, and account destinations and a product switcher menu; screen-reader users hear a named logo link and a named menu.                          |
| Builder impact          | None.                                                                                                                                                                   |
| Compatibility/readiness | Records shipped behavior; no public change. Five implementation gaps (see Current-state impact).                                                                        |
| Review checks           | Reject a logo link without an accessible name, a menu popup wrapped in a modal dialog, or a heading button placed inside `role="menu"`.                                 |
| Governing rules         | `architecture:public-component-api` INV5; `architecture:interaction-modality` (shared focus indicator); `architecture:component-theming-surface`.                       |

This table is a review projection; the body below is authoritative.

## Intent

TopNavHeading presents the product's logo and name, with optional suite and
account lines, in the TopNav heading slot. It owns how those parts become links
or a menu trigger and the product menu popover. Consumer usage lives in
`TopNavHeading.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: the menu's open state is internal
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Menu configurations drop DOM props.** When `menu` is set, other DOM props
  passed to TopNavHeading (beyond `data-testid`, `className`, `style`, `xstyle`,
  and `ref`) do not reach any element. `architecture:public-component-api` INV5
  requires accepted DOM, data, ARIA, and event inputs to reach the owning
  element.
- **Browser default focus rings.** The chevron menu button, the whole-heading
  link, the linked logo, the logo-only link, the menu-configuration heading
  link, and the popover's heading button do not use the shared focus outline;
  keyboard focus on them paints the browser's default ring.
  `architecture:interaction-modality` provides the shared focus indicator these
  controls bypass.

- **NavHeadingMenu nests a second menu.** The heading wraps `menu` in its own
  `role="menu"`; NavHeadingMenu, the documented `menu` content, adds another
  `role="menu"` inside it. WAI-ARIA 1.2 allows a `menu` to own only
  `menuitem`-family items and groups.
- **Links nested in the popover's heading button.** In the links-plus-trigger
  configuration, the popover's heading button repeats the superheading,
  heading, and subheading links inside itself, so interactive content is nested
  inside a button. HTML forbids interactive content inside a `<button>`.
- **The open menu repeats the identity row.** While the menu is open, its
  heading button repeats the logo and text that stay mounted in the bar's block,
  so that content renders twice. `architecture:component-style-authoring` INV7
  has content render once.

## Ownership boundary

**Owns**

- The identity block layout and its link and trigger configurations (FR1–FR6).
- The product menu popover and its close behavior (FR7–FR9).

**Does not own / non-goals**

- Destination acceptance and blocking for every `href` this component renders —
  owned by `family:navigation-destinations`.
- Menu content — owned by the caller; NavHeadingMenu items read the close action this
  component provides (NavHeadingMenu).
- The logo artwork — owned by the caller, typically NavIcon.
- The TopNav heading slot and mobile-bar placement — owned by `component:TopNav`.
- Popover positioning and layer hosting — owned by the shared popover and layer
  runtime.

## Public concepts

| Concept       | Closed values or states                                                            | Meaning                                                    | Availability by variant/orientation/state | Default | Owner                     | Stability | Invalid-value behavior |
| ------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------- | ------- | ------------------------- | --------- | ---------------------- |
| Configuration | logo only, plain, whole link, independent links, whole trigger, links plus trigger | Derived from which `*Href` props and `menu` are set (FR2). | All.                                      | Plain   | `component:TopNavHeading` | Stable    | Not applicable.        |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | The root carries `top-nav-heading` and shows, in order: the logo, a text column (superheading, a heading row, subheading; plain-text lines and the menu-configuration heading link stay on one line with ellipsis, while lines rendered through the Link component wrap), and `headerEndContent` at the inline end. With `menu`, the heading row holds the heading then the chevron button; without `menu` there is no chevron.                                                                                                         | Current source and tests |
| FR2 | Configuration: no `heading` and no `menu` → logo only, a link named by `logoLabel` when `headingHref` is set, else a `div`; `headingHref` alone without `menu` → the whole block is one link; other `*Href` props without `menu` → each line with an href is its own link and a linked logo is named by `logoLabel`, else `heading`; `menu` without any href → the whole block opens the menu; `menu` with hrefs → the links stay independent, and the chevron button and the rest of the block open the menu; otherwise a plain `div`. | Current source and tests |
| FR3 | The logo link, the whole-heading link, the logo-only link, and the menu-configuration heading link use the `as` component, else the `LinkProvider` link, else `<a>`. Supporting lines, and the heading line in the independent-links configuration, use the Link component, which does not receive `as`.                                                                                                                                                                                                                                | Current source and tests |
| FR4 | In both menu configurations, the chevron is a button named by the translated `@astryx.topNav.heading.openMenu` that toggles the menu; it is at least 28 by 28 px.                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests |
| FR5 | On a hover-capable pointer, hovering the block opens the menu immediately and does not move focus; a click within 500 ms of a hover-open keeps the menu open and moves focus to the first menu item, and a later click closes it.                                                                                                                                                                                                                                                                                                       | Current source and tests |
| FR6 | Clicking a link inside a menu configuration navigates without toggling the menu.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source           |
| FR7 | The menu is a non-modal popover below the block, aligned to its start and overlapping it. It contains a heading button that closes the menu (see Current-state impact for its content), then a `role="menu"` region named by `heading` (or `@astryx.topNav.heading.dialogLabel`) that holds `menu`.                                                                                                                                                                                                                                     | Current source and tests |
| FR8 | Escape closes the menu and returns focus to the trigger.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current source and tests |
| FR9 | Descendants of `menu` receive a close action, which NavHeadingMenu items call on selection.                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source           |

### Allowed variation

- **AV1 — Logo artwork and lines.** Any combination of lines may be present; the
  block keeps its order.

### Representative states

| State                      | Required invariant                                            | Allowed variation |
| -------------------------- | ------------------------------------------------------------- | ----------------- |
| Heading with `headingHref` | One link wrapping logo and text.                              | —                 |
| Suite and product links    | Independent links; logo link named.                           | Line content.     |
| Menu, no hrefs             | Whole block triggers; chevron button named.                   | Menu content.     |
| Menu with hrefs            | Links independent; chevron and the rest of the block trigger. | Menu content.     |
| Logo only with href        | Link named by `logoLabel`.                                    | Artwork.          |

### Transformation and precedence order

- **ORD1 — Logo link name.** `logoLabel`, then `heading`.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Named links.** A linked logo without adjacent link text is named by
  `logoLabel` or `heading`.
- **AR2 — Menu semantics.** The popup is not a modal dialog; `role="menu"`
  wraps only the menu content, never the popover's heading button.
- **AR3 — Named trigger.** The chevron button has a translated name and exposes
  the popover's expanded state.

## Design relationships

| Anatomy or state | Design requirement                                                     | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Logo             | Leading product mark.                                                  | Current source and public docs | Prominent      | FR1, FR2           |
| Heading lines    | Superheading, heading, subheading; plain lines stay on one line (FR1). | Current source and public docs | Prominent      | FR1                |
| Menu popover     | Overlaps the block; a heading button closes it.                        | Current source                 | Supporting     | FR7                |

`TopNavHeading.doc.mjs` declares no anatomy of its own, so no anatomy-theming map
is recorded.

## Family and system relationships

- `family:overlay-dismissal` owns Escape and close-request ordering for this
  component's popover.
- `family:navigation-destinations` owns the accept/block decision for each
  destination this component renders.
- `component:TopNav` places the heading in its heading slot and mobile bar.
- NavHeadingMenu items close this menu through the provided close action.
- `architecture:public-component-api` INV5 and `architecture:interaction-modality`
  govern the gaps under Current-state impact.

## Verification map

| Contract          | Verification                                               | Representative states                 | Mutation or failure expectation               | Audit section                       |
| ----------------- | ---------------------------------------------------------- | ------------------------------------- | --------------------------------------------- | ----------------------------------- |
| FR1–FR3, AR1      | `TopNav.test.tsx` TopNavHeading render and logo-name tests | Each configuration                    | A wrong element or unnamed logo link fails.   | `audit:TopNavHeading/behavior`      |
| FR4, FR7, AR2–AR3 | `TopNav.test.tsx` menu popover semantics tests             | Whole trigger; links plus trigger     | A modal wrapper or misplaced menu role fails. | `audit:TopNavHeading/accessibility` |
| FR5, FR8          | `TopNav.test.tsx` hover/click guard tests                  | Hover-open, click, late click, Escape | Losing the guard or focus return fails.       | `audit:TopNavHeading/behavior`      |

Read from source, with no focused test yet: that clicking the block itself opens the menu in the menu-without-hrefs configuration (FR2); the `dialogLabel` fallback name of the menu (FR7); that the rest of the block opens the menu in the links-plus-trigger configuration (FR2); the `top-nav-heading` target (FR1); line truncation, part order, and `headerEndContent` (FR1); `as` and `LinkProvider` rendering (FR3); the chevron button's size (FR4); FR6; the popover's placement (FR7); and FR9.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, or popover
mechanics. It links to their owners.
