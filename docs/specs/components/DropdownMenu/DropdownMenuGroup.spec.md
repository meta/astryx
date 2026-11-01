---
schema_version: 3
template_version: 7
kind: component
id: component:DropdownMenuGroup
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, theming]
verified_by: [packages/core/src/DropdownMenu/DropdownMenu.test.tsx]
modules: []
families: []
design_specs: []
architecture:
  [architecture:public-component-api, architecture:component-theming-surface]
contributing: []
system_specs: [spec:AST-020]
---

# DropdownMenuGroup component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | A compound-mode group of rows with an optional `title`, `children`, root inputs, and a ref.                                                                                                |
| Behavior                | Renders one `role="group"` named by its visible heading; the heading is plain text that roving focus and typeahead skip. An untitled group is an unnamed group unless the caller names it. |
| End-user impact         | Screen-reader users hear a titled cluster of rows as one named group, as sighted users see it; arrow keys move across group boundaries as if the rows were flat.                           |
| Builder impact          | Builders title compound rows with the same heading look as a data-mode section.                                                                                                            |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change.                                                                                                                                  |
| Review checks           | Reject a heading that becomes a menu item or a focus stop, a titled group not named by its heading, or a lost section-heading target.                                                      |
| Governing rules         | `component:DropdownMenu/DEC-6`; `architecture:public-component-api`; `architecture:component-theming-surface`.                                                                             |

This table is a review projection; the body below is authoritative.

## Intent

DropdownMenuGroup gives compound-mode menus the titled grouping that data-mode
`{type: 'section'}` entries already have (`component:DropdownMenu/DEC-6`).

## Compatibility and migration

- Released default preserved: yes.
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- One `role="group"` root, its name from the heading, and the heading itself
  with the `dropdown-menu-section-heading` target.
- Root composition of ref, host attributes, and handlers.

**Does not own / non-goals**

- Roving focus and typeahead — owned by `component:DropdownMenu`.
- The rows inside — owned by each row component.
- Focusable content inside the heading: arrow keys cannot reach it.

## Public concepts

| Concept | Closed values or states | Meaning                                 | Availability  | Default | Owner     | Stability | Invalid-value behavior                            |
| ------- | ----------------------- | --------------------------------------- | ------------- | ------- | --------- | --------- | ------------------------------------------------- |
| Title   | absent; any React node  | A visible heading that names the group. | Compound mode | absent  | component | stable    | Absent renders no heading and no name of its own. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                    | Basis                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| FR1 | With a `title`, the group is one `role="group"` whose `aria-labelledby` names its visible heading; the heading carries `dropdown-menu-section-heading`, is plain text rather than a menu item, and is skipped by roving focus and typeahead. | DEC-6 of `component:DropdownMenu`; current tests   |
| FR2 | Without a `title`, the group is an unnamed `role="group"`, or takes the name a caller supplies.                                                                                                                                              | Current tests                                      |
| FR3 | Arrow keys step across a group boundary as if the rows were flat; a focusable node inside the heading is not reachable by them.                                                                                                              | Current tests                                      |
| FR4 | A ref and host attributes and handlers reach the group element while it keeps its role and heading name.                                                                                                                                     | `architecture:public-component-api`; current tests |

### Allowed variation

- **AV1 — Heading content.** The title may be any React node.

### Representative states

| State    | Required invariant               | Allowed variation |
| -------- | -------------------------------- | ----------------- |
| Titled   | Named by its heading.            | Title content.    |
| Untitled | Unnamed, or named by the caller. | —                 |

### Transformation and precedence order

- **ORD1 — Name.** Title heading → caller name → none.

### Performance and resources

- **PR1 — Render only.** The group owns no state, effect, listener, or
  observer.

## Accessibility contract

- **AR1 — Named group.** A titled group is announced with its heading's text;
  the heading is not a menu item.

## Design relationships

| Anatomy or state | Design requirement                                         | Representation authority | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Heading          | Labels a cluster of rows like a data-mode section heading. | `component:DropdownMenu` | Supporting     | FR1                |

`component:DropdownMenu` maps the `dropdown-menu-section-heading` target in its
theming anatomy, so this record carries no anatomy-theming map.

## Family and system relationships

- `component:DropdownMenu` owns the keyboard model and the section-heading
  target mapping.
- `architecture:public-component-api` owns root composition.

## Verification map

| Contract       | Verification                                                                                                                                                                                                                                               | Representative states                    | Mutation or failure expectation                                                                                       | Audit section                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| FR1, AR1, ORD1 | `DropdownMenu.test.tsx` DropdownMenuGroup cases ("renders a role=\"group\" named by its heading", "renders the heading with the data-mode theme class", "the heading is not a menuitem and roving focus skips it", "typeahead never lands on the heading") | Titled group                             | A group not named by its heading, a missing heading target, or a heading that takes focus or a typeahead match fails. | `audit:DropdownMenuGroup/semantics`     |
| FR2            | `DropdownMenu.test.tsx` "an untitled group is an unnamed role=\"group\"" and "an untitled group takes a caller-supplied accessible name"                                                                                                                   | Untitled, with and without a caller name | A name invented for an untitled group, or a dropped caller name, fails.                                               | `audit:DropdownMenuGroup/semantics`     |
| FR3            | `DropdownMenu.test.tsx` "arrow navigation steps across a group boundary as if the rows were flat" and "a focusable node in the heading is not reachable by the arrow keys"                                                                                 | Two groups; focusable heading content    | A stop at the boundary or a focusable heading node reached by arrows fails.                                           | `audit:DropdownMenuGroup/accessibility` |
| FR4            | `DropdownMenu.test.tsx` "forwards a ref to the group element" and "forwards host attributes to the group while keeping its role and heading name"                                                                                                          | Ref; host attributes                     | A dropped ref or attribute, or a replaced role or name, fails.                                                        | `audit:DropdownMenuGroup/api`           |
| PR1            | Evidence gap: no test asserts the absence of lifecycle resources                                                                                                                                                                                           | —                                        | —                                                                                                                     | `audit:DropdownMenuGroup/behavior`      |

## Decision log

No component-local decision; `component:DropdownMenu/DEC-6` decides the
component.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or parent contracts. It links to their owners.
