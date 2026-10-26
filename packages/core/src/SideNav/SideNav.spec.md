---
schema_version: 3
template_version: 7
kind: component
id: component:SideNav
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-16
owners: [cixzhang]
review_triggers: [layout, behavior, accessibility]
verified_by:
  [
    packages/core/src/SideNav/SideNav.test.tsx,
    apps/storybook/stories/SideNav.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:navigation-destinations]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:internationalization,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-017/FR3]
---

# SideNav component contract

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

This record governs how nested SideNavItem rows are drawn: their width, where
their nesting indent sits, and what the indent area does. It covers SideNav,
SideNavSection, and SideNavItem only as far as that geometry depends on them.
SideNavItem's link and destination safety is governed by
`family:navigation-destinations`; other SideNav behavior remains described by
its source, tests, and consumer docs until a record claims it.

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None. No prop, value, default, or theme target changes.                                                                                                                                                                                                 |
| Behavior                | Every SideNavItem row spans the full width of its nav list at any depth. Depth shows as inline-start indent inside the row: one `--spacing-6` step per level, added to the row's own padding.                                                           |
| End-user impact         | A person scanning a nested nav sees hover, pressed, selected, and focus fills that line up with the top-level rows, and can click a nested row's indent to activate it, as they would its label.                                                        |
| Builder impact          | No new choice or prop. Icons and labels keep their per-depth position. Content placed directly inside a SideNavItem that is not itself a SideNavItem sits at the nav list edge, because the nested group adds no inset; no supported setting insets it. |
| Compatibility/readiness | Nonbreaking change of visual direction (`spec:AST-017/FR3`). The collapsed rail and top-level rows are unchanged. Authority is current; implementation may be staged.                                                                                   |
| Review checks           | Reject a nested row narrower than a top-level row, an indent drawn outside the row, an indent area that shows feedback but does not activate, a clipped focus ring, or an indent in the flyout's top level.                                             |
| Governing rules         | DD1 and FR3–FR5 below; `family:navigation-destinations` for destinations; `architecture:internationalization` for logical direction.                                                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

SideNav is the vertical navigation region of an app. SideNavItem rows can nest
to show a hierarchy of destinations. Nesting must read as one list of equal
rows, so the eye compares labels and states across depths rather than seeing a
second, narrower kind of row. SideNav owns this because only SideNavItem knows
a row's depth and its row padding.

## Compatibility and migration

- Released default preserved: `no`; nested rows change from inset to full width.
  Top-level rows and the collapsed rail are unchanged.
- Compatibility class: nonbreaking appearance change of visual direction under
  `spec:AST-017/FR3`; no public API, accepted input, or accessibility semantic
  changes.
- Controlled/uncontrolled behavior: unchanged.
- Migration decision: none; there is no supported way to keep the inset look.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The width of every expanded SideNavItem row, at every depth.
- Where a nested row's indent sits, its step, and how it adds to the row's
  padding.
- What the indent area paints and what a click on it does.
- Whether the nested group clips its rows.

**Does not own / non-goals**

- Destination acceptance, blocking, and router handoff — owned by
  `family:navigation-destinations`.
- The collapsed item's tooltip and how it attaches — owned by
  `component:SideNavItem`.
- Exact fill colors, radius, row height, and row padding per size — owned by
  the shared nav item styles and the `side-nav-item` theme target.
- Layout of caller content placed directly inside a SideNavItem that is not a
  SideNavItem — owned by the product callsite.
- SideNavHeading — owned by `component:SideNavHeading`; SideNavCollapseButton —
  owned by `component:SideNavCollapseButton`.
- The SideNav header, footer, and resize zones.

## Public concepts

