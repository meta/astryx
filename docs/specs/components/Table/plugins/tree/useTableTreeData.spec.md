---
schema_version: 3
template_version: 4
kind: module
id: module:Table/useTableTreeData
authority: current
archive_reason: null
superseded_by: null
approved_by: humbertovirtudes
approved_at: 2026-11-04
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/core/src/Table/plugins/tree/useTableTreeData.test.tsx,
    apps/storybook/stories/TableTree.stories.tsx,
    scripts/check-i18n-catalog.mjs,
    scripts/check-knowledge.mjs,
  ]
parent_component: component:Table
references:
  [
    architecture:internationalization,
    architecture:public-component-api,
    architecture:react-component-runtime,
    spec:AST-009,
    module:Table/useTableRowExpansion,
    module:Table/useTableTreegrid,
  ]
---

# useTableTreeData accessible-name and row-position contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Optional `getRowLabel?: (item: T) => string` supplies tree-row identity for expansion controls. `TableTreeRowMeta` takes optional `posInSet` and `setSize`. |
| Behavior                | A nonblank trimmed identity gives the localized expand/collapse button a named label; omitted or blank text uses the generic name.                          |
| End-user impact         | Top-level and nested expansion controls identify their rows.                                                                                                |
| Builder impact          | Callers opt in with row identity text; expansion state and verbs stay separate.                                                                             |
| Compatibility/readiness | Additive optional API; existing tree state, data and control semantics remain. Implementation release verification is separate.                             |
| Review checks           | Reject index/column-derived names, new visible content or stale names after a label/locale update.                                                          |
| Governing rules         | Table owns aggregate composition; internationalization and React runtime own their shared mechanisms; this module covers naming only.                       |

This table is a review projection; the body below is authoritative.

## Intent

A tree expansion button identifies the row it controls at every depth, and row meta can carry each row's position in its complete sibling group. This record contracts only accessible names, the optional naming callback and the optional row-position fields, not the complete tree plugin or tree-view anatomy.

## Compatibility and migration

- Released default preserved: yes; an omitted callback keeps generic localized expansion names.
- Compatibility class: optional additive API with no tree-data, row-key, expansion-state or interaction change.
- Migration decision: DEC-1. Consumer usage belongs in `useTableTreeData.doc.mjs`.
- Known validation exception: without `module:Table/useTableTreegrid`, body rows carry no `aria-expanded` (the expansion button carries it, AR1), but they keep `aria-level` outside a treegrid. Chromium exposes it as the row's depth, leaves included, and accessibility checkers report it. A table that composes `module:Table/useTableTreegrid` is a treegrid, where `aria-level` is valid.
- `posInSet` and `setSize` are optional additions to `TableTreeRowMeta`; meta without them typechecks and renders as before.

## Ownership boundary

**Owns:** row-label input, whitespace normalization, named messages, consumption of the rendered expander's translation context, semantic label refresh and naming evidence; the optional `posInSet` and `setSize` fields of `TableTreeRowMeta` and the values `useTableTreeState` supplies for them.

**Does not own:** internationalization-provider scope and update semantics, aggregate Table protocol, tree flattening, row keys, expansion state, hierarchy/selection semantics, control visibility, motion, row-click behavior or the complete hook configuration. No selection-label rule changes here.

## Public API and concepts

| Concept           | Values                                      | Meaning                                    | Default                                   | Owner               | Stability                   |
| ----------------- | ------------------------------------------- | ------------------------------------------ | ----------------------------------------- | ------------------- | --------------------------- |
| Row identity text | String returned for the row item            | Human-readable name excluding action verbs | Callback absent                           | Caller              | Additive from first release |
| Effective label   | Trimmed nonempty string or absent           | Named or generic control label             | Generic                                   | This module         | Stable                      |
| Name state        | Collapsed or expanded                       | Localized expand/collapse wording          | Follows existing expansion state          | This module         | Stable                      |
| Row position      | 1-based `posInSet` and `setSize`, or absent | Position in the complete sibling group     | Absent; `useTableTreeState` supplies both | Caller / tree state | Additive from first release |

