---
schema_version: 3
template_version: 7
kind: component
id: component:SideNavHeading
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

# SideNavHeading component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `SideNavHeading` with `icon`, `heading`, `superheading`, `subheading`, their `*Href` links, `headerEndContent`, `menu`, and `as`; target `side-nav-heading`.                                                                       |
| Behavior                | The product identity block at the top of SideNav. Which parts are links and which part opens the menu follows from the `*Href` props and `menu`; in a collapsed rail it is an icon-only link, menu button, or icon with a tooltip. |
| End-user impact         | Users reach product, suite, and account destinations and a product menu, in both the expanded and the collapsed rail; screen-reader users hear named links, a named trigger, and a named menu.                                     |
| Builder impact          | None.                                                                                                                                                                                                                              |
| Compatibility/readiness | Records shipped behavior; no public change. Six implementation gaps (see Current-state impact).                                                                                                                                    |
| Review checks           | Reject a collapsed icon without a name, a menu popup wrapped in a modal dialog, a heading button inside `role="menu"`, or `headerEndContent` rendered inside the whole-heading link.                                               |
| Governing rules         | `architecture:public-component-api` INV5; `architecture:interaction-modality`; `family:navigation-destinations`.                                                                                                                   |

This table is a review projection; the body below is authoritative.

## Intent