| Concept       | Closed values or states                        | Meaning                                                                                                     | Availability by variant/orientation/state | Default | Owner               | Stability | Invalid-value behavior |
| ------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------- | ------------------- | --------- | ---------------------- |
| Nesting depth | `0`, `1`, `2`, … (derived, not a prop)         | The number of SideNavItem ancestors of a row within the same list. A collapsed rail's flyout restarts at 0. | Expanded rail; mobile drawer; flyout      | `0`     | `component:SideNav` | stable    | Not caller-settable    |
| Row size      | `sm`, `md`, `lg` (existing SideNavItem `size`) | Sets the row's height and base inline padding; the indent adds to that padding.                             | Every row                                 | `md`    | `component:SideNav` | stable    | Rejected by the type   |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                | Basis                                                       | Draft review state                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| FR1 | SideNav renders its navigation children in a scrollable list, which may be grouped by SideNavSection. A SideNavItem with children renders them, after its own row, in a group labelled by the parent's label; unless `collapsible` is `false`, the group expands and collapses and is hidden from assistive technology and inert while collapsed.                                        | Current source, docs, and tests                             | Current behavior                             |
| FR2 | In a collapsed rail, a SideNavItem without an icon is not rendered; a leaf item renders icon-only, named by a non-blank caller `aria-label` or else its label; an item with children renders an icon-only trigger that opens a flyout listing its children as the flyout's top level.                                                                                                    | Current source, docs, and tests                             | Current behavior                             |
| FR3 | In an expanded rail, in a flyout, and in the mobile navigation drawer, every SideNavItem row MUST span the full inline size of its list at any depth. A row at depth `n` MUST start its content `n` × `--spacing-6` beyond the row's own inline-start padding for its size, inside the row; the nested group MUST add no inset. A flyout's top level is depth 0.                         | `component:SideNav/DEC-1`                                   | Settled intent; implementation may be staged |
| FR4 | The indent area MUST be part of the row's target: a click there, including a modified or middle click on a link row, does what the same click on the row's primary element does. When the row also carries an independent expand toggle or `actions`, the indent belongs to the primary link or button, and the toggle and actions keep their own activation at the row's trailing edge. | `component:SideNav/DEC-1`; `family:navigation-destinations` | Settled intent; implementation may be staged |
| FR5 | An expanded nested group MUST NOT clip its rows once it has finished opening, so a nested row's focus ring paints in full. The group MAY clip while collapsed and while it opens or closes.                                                                                                                                                                                              | `component:SideNav/DEC-1`                                   | Settled intent; implementation may be staged |

### Allowed variation

- **AV1 — Depth and size.** Any depth and any row size may appear; FR3 holds for
  each row from its own size's padding.
- **AV2 — Theme tokens.** A theme that changes `--spacing-6` or the row padding
  tokens changes the step or the base with them.
- **AV3 — Row implementation.** The element that carries the indent may change
  while the painted row stays full width and the indent stays clickable.

### Representative states

| State                                 | Required invariant                                                                        | Allowed variation               |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------- |
| Depth 1–3, `md`                       | Row width equals a top-level row's; content starts one step further in per level.         | Labels, icons, selection.       |
| `sm` and `lg` nested rows             | Indent adds to that size's base padding.                                                  | Row height by size.             |
| Nested row with own link and children | Full-width row; indent is part of the link; the expand toggle stays at the trailing edge. | Collapsed or expanded children. |
| Nested row with `actions`             | Full-width row; indent is part of the primary element; actions stay at the trailing edge. | Action content.                 |
| Keyboard focus on a nested row        | The focus ring paints in full around the row.                                             | Ring style by theme.            |
| Right-to-left                         | Indent sits at the inline start (right); same widths.                                     | Writing direction.              |
| Collapsed rail                        | Icon-only items; the flyout's top level has no indent; deeper flyout levels indent.       | Flyout content.                 |

### Transformation and precedence order

- **ORD1 — Row inline-start padding.** The row's size padding, then plus depth ×
  `--spacing-6`. A caller's `style` on a nested item composes after the indent in the
  shared order (`architecture:public-component-api`): properties the caller does
  not set keep the indent, and a caller-set inline-start padding replaces it.

### Performance and resources

- **PR1 — No measurement.** Depth and indent come from composition; no
  measurement, observer, or extra render pass is added.

## Accessibility contract

- **AR1 — Presentation only.** Width and indent MUST NOT change any row's role,
  accessible name, state, DOM order, or tab order.
- **AR2 — Visible focus.** A nested row's focus indicator MUST paint in full at
  every depth (FR5).

## Design relationships

| Anatomy or state | Design requirement                                                 | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------------ | ------------------------ | -------------- | ------------------ |
| Navigation items | Nested rows read as equal rows of one list; depth reads as indent. | Owner choice (DD1)       | Prominent      | FR3–FR5            |

### Design decisions

<!-- design-decisions:v1 -->