## Behavioral contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                               | Basis                                    | Evidence state                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| FR1 | `UseTableTreeDataConfig<T>` accepts optional `getRowLabel?: (item: T) => string`. It receives the existing item at any depth and never supplies row keys or expansion state. Text is not inferred from rendered columns.                                                                                                                                                                                | Caller-owned identity; DEC-1             | Approved; implementation verified separately |
| FR2 | Trim surrounding whitespace. A nonempty result supplies `{label}` to `@astryx.tableTree.expandRowNamed` or `collapseRowNamed`, according to existing expansion state. Omitted or whitespace-only results select the existing `expandRow` or `collapseRow` message.                                                                                                                                      | DEC-1; internationalization ownership    | Approved; implementation verified separately |
| FR3 | Each rendered tree expander uses its own internationalization provider. Locale/override changes and changes to effective row-label text update the accessible name, including label-only changes without altering tree expansion state.                                                                                                                                                                 | Provider and semantic snapshot contracts | Verification required                        |
| FR4 | Naming does not change which rows have expanders, add visible text or alter native button role, `aria-expanded`, tree data, selection, keyboard interaction, focus or row-click behavior. Leaves without expansion controls do not gain them.                                                                                                                                                           | Additive compatibility                   | Verification required                        |
| FR5 | `TableTreeRowMeta` accepts optional `posInSet?: number` and `setSize?: number`: the row's 1-based position in, and the size of, its complete sibling group, including siblings that are not loaded or not on the current page. `useTableTreeState` supplies both from the complete sibling group after sibling sorting. This module renders neither; `module:Table/useTableTreegrid` FR3 consumes them. | Full-set position semantics              | Verification required                        |

### Transformation and precedence order

- **ORD1:** caller row text is normalized before message interpolation; existing expansion state chooses the verb and the rendered expander's provider supplies wording.
- **ORD2:** absent/blank identity selects generic wording. This expansion-specific fallback does not change the selection plugin's same-named callback behavior.

### Performance and resources

- **PR1:** a row-label update participates in the existing row's semantic notification. Naming introduces no independent tree store, observer, listener or asynchronous loader; unchanged semantic snapshots retain their identity.

## Accessibility contract

- **AR1:** expansion buttons expose the complete localized action/name and retain independent `aria-expanded` state at top-level and nested depths.
- **AR2:** computed accessibility-tree/browser names establish role/state/name exposure, not a specific spoken phrase or new tree navigation model.

## Design relationships

| Anatomy                | Requirement                                                | Owner                                    | Contract |
| ---------------------- | ---------------------------------------------------------- | ---------------------------------------- | -------- |
| Existing tree expander | Names change without new visual content or control anatomy | Existing tree control; this naming slice | FR2-FR4  |

## Parent and system relationships

`component:Table` retains aggregate composition and renderer ownership. `architecture:internationalization` owns ICU messages, provider updates and catalog fallback. `architecture:react-component-runtime` owns external-store snapshot stability. The row-expansion naming module uses the same normalization boundary but owns a separate hook lifetime.

## Verification map

| Contract | Verification                                         | States                                                         | Failure expectation                                                                               |
| -------- | ---------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| FR1-FR2  | Tree plugin tests and browser accessible-name checks | Top-level/nested, collapsed/expanded, omitted/blank/named      | Removing normalization/interpolation changes the expected names                                   |
| FR3      | Label-only and provider update tests                 | Same tree data and expansion state; text/locale change         | Omitting effective text from semantic refresh keeps a stale accessible name                       |
| FR4      | Existing tree state/performance/keyboard tests       | Leaves, expansion toggles and named controls                   | Naming must not introduce controls or change state/data/focus                                     |
| FR5      | `useTableTreeState` and type tests                   | Roots, nested groups, sorted siblings; meta without the fields | A position counted before sibling sorting, or meta without the fields failing to typecheck, fails |

## Decision log

### DEC-1 — Caller identity; localized component action

**Reference:** `module:Table/useTableTreeData/DEC-1`
**Decider:** humbertovirtudes, 2026-11-04.

The callback supplies identity only. Blank trimmed text uses generic expansion wording, matching the detail-row expander without imposing a new selection rule. Rejected: a full-action-label callback or inference from display-column content.

## Open questions

None.

## Content boundary

This record leaves the rest of the tree hook uncontracted here; consumer signatures/examples, implementation plans, audit results and parent/shared rules retain their own locations.
