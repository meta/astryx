---
schema_version: 3
template_version: 7
kind: component
id: component:MetadataListItem
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/MetadataList/MetadataList.test.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-009]
---

# MetadataListItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `label` (a string), `children` (the value), optional `icon`, root `BaseProps`, and a `ref`.                                                |
| Behavior                | One label and value pair, rendered as a `dt` and `dd` either side by side in the list's grid or stacked inside a wrapper.                  |
| End-user impact         | People read each fact's label next to or above its value, and assistive technology pairs them.                                             |
| Builder impact          | None; the record describes shipped behavior.                                                                                               |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes.                                                                 |
| Review checks           | Reject a pair that is not `dt` and `dd`, a wrapper in the side-by-side layout, or caller props that move off the element carrying the ref. |
| Governing rules         | `architecture:public-component-api` INV5–INV8; `architecture:component-theming-surface`; WCAG 2.2 SC 1.3.1.                                |

This table is a review projection; the body below is authoritative.

## Intent

MetadataListItem is one key and value entry inside a MetadataList. It owns the
entry's term and definition markup and their type; the caller owns the label,
icon, and value.

Consumer syntax and examples belong in `MetadataListItem.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes` — side by side outside a stacked list.
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  target, or styling output changes.
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The entry's `dt` and `dd`, the stacked wrapper, and the `metadata-list-item`
  target that `component:MetadataList` maps.
- Label and value type, the icon slot, and where caller inputs land.

**Does not own / non-goals**

- Label position, columns, and orientation — owned by
  `component:MetadataList`.
- The label, icon, and value content — owned by the caller.

## Public concepts

| Concept | Closed values or states | Meaning                                  | Availability by variant/orientation/state | Default      | Owner                    | Stability | Invalid-value behavior |
| ------- | ----------------------- | ---------------------------------------- | ----------------------------------------- | ------------ | ------------------------ | --------- | ---------------------- |
| Label   | string                  | The entry's key.                         | Always                                    | —            | caller                   | Stable    | —                      |
| Value   | ReactNode (`children`)  | The entry's value.                       | Always                                    | —            | caller                   | Stable    | —                      |
| Icon    | ReactNode; unset        | Content shown before the label.          | Always                                    | unset        | caller                   | Stable    | —                      |
| Layout  | side by side; stacked   | Set by the parent list, not by the item. | Always                                    | side by side | `component:MetadataList` | Stable    | —                      |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| FR1 | Side by side (labels at the start, or outside a MetadataList), the item renders a `dt` holding the icon and label, then a `dd` holding the value, as direct children of the list's grid. The `dt` carries the `metadata-list-item` target, the `ref`, and the caller's props and styling inputs; a `data-testid` becomes `<id>-label` on the `dt` and `<id>-value` on the `dd`. Both cells are at least 24px tall and break long words. | Current source and tests                                                |
| FR2 | Stacked (labels on top, or a horizontal list), the item renders a `div` wrapper carrying the `metadata-list-item` target, the `ref`, `data-testid`, and the caller's props and styling inputs, holding the `dt` above the `dd` with a `--spacing-0-5` gap.                                                                                                                                                                              | Current source and tests                                                |
| FR3 | The label uses medium-weight body type in secondary text color; the value uses body type in primary text color. An icon sits before the label with a `--spacing-2` gap.                                                                                                                                                                                                                                                                 | Current source and docs                                                 |
| FR4 | `xstyle`, `className`, and `style` compose after component styles on the element carrying the target, and caller props reach that element after the component's own attributes.                                                                                                                                                                                                                                                         | Current source and tests; `architecture:public-component-api` INV5–INV8 |

### Allowed variation

- **AV1 — Content.** Any string may be the label; any ReactNode may be the
  icon or value.

### Representative states

| State        | Required invariant                                                   | Allowed variation |
| ------------ | -------------------------------------------------------------------- | ----------------- |
| Side by side | `dt` and `dd` as grid siblings; target, ref, and props on the `dt`.  | Content.          |
| Stacked      | One wrapper with the target, ref, and props, holding `dt` over `dd`. | Content.          |
| With icon    | The icon precedes the label inside the `dt`.                         | Icon.             |

### Transformation and precedence order

- **ORD1 — Layout.** The parent list's horizontal orientation or `top` label
  position → stacked; otherwise side by side.

### Performance and resources

- **PR1 — No resources.** MetadataListItem reads its parent list's label
  position and orientation and holds no state.

## Accessibility contract

- **AR1 — Term and definition.** The label is a `dt` and the value its `dd`,
  so assistive technology pairs them (WCAG 2.2 SC 1.3.1). The icon adds no
  semantics of its own.

## Design relationships

| Anatomy or state | Design requirement          | Representation authority | Hierarchy role | Component contract |
| ---------------- | --------------------------- | ------------------------ | -------------- | ------------------ |
| Label            | Secondary-color medium key. | Current source and docs  | Supporting     | FR1–FR3            |
| Metadata         | Primary-color value.        | Current source and docs  | Prominent      | FR1–FR3            |

Theming: the `dt` (side by side) or the wrapper (stacked) carries the
`metadata-list-item` target, which `MetadataList.doc.mjs` declares and
`component:MetadataList` maps. `MetadataListItem.doc.mjs` declares no anatomy of
its own, so no anatomy-theming block is declared here.

## Family and system relationships

- `component:MetadataList` owns layout, label position, and the target
  mapping.
- `architecture:public-component-api` owns caller-input routing; FR4 applies
  it.
- `spec:AST-009` owns accessibility-tree evidence; the verification map names
  its gap.

## Verification map

| Contract | Verification                                                             | Representative states           | Mutation or failure expectation                                                                                                                                                                                                                                                                                                       | Audit section                     |
| -------- | ------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| FR1      | `MetadataList.test.tsx` item, label-width, and pass-through-target tests | Side by side                    | A missing label or value, a `dt` or `dd` that is not a direct child of the `dl`, wrong `-label` and `-value` test ids, or props or click handling that leave the `dt`, fails. Gap: no test attaches a `ref`, and the 24px minimum height has no check. No check fails if the side-by-side `dt` loses the `metadata-list-item` target. | `audit:MetadataListItem/layout`   |
| FR2      | `MetadataList.test.tsx` stacked and stacked pass-through tests           | Stacked                         | A missing wrapper, `dt`, or `dd`, or props that leave the wrapper, fails. Gap: the stacked gap has no check. No test attaches a `ref` to the stacked wrapper.                                                                                                                                                                         | `audit:MetadataListItem/layout`   |
| FR3      | `MetadataList.test.tsx` icon test                                        | With icon                       | A missing icon fails. Gap: label and value type and color and the icon gap have no automated check.                                                                                                                                                                                                                                   | `audit:MetadataListItem/design`   |
| FR4      | `MetadataList.test.tsx` pass-through tests                               | `aria-label`, `id`, data; click | A dropped attribute or handler fails. Gap: no test covers `className`, `style`, or the `xstyle` merge order.                                                                                                                                                                                                                          | `audit:MetadataListItem/api`      |
| AR1      | `MetadataList.test.tsx` role queries                                     | Term and definition             | A missing `term` or `definition` role in the DOM fails. Gap: no accessibility-tree check proves the pairing (`spec:AST-009` FR3).                                                                                                                                                                                                     | `audit:MetadataListItem/a11y`     |
| PR1      | Source review                                                            | Every state                     | Gap: no automated check fails if MetadataListItem adds state.                                                                                                                                                                                                                                                                         | `audit:MetadataListItem/behavior` |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or list layout rules. It links to their owners.
