---
schema_version: 3
template_version: 7
kind: component
id: component:TableBody
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

# TableBody component contract

## Contract at a glance

| Area                    | Contract                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Public contract         | `children`, root `BaseProps`, and a `ref`.                                                   |
| Behavior                | Renders the table's body section as a native `tbody` carrying the `table-body` target.       |
| End-user impact         | Assistive technology reads the body section as part of the table's structure.                |
| Builder impact          | None; the record describes shipped behavior.                                                 |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes.                   |
| Review checks           | Reject a non-`tbody` element, a lost target, or caller props or `ref` that miss the element. |
| Governing rules         | `architecture:public-component-api` INV5–INV8; `architecture:component-theming-surface`.     |

This table is a review projection; the body below is authoritative.

## Intent

TableBody is the body section a caller composes inside a children-mode Table. It
owns the native `tbody` element; the caller owns the rows inside it.

Consumer syntax and examples belong in `TableBody.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The `tbody` element, which carries the `table-body` target that `component:Table`
  owns and maps.

**Does not own / non-goals**

- Rows — owned by `component:TableRow`; cells — owned by `component:Table`; and
  the caller's content.
- Table appearance, data mode, and plugins — owned by `component:Table`.

## Public concepts

| Concept | Closed values or states | Meaning                       | Availability by variant/orientation/state | Default | Owner  | Stability | Invalid-value behavior |
| ------- | ----------------------- | ----------------------------- | ----------------------------------------- | ------- | ------ | --------- | ---------------------- |
| Content | ReactNode (rows)        | The rows of the body section. | Children-mode Table                       | none    | caller | Stable    | —                      |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                          | Basis                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| FR1 | TableBody renders one `tbody` carrying the `table-body` target and holding its children, and adds no styles of its own.                                            | Current source and tests                                                |
| FR2 | `ref` reaches the `tbody`; supported DOM, data, ARIA, and event props reach it after the component's attributes; `xstyle`, `className`, and `style` compose on it. | Current source and tests; `architecture:public-component-api` INV5–INV8 |

### Allowed variation

- **AV1 — Rows.** Any rows may fill the body section.

### Representative states

| State      | Required invariant                 | Allowed variation |
| ---------- | ---------------------------------- | ----------------- |
| In a Table | A `tbody` in the table's children. | Rows.             |

### Transformation and precedence order

- **ORD1 — Root composition.** Target and caller styling compose, then caller
  props apply.

### Performance and resources

- **PR1 — No resources.** TableBody holds no state and adds no listener or
  observer.

## Accessibility contract

- **AR1 — Native section semantics.** The `tbody` keeps its native table
  section role; TableBody adds no role of its own.

## Design relationships

| Anatomy or state | Design requirement        | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------- | ------------------------ | -------------- | ------------------ |
| Body section     | The table's body section. | Current source and docs  | Supporting     | FR1                |

Theming: the `tbody` carries the `table-body` target, which `Table.doc.mjs`
maps as the Body section part of `component:Table`. `TableBody.doc.mjs` declares no
anatomy of its own, so no anatomy-theming block is declared here.

## Family and system relationships

- `component:Table` owns appearance, data mode, plugins, and the target
  mapping.
- `architecture:public-component-api` owns caller-input routing; FR2 applies
  it.

## Verification map

| Contract  | Verification                                                           | Representative states | Mutation or failure expectation                                                                                                                                                                                | Audit section              |
| --------- | ---------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| FR1, AR1  | `Table.test.tsx` children-mode section tests; `themingTargets.test.ts` | Children mode         | A missing `tbody` in the table's children fails. Gap: no test asserts the `table-body` class or that TableBody adds no role or styles. `themingTargets.test.ts` catches only a renamed or undocumented target. | `audit:TableBody/anatomy`  |
| FR2, ORD1 | `Table.test.tsx` section rest-forwarding test                          | `data-testid`, `id`   | A dropped `data-testid` or `id` fails. Gap: no test covers `ref`, event props, `className`, `style`, or `xstyle`.                                                                                              | `audit:TableBody/api`      |
| PR1       | Source review                                                          | Every state           | Gap: no automated check fails if TableBody adds state or a listener.                                                                                                                                           | `audit:TableBody/behavior` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or Table rules. It links to their owners.
