---
schema_version: 3
template_version: 7
kind: component
id: component:TableHeader
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
    apps/storybook/rtl-audit/verified-not-applicable.json,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: []
---

# TableHeader component contract

## Contract at a glance

| Area                    | Contract                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Public contract         | `children`, root `BaseProps`, and a `ref`.                                                   |
| Behavior                | Renders the table's header section as a native `thead` carrying the `table-header` target.   |
| End-user impact         | Assistive technology reads the header section as part of the table's structure.              |
| Builder impact          | None; the record describes shipped behavior.                                                 |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes.                   |
| Review checks           | Reject a non-`thead` element, a lost target, or caller props or `ref` that miss the element. |
| Governing rules         | `architecture:public-component-api` INV5–INV8; `architecture:component-theming-surface`.     |

This table is a review projection; the body below is authoritative.

## Intent

TableHeader is the header section a caller composes inside a children-mode Table. It
owns the native `thead` element; the caller owns the rows inside it.

Consumer syntax and examples belong in `TableHeader.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The `thead` element, which carries the `table-header` target that `component:Table`
  owns and maps.

**Does not own / non-goals**

- Rows — owned by `component:TableRow`; cells — owned by `component:Table`; and
  the caller's content.
- Table appearance, data mode, and plugins — owned by `component:Table`.

## Public concepts

| Concept | Closed values or states | Meaning                         | Availability by variant/orientation/state | Default | Owner  | Stability | Invalid-value behavior |
| ------- | ----------------------- | ------------------------------- | ----------------------------------------- | ------- | ------ | --------- | ---------------------- |
| Content | ReactNode (rows)        | The rows of the header section. | Children-mode Table                       | none    | caller | Stable    | —                      |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                          | Basis                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| FR1 | TableHeader renders one `thead` carrying the `table-header` target and holding its children, and adds no styles of its own.                                        | Current source and tests                                                |
| FR2 | `ref` reaches the `thead`; supported DOM, data, ARIA, and event props reach it after the component's attributes; `xstyle`, `className`, and `style` compose on it. | Current source and tests; `architecture:public-component-api` INV5–INV8 |

### Allowed variation

- **AV1 — Rows.** Any rows may fill the header section.

### Representative states

| State      | Required invariant                 | Allowed variation |
| ---------- | ---------------------------------- | ----------------- |
| In a Table | A `thead` in the table's children. | Rows.             |

### Transformation and precedence order

- **ORD1 — Root composition.** Target and caller styling compose, then caller
  props apply.

### Performance and resources

- **PR1 — No resources.** TableHeader holds no state and adds no listener or
  observer.

## Accessibility contract

- **AR1 — Native section semantics.** The `thead` keeps its native table
  section role; TableHeader adds no role of its own.

## Design relationships

| Anatomy or state | Design requirement          | Representation authority | Hierarchy role | Component contract |
| ---------------- | --------------------------- | ------------------------ | -------------- | ------------------ |
| Header section   | The table's header section. | Current source and docs  | Supporting     | FR1                |

Theming: the `thead` carries the `table-header` target, which `Table.doc.mjs`
maps as the Header section part of `component:Table`. `TableHeader.doc.mjs` declares no
anatomy of its own, so no anatomy-theming block is declared here.

## Family and system relationships

- `component:Table` owns appearance, data mode, plugins, and the target
  mapping.
- `architecture:public-component-api` owns caller-input routing; FR2 applies
  it.

## Verification map

| Contract     | Verification                                                                       | Representative states | Mutation or failure expectation                                                                                                                                                                                    | Audit section                |
| ------------ | ---------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| FR1, AR1     | `Table.test.tsx` children-mode section tests; `themingTargets.test.ts`             | Children mode         | A missing `thead` in the table's children fails. Gap: no test asserts the `table-header` class or that TableHeader adds no role or styles. `themingTargets.test.ts` catches only a renamed or undocumented target. | `audit:TableHeader/anatomy`  |
| FR2, ORD1    | `Table.test.tsx` section rest-forwarding test                                      | `data-testid`, `id`   | A dropped `data-testid` or `id` fails. Gap: no test covers `ref`, event props, `className`, `style`, or `xstyle`.                                                                                                  | `audit:TableHeader/api`      |
| PR1          | Source review                                                                      | Every state           | Gap: no automated check fails if TableHeader adds state or a listener.                                                                                                                                             | `audit:TableHeader/behavior` |
| RTL relation | Verified-N/A declaration (`apps/storybook/rtl-audit/verified-not-applicable.json`) | Every state           | A direction-sensitive glyph, inline spacing, position, or order that the audit detects on TableHeader reports the declaration stale.                                                                               | `audit:TableHeader/i18n-rtl` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or Table rules. It links to their owners.
