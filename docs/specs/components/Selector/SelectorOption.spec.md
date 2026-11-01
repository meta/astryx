---
schema_version: 3
template_version: 7
kind: component
id: component:SelectorOption
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, layout, theming]
verified_by: [packages/core/src/Selector/Selector.test.tsx]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: []
---

# SelectorOption component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `SelectorOption` is exported beside Selector and takes `label` (required), `icon`, `description`, `layout` (`stacked` by default, or `inline`), `endContent`, `xstyle`, `className`, and `style`.       |
| Behavior                | Renders one Item row of an optional icon, the label, an optional description, and optional end content, with the row's own padding and corner radius removed so its host row lays it out.               |
| End-user impact         | People see custom Selector options and the selected value in the same row shape as built-in options, and a long string label ellipsizes instead of overflowing a narrow popover.                        |
| Builder impact          | Builders return it from `renderOption` or `renderValue` to keep the `selector-option` target and the shared row layout while choosing the content.                                                      |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. The missing `ref` and DOM props are listed under Current-state impact.                                                                        |
| Review checks           | Reject a dropped icon, description, or end content, a layout that ignores the caller outside an InputGroup or stays stacked as a Selector trigger value inside one, or a lost `selector-option` target. |
| Governing rules         | `architecture:component-theming-surface`; `architecture:public-component-api` INV5, INV8; `component:Item` for the row it composes.                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

Give custom Selector option and value rendering the same row layout and theming
target as the built-in options, without owning option semantics or selection.

## Compatibility and migration

- Released default preserved: yes
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: not applicable; SelectorOption holds no
  state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The content row it renders through `component:Item`: the icon slot, label,
  description, layout choice, and end content.
- The `selector-option` target on that row, and the removal of the row's own
  padding, corner radius, and minimum width.
- Folding to `inline` when its host pins the row height.

**Does not own / non-goals**

- The option row's role, name, selected and highlighted state, and selection —
  owned by `component:Selector`.
- The trigger's sizing around a rendered value — owned by `component:Selector`.
- Item's layout, density, and targets — owned by `component:Item`.

## Public concepts

| Concept     | Closed values or states | Meaning                                                                                                                              | Availability by variant/orientation                                                  |
| ----------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| layout      | `stacked`, `inline`     | `stacked` puts the description on its own line; `inline` keeps label and description on one line.                                    | Caller's choice, except as a Selector trigger value inside an InputGroup (`inline`). |
| icon        | absent, present         | A semantic icon name or icon component renders as a small secondary Icon before the label; other ReactNode content renders as given. | Every layout.                                                                        |
| end content | absent, present         | Caller content after the label and description.                                                                                      | Every layout.                                                                        |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                         | Basis                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| FR1 | SelectorOption renders one `component:Item` row: `icon` in the start slot when present (a semantic icon name or icon component as a small secondary Icon, other ReactNode content as given), `label`, `description` when present, and `endContent` when present. Selector's default option renderer draws each option through SelectorOption too. | Current source and tests                                       |
| FR2 | The row uses the caller's `layout` (`stacked` by default). When its host pins the row height (a Selector trigger inside an InputGroup), the row is `inline` whatever the caller passed.                                                                                                                                                           | Current source and tests                                       |
| FR3 | The row carries the `selector-option` target. Its own block and inline padding and corner radius are zero and its minimum width is zero, so a long string label ellipsizes inside a narrow host (a ReactNode label wraps). Caller `xstyle` merges after these base styles; `className` and `style` reach the row.                                 | `architecture:component-theming-surface`; current source       |
| FR4 | SelectorOption MUST accept a `ref` connected to its row and pass supported DOM props to it (`architecture:public-component-api` INV5, INV8). Implementation gap: it accepts neither a `ref` nor other DOM props.                                                                                                                                  | `architecture:public-component-api` INV5, INV8; current source |

### Allowed variation