SideNavHeading presents the product's icon and name, with optional suite and
account lines, at the top of SideNav. It owns how those parts become links or a
menu trigger, the product menu popover, and the collapsed-rail form. Consumer
usage lives in `SideNavHeading.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: the menu's open state is internal
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Some configurations drop DOM props.** Other DOM props passed to
  SideNavHeading (beyond `data-testid`, `className`, `style`, `xstyle`, and
  `ref`) reach no element in the menu configurations and in the collapsed link
  and menu-button forms. `architecture:public-component-api` INV5 requires
  accepted DOM, data, ARIA, and event inputs to reach the owning element.

- **NavHeadingMenu nests a second menu.** The heading wraps `menu` in its own
  `role="menu"`; NavHeadingMenu, the documented `menu` content, adds another
  `role="menu"` inside it. WAI-ARIA 1.2 allows a `menu` to own only
  `menuitem`-family items and groups.
- **Links nested in the popover's heading button.** In the expanded
  links-plus-trigger configuration, the popover's heading button repeats the
  superheading, heading, and subheading links inside itself, so interactive
  content is nested inside a button. HTML forbids interactive content inside a
  `<button>`.
- **The open menu repeats the identity row.** While the menu is open, its
  heading button repeats the icon and text that stay mounted in the rail's block,
  so that content renders twice. `architecture:component-style-authoring` INV7
  has content render once.
- **Links in the links-plus-trigger form also open the menu.** The block that
  holds the links carries the menu's trigger handlers. With touch or the
  keyboard, activating the heading or suite link both navigates and opens the
  menu, moving focus to its first item. With a mouse, moving the pointer onto
  the block opens the menu at once over it, so a click lands on the menu's heading button, with its repeated links, rather than on the link underneath. Both break FR2's split between
  the links and the menu trigger.
- **End content also opens the menu.** In both menu configurations
  `headerEndContent` renders inside the block that carries the menu's trigger
  handlers. With touch or the keyboard, activating a control there runs that
  control and also opens the menu, moving focus to its first item. With a mouse,
  moving the pointer onto the links or end content opens the menu at once over
  the whole block, so a click on end content lands on the menu's heading button
  and the menu reopens under the pointer. A control in end content is the
  caller's, outside FR2's trigger area.

## Ownership boundary

**Owns**

- The identity block and its link and trigger configurations (FR1–FR4).
- The product menu popover (FR5–FR7).
- The collapsed-rail form (FR8) and the focus outline (FR9).

**Does not own / non-goals**

- Destination acceptance and blocking — owned by
  `family:navigation-destinations`.
- Menu content — owned by the caller (typically NavHeadingMenu).
- The rail's collapsed state — owned by SideNav.

## Public concepts

| Concept       | Closed values or states                                                                              | Meaning                                          | Availability by variant/orientation/state | Default | Owner                      | Stability | Invalid-value behavior |
| ------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------- | ------- | -------------------------- | --------- | ---------------------- |
| Configuration | plain, whole link, whole link with end content, independent links, whole trigger, links plus trigger | Derived from the `*Href` props and `menu` (FR2). | Expanded rail.                            | Plain   | `component:SideNavHeading` | Stable    | Not applicable.        |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Basis                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | In an expanded rail the block carries `side-nav-heading` and shows the icon, a text column (superheading, a heading row, subheading; plain-text lines and the menu-configuration heading link stay on one line with ellipsis, while lines rendered through the Link component wrap), and `headerEndContent`. With `menu`, the heading row holds the heading then the chevron button; without `menu` there is no chevron.                                                                                                    | Current source and tests |
| FR2 | `headingHref` alone without `menu` makes the icon and text one link; with `headerEndContent` that content sits beside the link, not inside it. Other `*Href` props without `menu` make each line with an href its own link, and a linked icon is named by `heading`. `menu` without hrefs makes the whole block, apart from `headerEndContent`, open the menu; `menu` with hrefs makes each line with an href its own link, and the chevron button and the rest of the block, apart from `headerEndContent`, open the menu. | Current source and tests |
| FR3 | The icon link, the whole-heading link, and the menu-configuration heading link use the `as` component, else the `LinkProvider` link, else `<a>`. Supporting lines, and the heading line in the independent-links configuration, use the Link component, which does not receive `as`.                                                                                                                                                                                                                                        | Current source and tests |
| FR4 | The chevron button is named by `@astryx.sideNav.heading.openMenu` and is the popover's trigger.                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source and tests |
| FR5 | On a hover-capable pointer, hovering opens the menu immediately and does not move focus; a click opens it and moves focus to the first menu item; a click within 500 ms of a hover-open keeps it open; Escape closes it and returns focus to the trigger.                                                                                                                                                                                                                                                                   | Current source and tests |
| FR6 | The menu is a non-modal popover below the block, aligned to its start; in the expanded rail it overlaps the block. It contains a heading button that closes the menu (see Current-state impact for its content), then a `role="menu"` named by `heading` that holds `menu`.                                                                                                                                                                                                                                                 | Current source and tests |
| FR7 | Only the collapsed menu form gives `menu` descendants the close action NavMenu items call on selection; the expanded menu forms do not.                                                                                                                                                                                                                                                                                                                                                                                     | Current source           |
| FR8 | In a collapsed rail, without `icon` it renders nothing. With `icon`: `headingHref` makes an icon-only link named by `heading`; else `menu` makes an icon-only button named by `heading` that is the native invoker of its menu popover; else the icon renders alone. Each form shows a tooltip with `heading` at the inline end; `headerEndContent` and the chevron are hidden.                                                                                                                                             | Current source and tests |
| FR9 | Every focusable part paints the shared focus outline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests |

### Allowed variation

- **AV1 — Lines.** Any combination of lines may be present; the block keeps its
  order.

### Representative states

| State                       | Required invariant                                | Allowed variation |
| --------------------------- | ------------------------------------------------- | ----------------- |
| Whole link with end content | End content beside the link.                      | —                 |
| Menu, no hrefs              | Whole block triggers; named chevron button.       | Menu content.     |
| Menu with hrefs             | Links; chevron and the rest of the block trigger. | —                 |
| Collapsed with menu         | Named icon button; flyout menu; tooltip.          | —                 |
| Collapsed without icon      | Nothing renders.                                  | —                 |

### Transformation and precedence order

- **ORD1 — Collapsed form.** `headingHref`, then `menu`, then plain icon.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Named icons.** A linked or button icon without visible text is named
  by `heading`.
- **AR2 — Menu semantics.** The popup is not a modal dialog; `role="menu"` wraps
  only the menu content.

## Design relationships

| Anatomy or state | Design requirement                              | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Icon             | Leading product mark; alone when collapsed.     | Current source and public docs | Prominent      | FR1, FR8           |
| Heading lines    | Superheading, heading, subheading.              | Current source and public docs | Prominent      | FR1                |
| Menu popover     | Overlaps the block; a heading button closes it. | Current source                 | Supporting     | FR6                |

`SideNavHeading.doc.mjs` declares no anatomy of its own, so no anatomy-theming
map is recorded.

## Family and system relationships

- `family:overlay-dismissal` owns Escape and close-request ordering for this
  component's popover.
- `family:navigation-destinations` owns the accept/block decision for each
  `href`.
- NavHeadingMenu items close this menu where the close action is provided
  (FR7).

## Verification map

| Contract     | Verification                                                  | Representative states                            | Mutation or failure expectation                              | Audit section                        |
| ------------ | ------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------ |
| FR1–FR4, AR1 | `SideNav.test.tsx` SideNavHeading and headerEndContent suites | Each configuration                               | Wrong element, unnamed link, or misplaced end content fails. | `audit:SideNavHeading/behavior`      |
| FR5          | `SideNav.test.tsx` SideNavHeading hover/click guard suite     | Hover, click, late click, Escape                 | Lost guard or focus return fails.                            | `audit:SideNavHeading/behavior`      |
| FR6, AR2     | `SideNav.test.tsx` menu popover semantics suite               | Whole trigger; mixed; collapsed                  | A dialog wrapper or misplaced menu role fails.               | `audit:SideNavHeading/accessibility` |
| FR8          | `SideNav.test.tsx` SideNavHeading collapsed suite             | Link, menu, plain, no icon                       | Missing name, tooltip, or invoker fails.                     | `audit:SideNavHeading/behavior`      |
| FR9          | `SideNav.test.tsx` focus ring suite                           | Whole-heading link, collapsed link, menu trigger | A missing shared ring class fails.                           | `audit:SideNavHeading/accessibility` |

Read from source, with no focused test yet:

- FR1: the forwarded `ref`, the `side-nav-heading` target, the order of parts,
  and one-line truncation.
- FR2: that the rest of the block opens the menu in the links-plus-trigger
  configuration.
- FR3: `as` on the icon and menu-configuration heading links, and the Link
  component for the other lines.
- FR5: that hover opens the menu without delay.
- FR6: the popover's placement and the menu's name.
- FR7; FR8's tooltip placement at the inline end; and FR9 on the popover's
  heading button and the linked icon.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, or popover
mechanics. It links to their owners.
