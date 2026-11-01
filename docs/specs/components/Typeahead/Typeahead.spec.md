---
schema_version: 3
template_version: 3
kind: component
id: component:Typeahead
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [theming]
verified_by:
  [
    packages/core/src/Typeahead/Typeahead.test.tsx,
    packages/core/src/Typeahead/TypeaheadItem.test.tsx,
    packages/core/src/Field/Field.test.tsx,
    packages/core/src/Token/Token.test.tsx,
    packages/core/src/Icon/Icon.test.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:input-fields, family:overlay-dismissal]
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:layer-runtime]
contributing: []
system_specs: []
---

# Typeahead component contract

## Intent

Typeahead renders a single-selection search control with an optional standalone
Field shell and delegates its combobox engine and popup results to BaseTypeahead. This draft records current
consumer anatomy, target reachability, and the shipped difference between the
stable result row and its default TypeaheadItem content without changing runtime
behavior, styling, targets, or public API.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: additive documentation only; runtime, DOM, styling,
  targets, and public API remain unchanged
- Controlled/uncontrolled behavior: unchanged
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The painted Input surface and its current `typeahead` target.
- The Dropdown and Empty state rendered by BaseTypeahead and their current
  `typeahead-dropdown` and `typeahead-empty-state` targets.
- Default item content rendered by TypeaheadItem and its current
  `typeahead-item` target.
- The stable outer Result row, Result group heading, and Selected result state,
  which currently have no Typeahead target.

**Does not own / non-goals**

- Standalone field-shell presentation — rendered by Field and themed through
  Field's current `field` target; omitted when Typeahead is inside InputGroup.
- The Selected token — rendered by Token and themed through Token's current
  `token` target.
- The Clear button — rendered by Field's InputClearButton and themed through
  Field's current `input-clear-button` target.
- Loading-indicator presentation — owned by `component:Spinner`. Typeahead
  decides only where the indicator sits.
- General Icon presentation for an Icon-rendered start icon.
- Arbitrary ReactNode start or item content supplied by the caller.
- A target/state for the outer Result row, Result group heading, or selected-row
  concept; none exists on current `main`.
- Shared layer lifecycle, positioning, and dismissal behavior.

## Public concepts

No new public concept is introduced. Consumer props and usage remain documented
in `Typeahead.doc.mjs`; BaseTypeahead and TypeaheadItem retain their existing
public component documentation.

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                       | Basis                           | Draft review state                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------- |
| FR1 | The current standalone presentation contains a Field and painted Input surface; the supported InputGroup path renders the same Input surface without a Field. The surface contains an editable input when unselected or editing, and a Selected token plus collapsed input when selected and not editing. | Current source, docs, and tests | Verified current behavior; no normalization        |
| FR2 | Input surface, Dropdown, Empty state, and Default item content carry the four current Typeahead targets documented in `Typeahead.doc.mjs`.                                                                                                                                                                | Current source, docs, and tests | Verified current behavior; no target change        |
| FR3 | Every result, whether default or caller-rendered, sits inside the same stable outer Result row that owns option semantics, highlight, selected styling, pointer interaction, and keyboard indexing.                                                                                                       | Current source and tests        | Verified current behavior; no new behavior decided |
| FR4 | `typeahead-item` reaches only the standard TypeaheadItem label/supporting-content branch inside a Result row. A custom `renderItem` branch or caller-provided `item.element` does not receive that target, and no branch gives the outer Result row a Typeahead target.                                   | Current source and owner tests  | Verified current asymmetry; no normalization       |
| FR5 | Result group heading and Selected result state are stable visible concepts but no current Typeahead target reaches them. The selected check uses a generic Icon, which does not expose a Typeahead-specific selected-row selector.                                                                        | Current source                  | Verified factual reachability gaps                 |
| FR6 | When present, Field, Selected token, Clear button, Spinner, and Icon-rendered start icon retain their Field, Token, Spinner, and Icon theming owners; arbitrary ReactNode start and item content stays caller-owned.                                                                                      | Current composition and owners  | Verified current behavior; no target change        |

### Allowed variation

