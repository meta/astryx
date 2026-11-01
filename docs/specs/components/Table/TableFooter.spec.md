---
schema_version: 3
template_version: 7
kind: component
id: component:TableFooter
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/Table/Table.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: []
---

# TableFooter component contract

## Contract at a glance

| Area                    | Contract                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Public contract         | `children`, root `BaseProps`, and a `ref`.                                                   |
| Behavior                | Renders the table's footer section as a native `tfoot` carrying the `table-footer` target.   |
| End-user impact         | Assistive technology reads the footer section as part of the table's structure.              |
| Builder impact          | None; the record describes shipped behavior.                                                 |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes.                   |
| Review checks           | Reject a non-`tfoot` element, a lost target, or caller props or `ref` that miss the element. |
| Governing rules         | `architecture:public-component-api` INV5–INV8; `architecture:component-theming-surface`.     |

This table is a review projection; the body below is authoritative.

## Intent

TableFooter is the footer section a caller composes inside a children-mode Table. It
owns the native `tfoot` element; the caller owns the rows inside it.

Consumer syntax and examples belong in `TableFooter.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The `tfoot` element, which carries the `table-footer` target that `component:Table`
  owns and maps.

**Does not own / non-goals**

- Rows — owned by `component:TableRow`; cells — owned by `component:TableCell`
  and `component:TableHeaderCell`; and the caller's content.
- Table appearance, data mode, and plugins — owned by `component:Table`.

## Public concepts

| Concept | Closed values or states | Meaning                         | Availability by variant/orientation/state | Default | Owner  | Stability | Invalid-value behavior |
| ------- | ----------------------- | ------------------------------- | ----------------------------------------- | ------- | ------ | --------- | ---------------------- |
| Content | ReactNode (rows)        | The rows of the footer section. | Children-mode Table                       | none    | caller | Stable    | —                      |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                          | Basis                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| FR1 | TableFooter renders one `tfoot` carrying the `table-footer` target and holding its children, and adds no styles of its own.                                        | Current source and tests                                                |
| FR2 | `ref` reaches the `tfoot`; supported DOM, data, ARIA, and event props reach it after the component's attributes; `xstyle`, `className`, and `style` compose on it. | Current source and tests; `architecture:public-component-api` INV5–INV8 |

### Allowed variation

- **AV1 — Rows.** Any rows may fill the footer section.

### Representative states

| State      | Required invariant                 | Allowed variation |
| ---------- | ---------------------------------- | ----------------- |
| In a Table | A `tfoot` in the table's children. | Rows.             |

### Transformation and precedence order

- **ORD1 — Root composition.** Target and caller styling compose, then caller
  props apply.

### Performance and resources

- **PR1 — No resources.** TableFooter holds no state and adds no listener or
  observer.

## Accessibility contract

- **AR1 — Native section semantics.** The `tfoot` keeps its native table
  section role; TableFooter adds no role of its own.

## Design relationships

| Anatomy or state | Design requirement          | Representation authority | Hierarchy role | Component contract |
| ---------------- | --------------------------- | ------------------------ | -------------- | ------------------ |
| Footer section   | The table's footer section. | Current source and docs  | Supporting     | FR1                |

Theming: the `tfoot` carries the `table-footer` target, which `Table.doc.mjs`
maps as the Footer section part of `component:Table`. `TableFooter.doc.mjs` declares no
anatomy of its own, so no anatomy-theming block is declared here.

## Family and system relationships

- `component:Table` owns appearance, data mode, plugins, and the target
  mapping.
- `architecture:public-component-api` owns caller-input routing; FR2 applies
  it.

## Verification map

| Contract  | Verification                                                            | Representative states  | Mutation or failure expectation                                                                                                                                                                                                | Audit section                |
| --------- | ----------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| FR1, AR1  | `Table.test.tsx` section rest-forwarding test; `themingTargets.test.ts` | Inside a plain `table` | A missing `tfoot` fails. Gap: no test renders TableFooter inside a Table, asserts its `table-footer` class, or asserts that it adds no role or styles. `themingTargets.test.ts` catches only a renamed or undocumented target. | `audit:TableFooter/anatomy`  |
| FR2, ORD1 | `Table.test.tsx` section rest-forwarding test                           | `data-testid`, `id`    | A dropped `data-testid` or `id` fails. Gap: no test covers `ref`, event props, `className`, `style`, or `xstyle`.                                                                                                              | `audit:TableFooter/api`      |
| PR1       | Source review                                                           | Every state            | Gap: no automated check fails if TableFooter adds state or a listener.                                                                                                                                                         | `audit:TableFooter/behavior` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or Table rules. It links to their owners.
