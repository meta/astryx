---
schema_version: 3
template_version: 7
kind: component
id: component:TypeaheadItem
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, theming]
verified_by:
  [
    packages/core/src/Typeahead/TypeaheadItem.test.tsx,
    apps/storybook/rtl-audit/targets.json,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:public-component-api, architecture:component-theming-surface]
contributing: []
system_specs: []
---

# TypeaheadItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | The default Typeahead result content: `item` (required), `icon`, `description`, `isDisabled`, `group`, root inputs, and a ref.                                                               |
| Behavior                | Renders an optional icon, the item's label, and an optional description under the `typeahead-item` target; dims when disabled; renders `item.element` raw instead when the item carries one. |
| End-user impact         | People see each result's label, icon, and supporting text in one consistent row layout.                                                                                                      |
| Builder impact          | Builders reuse it inside a custom `renderItem` to keep the default layout and target.                                                                                                        |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Root inputs dropped on the `item.element` path are listed under Current-state impact.                                              |
| Review checks           | Reject a lost `typeahead-item` target, a description element when none is given, or option semantics added to this content.                                                                  |
| Governing rules         | `architecture:public-component-api` INV5, INV6; `architecture:component-theming-surface`; `component:BaseTypeahead` for the option row around it.                                            |

This table is a review projection; the body below is authoritative.

## Intent

Give Typeahead results, and custom renderers that want the same look, one
label-and-supporting-content layout.

## Compatibility and migration

- Released default preserved: yes.
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The result content layout: icon, label, and description.
- The `typeahead-item` target and the disabled dimming.

**Does not own / non-goals**

- Option role, highlight, selection, and keyboard behavior — owned by
  `component:BaseTypeahead`'s result row.
- Caller-provided `item.element` content.
- Grouping. The `group` prop has no effect: TypeaheadItem ignores it, and
  BaseTypeahead groups results by `item.auxiliaryData.group`.

## Public concepts

| Concept        | Closed values or states        | Meaning                                             | Availability   | Default        | Owner     | Stability | Invalid-value behavior |
| -------------- | ------------------------------ | --------------------------------------------------- | -------------- | -------------- | --------- | --------- | ---------------------- |
| Content source | default layout; `item.element` | Whether the item's own element replaces the layout. | Every result   | default layout | component | stable    | `item.element` wins.   |
| Availability   | enabled; disabled              | Whether the content is dimmed.                      | Default layout | enabled        | component | stable    | Not applicable.        |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                            | Basis                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| FR1 | Without `item.element`, the content renders `icon` before a column of the item's `label` and, when given, `description`; no description element renders without one.                                                                                                                 | Current source and tests                                                 |
| FR2 | The root carries the `typeahead-item` target; `isDisabled` dims it to half opacity.                                                                                                                                                                                                  | `architecture:component-theming-surface`; current source and tests       |
| FR3 | Root inputs reach the root: `className` merges with the component's classes, `style` and `xstyle` compose, other props pass through, and the ref reaches the root element.                                                                                                           | `architecture:public-component-api`; current tests                       |
| FR4 | With `item.element`, that element renders raw in place of the layout. Caller root inputs MUST still reach the rendered root (`architecture:public-component-api` INV5, INV6). Implementation gap: on this path the ref, `className`, `style`, `xstyle`, and other props are dropped. | `architecture:public-component-api` INV5, INV6; current source and tests |

### Allowed variation

- **AV1 — Content.** Icon, label, and description are caller data.
- **AV2 — Theme paint.** Themes may restyle the `typeahead-item` target.

### Representative states

| State                     | Required invariant                  | Allowed variation |
| ------------------------- | ----------------------------------- | ----------------- |
| Label only                | Label, no description element.      | Label text.       |
| With icon and description | Icon, then label above description. | Content.          |
| Disabled                  | Dimmed to half opacity.             | —                 |
| `item.element`            | The element renders raw.            | Caller content.   |

### Transformation and precedence order

- **ORD1 — Content.** `item.element` → default layout.

### Performance and resources

- **PR1 — Render only.** The content owns no state, effect, listener, or
  observer.

## Accessibility contract

- **AR1 — Content only.** TypeaheadItem adds no role or state; the option row
  around it owns them.

## Design relationships

| Anatomy or state | Design requirement                 | Representation authority | Hierarchy role | Component contract |
| ---------------- | ---------------------------------- | ------------------------ | -------------- | ------------------ |
| Icon             | Identifies the result at a glance. | Caller content           | Supporting     | FR1                |
| Label            | Names the result.                  | Current source           | Prominent      | FR1                |
| Description      | Adds secondary detail.             | Current source           | Supporting     | FR1                |

`component:Typeahead` and `component:BaseTypeahead` map the `typeahead-item`
target as "Default item content" in their theming anatomy, so this record
carries no anatomy-theming map.

## Family and system relationships

- `component:BaseTypeahead` owns the option row and chooses this content by
  default.
- `architecture:public-component-api` owns root-input composition.

## Verification map

| Contract           | Verification                                                                                                                                                                                                    | Representative states                                      | Mutation or failure expectation                                                                                           | Audit section                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR1                | `TypeaheadItem.test.tsx` "renders the item label", "renders the description below the label when provided", "renders no description element when none is provided", "renders the icon before the label content" | Label, description, icon                                   | A missing label, description, or icon, an extra description element, or the icon after the label fails.                   | `audit:TypeaheadItem/anatomy`  |
| FR2                | `TypeaheadItem.test.tsx` "dims the row when isDisabled is set" and "does not dim the row by default"                                                                                                            | Enabled and disabled                                       | Missing or default dimming fails. Evidence gap: no test asserts the `typeahead-item` class.                               | `audit:TypeaheadItem/theming`  |
| FR3                | `TypeaheadItem.test.tsx` "forwards pass-through props to the item element", "merges a caller className with its own classes", "forwards ref to the row element"                                                 | Pass-through, className, ref                               | A dropped prop, class, or ref fails. Evidence gap: no test asserts `style` or `xstyle`.                                   | `audit:TypeaheadItem/api`      |
| FR4, ORD1          | `TypeaheadItem.test.tsx` "renders item.element raw in place of the label layout"                                                                                                                                | `item.element`                                             | An element that keeps the default layout fails. Evidence gap: no test asserts the root inputs on this path (the FR4 gap). | `audit:TypeaheadItem/api`      |
| PR1, AR1           | Evidence gap: no test asserts the absence of lifecycle resources or roles                                                                                                                                       | —                                                          | —                                                                                                                         | `audit:TypeaheadItem/behavior` |
| RTL relation (FR1) | RTL audit curated D2 target (`apps/storybook/rtl-audit/targets.json`) on `Typeahead / Parts / TypeaheadItem with icon` (results opened)                                                                         | Icon, label and description in an open result; LTR and RTL | A result icon that is not at the inline start of its content fails D2.                                                    | `audit:TypeaheadItem/i18n-rtl` |

## Current-state impact

- **Root inputs on `item.element` (FR4).** When an item carries its own element,
  the ref, `className`, `style`, `xstyle`, and other props passed to
  TypeaheadItem are dropped, against `architecture:public-component-api` INV5
  and INV6.

## Decision log

No component-local decision.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples or the option-row
contract. It links to their owners.