| ID  | Decision                                                                                                                                                                                                         | Intent or reason                                                                                                                                                                                            | Applies to                                                                                         | Allowed variation                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| DD1 | Every SideNavItem row spans the full width of its nav list at any depth; nesting shows as indent inside the row, ahead of its content. Hover, pressed, selected, and focus paint the whole row, indent included. | Fills line up across depths, so the nav reads as one list of equal rows while labels keep their per-level alignment; the indent belongs to the row's primary target rather than sitting beside it as a gap. | SideNavItem rows at every depth, at rest and through hover, pressed, selected, disabled, and focus | Themes restyle fill, radius, and padding through the `side-nav-item` target; the step follows `--spacing-6`. |

## Family and system relationships

- `family:navigation-destinations` owns the accept/block result for a
  SideNavItem `href`; the indent area activates the same destination the primary
  element does (FR4).
- `architecture:internationalization` owns logical direction; the indent is
  inline-start and mirrors under right-to-left.
- `architecture:interaction-modality` owns shared focus-visible behavior; FR5
  keeps the ring visible at every depth.
- `architecture:component-theming-surface` owns the `side-nav-item` target;
  this record adds no target or state.
- `architecture:public-component-api` owns how caller styling inputs compose;
  ORD1 places the indent before a caller's `style`.
- `spec:AST-017/FR3` classifies the change as a nonbreaking change of visual
  direction.
- `component:TreeList` DD1–DD3 record the same row geometry for TreeList. They
  are precedent, not authority here; each component owns its own rows.

## Verification map

| Contract  | Verification                                                                          | Representative states                                                                         | Mutation or failure expectation                                                                                                                                        | Audit section            |
| --------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1, FR2  | `SideNav.test.tsx` nesting, collapsible, and collapsed-rail suites                    | Nested, collapsible, collapsed rail, flyout                                                   | Removing the labelled group, its collapsed inert state, or the collapsed icon-only and flyout paths fails.                                                             | `audit:SideNav/anatomy`  |
| FR3, ORD1 | Focused `SideNav.test.tsx` indent coverage, required with implementation              | Depth 1 and 2; `sm` and `md`; split and actions rows; caller `style`; flyout                  | A group inset, a missing or wrong indent, a dropped caller `style`, an indent that overrides a caller-set inline-start padding, or an indented flyout top level fails. | `audit:SideNav/layout`   |
| FR3, DD1  | Real-browser geometry over the SideNav nested stories                                 | Depths 1–3; `sm`, `md`, `lg`; light and dark; right-to-left; mobile drawer                    | A nested row's box narrower than a top-level row's, or a label moved from its per-depth position, fails.                                                               | `audit:SideNav/layout`   |
| FR4       | Real-browser click in the indent area of plain, split, and actions rows               | Link and button rows; plain, modified, and middle clicks; nested rows with toggle and actions | A click in the indent that does nothing or differs from the same click on the primary element, or a toggle or action that activates the row, fails.                    | `audit:SideNav/behavior` |
| FR5, AR2  | `SideNav.test.tsx` group clipping case and real-browser keyboard focus on nested rows | Only-child and last nested rows; after opening; collapsed                                     | A focus ring cut at any edge of an expanded group, or an expanded group that still clips, fails.                                                                       | `audit:SideNav/a11y`     |
| FR2, FR3  | Real-browser collapsed rail and flyout                                                | Collapsed rail with nested children                                                           | Any change to the collapsed rail, or an indent on the flyout's top level, fails.                                                                                       | `audit:SideNav/layout`   |
| AR1       | Accessibility-tree comparison of nested rows                                          | Plain, split, and actions rows                                                                | Any change in role, name, state, or order fails.                                                                                                                       | `audit:SideNav/a11y`     |

## Decision log

<!-- Record the boundary or requirement, not how it was reached. A rejected alternative is at most one line here, kept only when it is consequential and likely to recur. -->

### DEC-1 — Nested rows are full width; depth is indent inside the row

**Reference:** `component:SideNav/DEC-1`
**Decider:** cixzhang, 2026-10-16

A nested row that starts at its indent paints its fills from a different edge
than the rows above it, so it reads as a different, narrower component. A row that
spans the full width with its indent inside lines up every fill and keeps each
label at its per-depth position. The indent is part of the row's primary
target, so it acts as well as lights up. Full-width rows reach the nested group's
edges, so an open group must not clip them, or their focus ring is cut off.

Rejected: indenting the nested group from outside the rows, because fills then
start at a different edge per depth.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
