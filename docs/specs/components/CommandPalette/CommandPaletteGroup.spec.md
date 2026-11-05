---
schema_version: 3
template_version: 7
kind: component
id: component:CommandPaletteGroup
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, theming]
verified_by:
  [
    packages/core/src/CommandPalette/CommandPaletteGroup.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: []
---

# CommandPaletteGroup component contract

## Contract at a glance

| Area                    | Contract                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `CommandPaletteGroup` with a required string `heading`, `children`, `ref`, `xstyle`, `className`, `style`, and root DOM props. |
| Behavior                | A `group` of command results named by `heading`, with the heading shown as a visual label above them.                          |
| End-user impact         | Related commands appear under a visible heading, and screen-reader users hear the group's name when they move into it.         |
| Builder impact          | None.                                                                                                                          |
| Compatibility/readiness | Records shipped behavior; no public change.                                                                                    |
| Review checks           | Reject an unnamed group, a heading read twice, or a heading target that merges with the group target.                          |
| Governing rules         | `component:CommandPalette`; `architecture:public-component-api` INV5; `architecture:component-theming-surface`.                |

This table is a review projection; the body below is authoritative.

## Intent

CommandPaletteGroup gathers related command results under a heading inside a
CommandPalette list. Consumer usage lives in `CommandPaletteGroup.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

None.

## Ownership boundary

**Owns**

- The group root, its role and name, and the `command-palette-group` target
  (FR1, FR3).
- The visual heading and its `command-palette-group-heading` target (FR2, FR3).
- Root ref, DOM props, and styling (FR4).

**Does not own / non-goals**

- Option semantics and activation — owned by `component:CommandPaletteItem`.
- The list, search, and keyboard navigation — owned by
  `component:CommandPalette` and `component:CommandPaletteList`.

## Public concepts

No component-local concept beyond the consumer props.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                         | Basis                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | The root has `role="group"` and is named by `heading` through `aria-label`, unless the caller supplies its own `role` or `aria-label` (FR4), and lays its heading and children out in one column. | Current source and tests |
| FR2 | The heading renders `heading` as supporting text before the children and is hidden from assistive technology, so the name is read once.                                                           | Current source and tests |
| FR3 | The root carries `command-palette-group` and the heading carries the separate `command-palette-group-heading` target.                                                                             | Current source and tests |
| FR4 | `ref`, DOM props, `className`, `style`, and `xstyle` reach the root, and a caller's explicit `role` or `aria-label` reaches it (`architecture:public-component-api` INV5).                        | Current source           |

### Allowed variation

- **AV1 — Content.** The heading text and the grouped items vary.
- **AV2 — Theme.** Themes restyle the group and the heading separately.

### Representative states

| State           | Required invariant                          | Allowed variation |
| --------------- | ------------------------------------------- | ----------------- |
| Grouped results | A named group with a hidden visual heading. | Items.            |

### Transformation and precedence order

- No precedence rule.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Named group.** The group is named by `heading` (FR1), unless the
  caller supplies its own `aria-label` (FR4).
- **AR2 — One reading.** The visual heading is hidden from assistive
  technology, so the name is not repeated (FR2).

## Design relationships

| Anatomy or state | Design requirement                     | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------- | ------------------------ | -------------- | ------------------ |
| Group            | Gathers related results in one column. | Current source           | Supporting     | FR1, FR3           |
| Group heading    | Labels the group with supporting text. | Current source           | Supporting     | FR2, FR3           |

The aggregate CommandPalette anatomy map, owned by `component:CommandPalette`,
maps the Group and Group heading parts to these targets.

## Family and system relationships

- `component:CommandPalette` owns the aggregate anatomy and the composite
  keyboard model; `component:CommandPaletteItem` owns the options inside.

## Verification map

| Contract | Verification                                                                        | Representative states | Mutation or failure expectation                                                                           | Audit section                             |
| -------- | ----------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| FR1, AR1 | `CommandPaletteGroup.test.tsx` "has group role with aria-label"                     | grouped results       | A missing role or name fails.                                                                             | `audit:CommandPaletteGroup/accessibility` |
| FR2, AR2 | `CommandPaletteGroup.test.tsx` heading, `aria-hidden`, and decorative-heading tests | grouped results       | A heading exposed to assistive technology fails.                                                          | `audit:CommandPaletteGroup/accessibility` |
| FR3      | `CommandPaletteGroup.test.tsx` heading-target tests; `themingTargets.test.ts`       | grouped results       | A missing or merged target fails.                                                                         | `audit:CommandPaletteGroup/theming`       |
| FR4      | Source review                                                                       | Caller inputs         | Gap: no test covers `ref`, DOM props, `className`, `style`, `xstyle`, or a caller `role` or `aria-label`. | `audit:CommandPaletteGroup/api`           |

Read from source, with no focused test yet:

- FR1: the one-column layout.
- FR4: `ref`, DOM props, `className`, `style`, and `xstyle` on the root.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples, or
CommandPalette's search and keyboard behavior. It links to their owners.