- **AV1 — Content.** Label, description, icon, and end content are caller
  content.
- **AV2 — Theme paint.** Themes may restyle the `selector-option` target.

### Representative states

| State                          | Required invariant                           | Allowed variation |
| ------------------------------ | -------------------------------------------- | ----------------- |
| Option, stacked                | Description below the label.                 | Content.          |
| Option, inline                 | Label and description on one line.           | Content.          |
| Trigger value in an InputGroup | `inline`, whatever the caller passed.        | Content.          |
| With end content               | End content after the label and description. | Content.          |

### Transformation and precedence order

- **ORD1 — Layout.** Host-pinned `inline` → caller `layout` → `stacked`.
- **ORD2 — Styling.** Base row reset → caller `xstyle` → `className` and
  `style`.

### Performance and resources

- **PR1 — Pure render.** SelectorOption owns no state, effect, listener,
  observer, or timer.

## Accessibility contract

- **AR1 — Content only.** SelectorOption adds no role, name, or state; the
  Selector option row it sits in owns them. A semantic name or icon component is
  decorative; other ReactNode content keeps the semantics its caller gives it.

## Design relationships

| Anatomy or state | Design requirement                                  | Representation authority | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Row              | Lays out the option content like a built-in option. | Current source           | Supporting     | FR1, FR3           |
| Icon             | Identifies the option at a glance.                  | Current source           | Supporting     | FR1                |
| Label            | Names the option.                                   | Current source           | Prominent      | FR1, FR3           |
| Description      | Adds secondary detail.                              | Current source           | Supporting     | FR1, FR2           |
| End content      | Holds caller content after the text.                | Current source           | Supporting     | FR1                |

`Selector.spec.md` maps the `selector-option` target in its theming anatomy as
"SelectorOption-rendered content", so this record carries no anatomy-theming
map.

## Family and system relationships

- `component:Selector` owns the option rows, the trigger, and the
  `selector-option` mapping in its theming anatomy.
- `component:Item` owns the row layout SelectorOption composes.
- `architecture:component-theming-surface` owns target placement.
- `architecture:public-component-api` owns styling composition.

## Verification map

| Contract             | Verification                                                                                                 | Representative states                                    | Mutation or failure expectation                                                                                                                                                 | Audit section                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1                  | `Selector.test.tsx` "renders custom option endContent" and "renders the selected option through renderValue" | Option with end content; value with icon and description | A dropped end content, label, description, or icon fails. Evidence gap: no test asserts the small secondary presentation of a semantic icon name or icon component.             | `audit:SelectorOption/anatomy`  |
| FR2                  | `Selector.test.tsx` "follows the caller's SelectorOption layout, but folds inline in a group"                | Standalone trigger; trigger in an InputGroup             | A stacked row in an InputGroup, or an inline row standalone by default, fails. Evidence gap: no test passes `layout="inline"` outside an InputGroup.                            | `audit:SelectorOption/layout`   |
| FR3                  | `Selector.test.tsx` "lets a narrow list shrink an option so its label can ellipsize"                         | Default option in a narrow list                          | A missing `selector-option` row or a nonzero minimum width fails. Evidence gap: no test asserts the padding and radius reset, or `xstyle`, `className`, and `style` on the row. | `audit:SelectorOption/theming`  |
| ORD1, ORD2, PR1, AR1 | ORD1 is covered by the FR2 row. Evidence gap: no test asserts ORD2, PR1, or the decorative icon              | —                                                        | —                                                                                                                                                                               | `audit:SelectorOption/behavior` |
| FR4                  | Evidence gap: no test, matching the FR4 gap                                                                  | —                                                        | —                                                                                                                                                                               | `audit:SelectorOption/api`      |

## Current-state impact

- **No ref or DOM props (FR4).** SelectorOption accepts neither a `ref` nor
  other DOM props, against `architecture:public-component-api` INV5 and INV8.

## Decision log

No component-local decision.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
