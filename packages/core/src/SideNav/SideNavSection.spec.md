---
schema_version: 3
template_version: 7
kind: component
id: component:SideNavSection
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
families: []
design_specs: []
architecture:
  [architecture:public-component-api, architecture:component-theming-surface]
contributing: []
system_specs: []
---

# SideNavSection component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `SideNavSection` with `title`, `subtitle`, `endContent`, `isHeaderHidden`, and `children`; target `side-nav-section`.                                                   |
| Behavior                | A labeled group of SideNav items. Its header is visible in an expanded rail and visually hidden, but still read, when `isHeaderHidden` is set or the rail is collapsed. |
| End-user impact         | Screen-reader users hear each group's title in every rail state; sighted users see section titles only in the expanded rail.                                            |
| Builder impact          | None.                                                                                                                                                                   |
| Compatibility/readiness | Records shipped behavior; no public change. One implementation gap (see Current-state impact).                                                                          |
| Review checks           | Reject a section without `role="group"` named by its title, or a hidden header removed from the accessibility tree.                                                     |
| Governing rules         | `architecture:public-component-api` INV5–INV6; `architecture:component-theming-surface`.                                                                                |

This table is a review projection; the body below is authoritative.

## Intent

SideNavSection groups related SideNav items under a title. It owns the group's
semantics and its header's visibility. Consumer usage lives in
`SideNavSection.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **A hidden header keeps its end content focusable.** When the header is
  visually hidden (`isHeaderHidden` or a collapsed rail), a control placed in
  `endContent` stays in the tab order while it is clipped out of sight, so
  keyboard users land on a control they cannot see. WCAG 2.4.7 requires visible
  focus. OQ1 asks whether a hidden header renders `endContent`.

## Ownership boundary

**Owns**

- The group element, its name, header visibility, and root styling (FR1–FR4).

**Does not own / non-goals**

- Item rendering and nesting — owned by `component:SideNavItem` and
  `component:SideNav`.
- Interactive content placed in `endContent` — owned by that content.

## Public concepts

No component-local concept beyond the consumer props.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                     | Basis                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | The root is a `div` with `role="group"` and `aria-labelledby` pointing at the title. It carries `side-nav-section`, the forwarded `ref`, `data-testid`, and other DOM props; the role and label cannot be overridden by them. | Current source and tests |
| FR2 | The header shows the title, an optional subtitle, and `endContent` at the inline end, followed by the items.                                                                                                                  | Current source and tests |
| FR3 | When `isHeaderHidden` is true or the rail is collapsed, the header is visually hidden but stays in the accessibility tree, so the group keeps its name.                                                                       | Current source and tests |
| FR4 | `className`, `style`, and `xstyle` merge onto the root after component styles.                                                                                                                                                | Current source and tests |

### Allowed variation

- **AV1 — Header content.** Subtitle and end content may be absent.

### Representative states

| State          | Required invariant                   | Allowed variation |
| -------------- | ------------------------------------ | ----------------- |
| Expanded rail  | Visible header; named group.         | End content.      |
| Header hidden  | Hidden header still names the group. | —                 |
| Collapsed rail | Hidden header still names the group. | —                 |

### Transformation and precedence order

- No precedence rule.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Named group.** FR1 and FR3.

## Design relationships

| Anatomy or state | Design requirement                     | Representation authority       | Hierarchy role | Component contract |
| ---------------- | -------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Header           | Title, subtitle, trailing end content. | Current source and public docs | Supporting     | FR2, FR3           |

`SideNavSection.doc.mjs` declares no anatomy of its own, so no anatomy-theming
map is recorded.

## Family and system relationships

- `component:SideNav` hosts sections in its list.

## Verification map

| Contract      | Verification                                  | Representative states               | Mutation or failure expectation             | Audit section                        |
| ------------- | --------------------------------------------- | ----------------------------------- | ------------------------------------------- | ------------------------------------ |
| FR1, FR2, FR4 | `SideNav.test.tsx` SideNavSection suite       | Title, subtitle, end content, props | A lost role, name, or forwarded prop fails. | `audit:SideNavSection/accessibility` |
| FR3           | `SideNav.test.tsx` hidden section header test | Header hidden                       | A header removed from the tree fails.       | `audit:SideNavSection/accessibility` |

Read from source, with no focused test yet: the forwarded `ref`, the
`side-nav-section` target, and the role and label winning over caller props
(FR1); the header's part order and end placement (FR2); hiding the header in a
collapsed rail (FR3); and `xstyle` on the root (FR4).

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — Does a hidden header render `endContent`?** (`human-api`) Today it
  does, and a control there stays focusable while hidden (Current-state
  impact).

## Content boundary

This file does not duplicate consumer prop tables or examples. It links to their
owners.