- Standalone Typeahead renders Field; the supported InputGroup path omits it.
- The Input surface shows an editable input while empty or editing and a Token
  while a selected value is not being edited. This shipped asymmetry is recorded,
  not normalized into a new shared part or target.
- A Result row may contain standard TypeaheadItem content, custom `renderItem`
  content, or a caller-provided `item.element`. Only the standard TypeaheadItem
  label/supporting-content branch carries `typeahead-item`.
- Results may be ungrouped or grouped. Group wrappers and headings do not gain a
  target from that variation.
- Semantic names and icon component types render through Icon. Arbitrary ReactNode
  start content renders directly and stays caller-owned.

### Representative states

| State                         | Required invariant                                                                                 | Allowed variation                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Standalone or InputGroup      | Field is present only standalone; Input surface anatomy and targets remain the same in both paths. | InputGroup owns grouped layout and labeling support.                    |
| Empty or editing              | Editable input remains inside the `typeahead` Input surface.                                       | Query, loading state, and popup visibility may vary.                    |
| Selected and not editing      | Token owns the selected-value presentation while the input is collapsed.                           | Clear button may be present according to `hasClear` and disabled state. |
| Results with default renderer | Outer Result row remains untargeted; inner TypeaheadItem carries `typeahead-item`.                 | Item label, icon/avatar, and description may vary.                      |
| Results with custom renderer  | Outer Result row remains untargeted; custom content receives no `typeahead-item`.                  | Caller owns the inner result content.                                   |
| Grouped and selected results  | Group heading and selected-row concept remain untargeted by Typeahead.                             | A generic Icon paints the selected check.                               |
| Empty completed search        | Empty state carries `typeahead-empty-state` inside the Dropdown.                                   | Consumer-supplied empty text may vary.                                  |

### Transformation and precedence order

- No new query, search-result, selection, edit-mode, or styling precedence rule is
  introduced.

### Performance and resources

- No new performance or resource rule is introduced.

## Accessibility contract

This draft does not change or extend Typeahead's existing field, combobox,
listbox, option, live-region, focus, or dismissal behavior.

## Design relationships

| Anatomy or state              | Design requirement                                                                                     | Representation authority       | Hierarchy role    | Component contract |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------ | ----------------- | ------------------ |
| Field                         | Provides the label and optional supporting content outside InputGroup; omitted inside InputGroup.      | Field component                | Supporting        | FR1, FR6           |
| Input surface                 | Paints the control around the editable input or selected token.                                        | Current source and public docs | Prominent         | FR1, FR2           |
| Icon-rendered start icon      | Presents a semantic or component icon through Icon.                                                    | Icon component                 | Supporting        | FR6                |
| Caller-rendered start content | Presents arbitrary caller content directly in the input surface's start slot.                          | Caller-supplied content        | Context-dependent | FR6                |
| Selected token                | Presents the selected value outside edit mode through Token.                                           | Token component                | Prominent         | FR1, FR6           |
| Spinner                       | Indicates a search in flight, at the end of the input surface.                                         | Spinner component              | Supporting        | FR6                |
| Clear button                  | Removes the selected value through the shared field clear action.                                      | Field component                | Supporting        | FR6                |
| Dropdown                      | Paints the anchored listbox surface containing results or Empty state.                                 | Current source and public docs | Prominent         | FR2                |
| Empty state                   | Presents the no-results message after a completed empty search.                                        | Current source and public docs | Prominent         | FR2                |
| Result row                    | Owns option semantics, interaction, highlight, selection styling, and keyboard index for every result. | Current source and tests       | Prominent         | FR3, FR4           |
| Default item content          | Presents the standard TypeaheadItem label and optional supporting content inside a Result row.         | TypeaheadItem component        | Prominent         | FR2, FR4           |
| Caller-rendered item content  | Presents custom `renderItem` or `item.element` content inside the stable Result row.                   | Caller-supplied content        | Context-dependent | FR3, FR4, FR6      |
| Result group heading          | Labels a visible group of Result rows.                                                                 | Current source                 | Supporting        | FR5                |
| Selected result state         | Presents selected row weight and a trailing check without a Typeahead-specific target or target state. | Current source                 | Supporting        | FR5                |

