---
schema_version: 3
template_version: 4
kind: module
id: module:Table/useTableRowExpansion
authority: current
archive_reason: null
superseded_by: null
approved_by: humbertovirtudes
approved_at: 2026-11-04
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/core/src/Table/plugins/rowExpansion/useTableRowExpansion.test.tsx,
    apps/storybook/stories/TableRowExpansion.stories.tsx,
    scripts/check-i18n-catalog.mjs,
    scripts/check-knowledge.mjs,
  ]
parent_component: component:Table
references:
  [
    architecture:internationalization,
    architecture:public-component-api,
    spec:AST-009,
    module:Table/useTableTreeData,
  ]
---

# useTableRowExpansion accessible-name contract

## Contract at a glance

| Area                    | Contract                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | Optional `getRowLabel?: (item: T) => string` supplies row identity, not action wording.                                        |
| Behavior                | A nonblank trimmed label gives a localized named expansion control; omitted or blank labels retain generic names.              |
| End-user impact         | The accessible name identifies the row controlled by an expand/collapse button.                                                |
| Builder impact          | Callers opt in only when they have a human-readable row identity.                                                              |
| Compatibility/readiness | Additive optional API; existing expansion behavior and generic labels remain. Implementation release verification is separate. |
| Review checks           | Reject hook-callsite locale capture, new visual content, selection semantics, or named context-menu copy.                      |
| Governing rules         | Table FR7 owns placement; internationalization owns catalogs and provider scope; this module owns the naming slice only.       |

This table is a review projection; the body below is authoritative.

## Intent

The detail-row expansion control names the row it acts on without making callers own verbs, expansion-state wording or localization. This record contracts only that accessible-name slice of the existing hook.

## Compatibility and migration

- Released default preserved: yes; omitting the option keeps localized generic expand/collapse names.
- Compatibility class: additive optional callback, with no row-key, panel, motion or interaction change.
- Migration decision: DEC-1. Consumer usage belongs in `useTableRowExpansion.doc.mjs`.

## Ownership boundary

**Owns:** the optional row-label callback, whitespace normalization, named-control messages, consumption of the rendered control's translation context, and naming verification.

**Does not own:** internationalization-provider scope and update semantics, Table rendering/composition, expansion state, row keys, panel anatomy, motion, interaction handlers, selection, or the complete hook configuration. Table and their existing owners retain those contracts. The selection plugin's callback behavior is not changed by this record.

## Public API and concepts

| Concept           | Values                            | Meaning                                         | Default                            | Owner       | Stability                   |
| ----------------- | --------------------------------- | ----------------------------------------------- | ---------------------------------- | ----------- | --------------------------- |
| Row identity text | String returned for the row item  | Human-readable identity, excluding action verbs | Callback absent                    | Caller      | Additive from first release |
| Effective label   | Trimmed nonempty string or absent | Named or generic control label                  | Generic                            | This module | Stable                      |
| Name state        | Collapsed or expanded             | Localized expand or collapse action             | Follows controlled expansion state | This module | Stable                      |

## Behavioral contract

| ID  | Invariant                                                                                                                                                                                                                                                                 | Basis                                         | Evidence state                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| FR1 | `UseTableRowExpansionConfig<T>` accepts optional `getRowLabel?: (item: T) => string`. The hook supplies the existing row item; it does not infer text from columns or DOM or use that text as a row key.                                                                  | Caller-owned identity; DEC-1                  | Approved; implementation verified separately |
| FR2 | Trim surrounding whitespace. A nonempty result supplies `{label}` to `@astryx.tableRowExpansion.expandRowNamed` or `collapseRowNamed`, according to expansion state. An absent callback or whitespace-only result uses the existing `expandRow` or `collapseRow` message. | DEC-1; internationalization message ownership | Approved; implementation verified separately |
| FR3 | This module resolves names in the rendered control's translation context; `architecture:internationalization` owns that provider's scope and locale/override updates, including when it surrounds only Table inside the hook's caller.                                    | Internationalization provider boundary        | Verification required                        |
| FR4 | The row's context-menu action retains generic localized expand/collapse wording. Row labels do not add visible text, alter layout or change control roles, `aria-expanded`, keyboard operation, focus or panel behavior.                                                  | Table FR7; additive compatibility             | Verification required                        |

### Transformation and precedence order

- **ORD1:** caller identity text is normalized before message interpolation; controlled expansion state selects the action and the control's provider supplies its translation.
- **ORD2:** blank text falls back to the generic action, not an empty or whitespace-only accessible name. This boundary applies to expansion controls, not selection controls.

### Performance and resources

- **PR1:** naming adds no dataset scan, observation, asynchronous work or independent expansion state. Existing hook lifetimes remain owned by the hook.

## Accessibility contract

- **AR1:** the native button has the complete localized action/row name; its expanded state remains exposed independently through `aria-expanded`.
- **AR2:** generic fallback remains available for callers without a usable label. Computed accessible-name/browser evidence does not promise a particular screen-reader phrase.

## Design relationships

| Anatomy           | Requirement                                               | Owner                        | Contract |
| ----------------- | --------------------------------------------------------- | ---------------------------- | -------- |
| Expansion control | Naming changes without new visual text or control anatomy | Table FR7; this naming slice | FR2-FR4  |

## Parent and system relationships

`component:Table` owns aggregate protocol and placement. `architecture:internationalization` owns ICU interpolation, provider updates and missing-message fallback. `module:Table/useTableTreeData` defines the same normalization boundary for tree expansion controls without combining the hook lifetimes.

## Verification map

| Contract | Verification                                                  | States                                     | Failure expectation                                                      |
| -------- | ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| FR1-FR2  | Row-expansion tests and Storybook accessible-name probes      | Omitted, blank, named, collapsed, expanded | Removing interpolation or blank fallback produces wrong names            |
| FR3      | Provider-placement/locale-update regressions                  | Provider around only Table; locale changes | Resolving in the caller's hook context fails the control-name assertions |
| FR4      | Existing panel/menu/keyboard tests and matched browser checks | Named controls and context-menu action     | Named menu copy or altered state/focus fails compatibility checks        |

## Decision log

### DEC-1 — Row identity is caller text; action wording is component text

**Reference:** `module:Table/useTableRowExpansion/DEC-1`
**Decider:** humbertovirtudes, 2026-11-04.

The optional callback supplies identity only. Trimmed blank text uses the generic name, so opt-in never requires callers to duplicate verbs or localization. Rejected: a full-action-label callback or inference from a display column.

## Open questions

None.

## Content boundary

This record does not prescribe the complete expansion hook, tree anatomy, consumer examples, current audit results, implementation steps or shared system rules.
