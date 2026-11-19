---
schema_version: 3
template_version: 7
kind: component
id: component:ContextMenuItem
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api]
verified_by: [packages/core/src/ContextMenu/ContextMenu.test.tsx]
modules: []
families: []
design_specs: []
architecture: [architecture:public-component-api]
contributing: []
system_specs: []
---

# ContextMenuItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `ContextMenuItem` is `DropdownMenuItem` exported from the ContextMenu entry point under this name, with its props type. |
| Behavior                | Identical to `component:DropdownMenuItem` inside a ContextMenu's compound `menuContent`.                                |
| End-user impact         | A context-menu row looks and behaves exactly like a dropdown-menu row.                                                  |
| Builder impact          | Builders compose ContextMenu rows without importing from DropdownMenu.                                                  |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change.                                                               |
| Review checks           | Reject a ContextMenuItem that diverges from DropdownMenuItem, or a separate implementation behind the name.             |
| Governing rules         | `component:DropdownMenuItem`; `architecture:public-component-api`.                                                      |

This table is a review projection; the body below is authoritative.

## Intent

Give ContextMenu callers a row under the ContextMenu name without a second row
implementation.

## Compatibility and migration

- Released default preserved: yes.
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change.
- Controlled/uncontrolled behavior: not applicable.
- Migration decision: none.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The `ContextMenuItem` export name and its `ContextMenuItemProps` type name.

**Does not own / non-goals**

- Every row behavior, semantic, and target — owned by
  `component:DropdownMenuItem`.
- The menu around it — owned by `component:ContextMenu`.

## Public concepts

| Concept    | Closed values or states | Meaning                                      | Availability  | Default | Owner                       | Stability | Invalid-value behavior |
| ---------- | ----------------------- | -------------------------------------------- | ------------- | ------- | --------------------------- | --------- | ---------------------- |
| Alias name | `ContextMenuItem`       | DropdownMenuItem under the ContextMenu name. | Compound mode | —       | `component:ContextMenuItem` | stable    | Not applicable.        |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                           | Basis          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| FR1 | `ContextMenuItem` is the same component as `DropdownMenuItem`, and `ContextMenuItemProps` is `DropdownMenuItemProps`; the row follows `component:DropdownMenuItem`. | Current source |

### Allowed variation

- **AV1 — None.** The alias adds nothing of its own.

### Representative states

| State        | Required invariant                                    | Allowed variation |
| ------------ | ----------------------------------------------------- | ----------------- |
| Compound row | Renders as a DropdownMenuItem row inside ContextMenu. | Row content.      |

### Transformation and precedence order

- **ORD1 — None.** The alias has no precedence of its own.

### Performance and resources

- **PR1 — None of its own.** Resources are DropdownMenuItem's.

## Accessibility contract

- **AR1 — Same row.** Semantics and keyboard behavior are
  `component:DropdownMenuItem`'s.

## Design relationships

| Anatomy or state | Design requirement           | Representation authority     | Hierarchy role | Component contract |
| ---------------- | ---------------------------- | ---------------------------- | -------------- | ------------------ |
| Row              | Same as a dropdown-menu row. | `component:DropdownMenuItem` | Prominent      | FR1                |

`component:DropdownMenuItem` owns the row's targets and `component:ContextMenu`
maps the pointer action row in its theming anatomy, so this record carries no
anatomy-theming map.

## Family and system relationships

- `component:DropdownMenuItem` owns the row contract.
- `component:ContextMenu` owns the menu.

## Verification map

| Contract | Verification                                                                                                                                                     | Representative states | Mutation or failure expectation                                                                                                                             | Audit section               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| FR1, AR1 | `ContextMenu.test.tsx` compound cases ("renders menuContent as menu items", "renders ContextMenuItem endContent", "calls onClick when compound item is clicked") | Compound rows         | A ContextMenuItem that does not render or act as a menu row fails. Evidence gap: no test asserts that the export is the same component as DropdownMenuItem. | `audit:ContextMenuItem/api` |

## Decision log

No component-local decision.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples or the row contract.
It links to their owners.