The current target placement is asymmetric: `typeahead-item` is on default inner
TypeaheadItem content, while the stable outer Result row owns interaction and state
for both default and custom content. Group headings and the selected-result concept
are also untargeted. This record preserves those facts and does not move, add, or
normalize targets.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Field": {"delegatesTo": {"owner": "component:Field", "target": "field"}},
  "Input surface": {"target": "typeahead"},
  "Icon-rendered start icon": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Caller-rendered start content": {
    "none": {
      "reason": "intentional: Arbitrary ReactNode content is caller-owned and receives no Typeahead target."
    }
  },
  "Selected token": {
    "delegatesTo": {"owner": "component:Token", "target": "token"}
  },
  "Spinner": {
    "delegatesTo": {"owner": "component:Spinner", "target": "spinner"}
  },
  "Clear button": {
    "delegatesTo": {
      "owner": "component:Field",
      "target": "input-clear-button"
    }
  },
  "Dropdown": {"target": "typeahead-dropdown"},
  "Empty state": {"target": "typeahead-empty-state"},
  "Result row": {
    "none": {
      "reason": "reachability-gap: The stable outer option row owns interaction and state but has no current Typeahead target."
    }
  },
  "Default item content": {"target": "typeahead-item"},
  "Caller-rendered item content": {
    "none": {
      "reason": "intentional: Custom renderItem and item.element content is caller-owned and does not receive the standard TypeaheadItem target."
    }
  },
  "Result group heading": {
    "none": {
      "reason": "reachability-gap: No current public target reaches the visible result-group heading."
    }
  },
  "Selected result state": {
    "none": {
      "reason": "reachability-gap: No current Typeahead target or target state reaches the outer selected row and its selection concept."
    }
  }
}
```

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, local
  target mapping, delegation, and factual `none` dispositions.
- `architecture:layer-runtime` owns the current Popover host, positioning, native
  light-dismiss, and visibility reconciliation used by the Dropdown.
- `family:overlay-dismissal` owns shared Escape and platform-close ordering;
  Typeahead participates through its composed Popover owner.
- Field, Token, and Icon retain ownership of their delegated targets and
  presentation.

## Verification map

| Contract            | Verification                                                                          | Representative states                                              | Mutation or failure expectation                                                             | Audit section             |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------- |
| FR1, FR6            | `Typeahead.test.tsx`, owner tests, and Typeahead composition source                   | Standalone/InputGroup, empty, editing, selected, clear, start icon | A documented composed part disappears, gains the wrong owner, or misreports Field presence. | `audit:Typeahead/anatomy` |
| FR2                 | Source inspection, target inventories, empty-state test, and `TypeaheadItem.test.tsx` | Input, open Dropdown, empty search, default item                   | A current target is missed, invented, or documented on an element that does not carry it.   | `audit:Typeahead/theming` |
| FR3, FR4, FR5       | BaseTypeahead source and result/group/selection tests                                 | Default/custom result, grouped result, selected row                | The record hides the outer/inner asymmetry or claims reachability that current code lacks.  | `audit:Typeahead/theming` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                         | Canonical anatomy and current target inventory                     | Missing, extra, prefixed, stale, or multiply assigned mappings fail repository validation.  | `audit:Typeahead/theming` |

Existing tests directly assert Empty state and TypeaheadItem target presence,
selected-value Token behavior, result semantics, selection state, and standalone
Field content. Source inspection confirms InputGroup's Field omission and, with
public target inventories, provides the current Input surface and Dropdown target
evidence. No test is represented here as proof of a target it does not directly
assert.

## Decision log

None. This draft records current facts and introduces no component-local design,
API, theming, or layer-system decision.

## Open questions

- **OQ1 — Should the stable Result row, Result group heading, or Selected result
  state gain a public Typeahead target?** (`human-api`) Their current lack of
  reachability is an audit gap, not settled intent. This draft does not normalize
  the existing outer-row/default-content asymmetry.

## Content boundary

This file does not duplicate consumer prop tables, examples, search algorithms,
implementation steps, or shared layer and theming rules. It links to their owners.
