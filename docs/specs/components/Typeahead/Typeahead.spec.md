---
schema_version: 3
template_version: 7
kind: component
id: component:Typeahead
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Typeahead/Typeahead.test.tsx,
    packages/core/src/Typeahead/Typeahead.fr10.test.tsx,
    packages/core/src/Typeahead/TypeaheadItem.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:input-fields, family:overlay-dismissal]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:layer-runtime,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-085]
---

# Typeahead component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. Typeahead takes BaseTypeahead's search props plus field props (`label`, `description`, `status`, `isRequired`, `size`), `hasClear`, `isDisabled` and `disabledMessage`, start content, and `container*` and `control*` styling. |
| Behavior                | A Field-wrapped BaseTypeahead whose selected value shows as a Token; clicking the Token edits it; clear sets `null`; disabled with a reason stays focusable.                                                                                  |
| End-user impact         | People search and pick one value, see it as a token, and edit or clear it. A disabled Typeahead without a reason drops out of the Tab order.                                                                                                  |
| Builder impact          | Builders style the field through `container*` and `control*` and theme four Typeahead targets.                                                                                                                                                |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Native `disabled` without a reason and caller handlers while disabled are listed under Current-state impact.                                                                        |
| Review checks           | Reject a lost target, a Token beside the input instead of over it, an input left in the Tab order behind a Token, a caller key handler that cancels navigation, or a reason not linked from the input.                                        |
| Governing rules         | `family:input-fields`; `spec:AST-085` FR1, FR2; `component:BaseTypeahead`; `architecture:component-theming-surface`.                                                                                                                          |

This table is a review projection; the body below is authoritative.

## Intent

Typeahead renders a single-selection search control with an optional standalone
Field shell and delegates its combobox engine and popup results to BaseTypeahead.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: `value` is controlled
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The painted Input surface and its `typeahead` target.
- The Dropdown and Empty state rendered by BaseTypeahead and their
  `typeahead-dropdown` and `typeahead-empty-state` targets.
- Default item content rendered by TypeaheadItem and its
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
  concept; none exists (OQ1).
- Shared layer lifecycle, positioning, and dismissal behavior.

## Public concepts

No component-local concept beyond the props documented in `Typeahead.doc.mjs`;
BaseTypeahead and TypeaheadItem keep their own records.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Basis                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| FR1 | The current standalone presentation contains a Field and painted Input surface; the supported InputGroup path renders the same Input surface without a Field. The surface contains an editable input when unselected or editing, and a Selected token plus collapsed input when selected and not editing.                                                                                                                                                                                                        | Current source, docs, and tests           |
| FR2 | Input surface, Dropdown, Empty state, and Default item content carry the four Typeahead targets documented in `Typeahead.doc.mjs`.                                                                                                                                                                                                                                                                                                                                                                               | Current source, docs, and tests           |
| FR3 | Every result, whether default or caller-rendered, sits inside the same stable outer Result row that owns option semantics, highlight, selected styling, pointer interaction, and keyboard indexing.                                                                                                                                                                                                                                                                                                              | Current source and tests                  |
| FR4 | `typeahead-item` reaches only the standard TypeaheadItem label/supporting-content branch inside a Result row. A custom `renderItem` branch or caller-provided `item.element` does not receive that target, and no branch gives the outer Result row a Typeahead target.                                                                                                                                                                                                                                          | Current source and owner tests            |
| FR5 | Result group heading and Selected result state are stable visible concepts but no Typeahead target reaches them (OQ1). The selected check uses a generic Icon, which exposes no Typeahead-specific selected-row selector.                                                                                                                                                                                                                                                                                        | Current source                            |
| FR6 | When present, Field, Selected token, Clear button, Spinner, and Icon-rendered start icon retain their Field, Token, Spinner, and Icon theming owners; arbitrary ReactNode start and item content stays caller-owned.                                                                                                                                                                                                                                                                                             | Current composition and owners            |
| FR7 | A disabled Typeahead with a `disabledMessage` keeps the input focusable with `aria-disabled`, links the reason Tooltip through `aria-describedby`, and blocks typing and selection. A disabled control MUST keep its Tab stop (`spec:AST-085` FR1). Caller handlers other than focus and blur MUST NOT run while disabled (FR2). Implementation gap: without a reason the input is natively `disabled`, and with a reason it still runs caller click, pointer, and key handlers (`component:BaseTypeahead` FR9). | `spec:AST-085` FR1, FR2; current tests    |
| FR8 | With a selected value and not editing, the Token paints over the collapsed input, which leaves the Tab order, and the Token's button, named by the field label and the value, is the Tab stop; clicking the Token enters edit mode, which searches the value's label and restores the input to the Tab order; blur without an action restores the Token; a composing Escape does not leave edit mode. With `hasClear`, the clear button calls `onChange(null)`, and clearing while editing empties the input.    | Current tests                             |
| FR9 | The field has no root styling props: `control*` reaches the input surface and `container*` the Field box (`family:input-fields` FR10); DOM props and the ref reach the combobox input in both paths; a caller `onKeyDown` runs after built-in key handling, once per key, and also for keys on the clear button; a caller `aria-labelledby` follows the field's own name. The surface keeps one row with the end controls in flow at the inline end, and its height is the shared element size as a minimum.     | `family:input-fields` FR10; current tests |

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

- **ORD1 — Display.** Editing or no value → the editable input; a value not
  being edited → the Token over the collapsed input.

### Performance and resources

- **PR1 — Delegated resources.** Search timers and stale-response rejection are
  BaseTypeahead's (`component:BaseTypeahead` PR1); Typeahead adds no listener of
  its own.

## Accessibility contract

Combobox, listbox, option, live-region, and dismissal semantics are
`component:BaseTypeahead`'s.

- **AR1 — One field.** The input is named by the Field label (and a caller
  `aria-labelledby` after it) and described by the description and status; the
  combobox exposes the resolved required state as `aria-required` and an error
  status as `aria-invalid`, keeping a caller's own values when the field's state
  is off.
- **AR3 — Token button name.** While a value shows, the Token's button, the Tab
  stop, is named by the field label (or a caller `aria-labelledby`) and the
  value.
- **AR2 — Hidden input behind a Token.** While a Token shows, the collapsed
  input is out of the Tab order, so Tab reaches the Token's controls and moves
  on (FR8).

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

- `spec:AST-092` incremental search results reach Typeahead through
  BaseTypeahead; Typeahead adds no props for them.
- `architecture:component-theming-surface` owns anatomy qualification, local
  target mapping, delegation, and factual `none` dispositions.
- `architecture:layer-runtime` owns the current Popover host, positioning, native
  light-dismiss, and visibility reconciliation used by the Dropdown.
- `family:overlay-dismissal` owns shared Escape and platform-close ordering;
  Typeahead participates through its composed Popover owner.
- Field, Token, and Icon retain ownership of their delegated targets and
  presentation.

## Verification map

| Contract            | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Representative states                             | Mutation or failure expectation                                                                                                                                                                                                                            | Audit section                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1, FR6            | `Typeahead.test.tsx` Typeahead rendering cases ("renders with label", "renders description text", "shows required indicator", "renders error status message", "shows selected value as a token", "shows clear button when hasClear and value is selected") and value-lane cases                                                                                                                                                                                                                                                                                                   | Standalone; selected; clear; status               | A missing Field part, Token, or clear button fails. Evidence gap: no test asserts that the InputGroup path omits the Field, or the Spinner and Icon delegation.                                                                                            | `audit:Typeahead/anatomy`       |
| FR2                 | `Typeahead.test.tsx` "exposes the empty state as a themeable target"; `TypeaheadItem.test.tsx`; `themingTargets.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Empty search; default item                        | A missing empty-state target fails; a rendered class absent from the documented targets fails. Evidence gap: no test asserts the `typeahead`, `typeahead-dropdown`, or `typeahead-item` placement.                                                         | `audit:Typeahead/theming`       |
| FR3, FR4, FR5       | `TypeaheadItem.test.tsx` "renders item.element raw in place of the label layout"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Default and caller content                        | `item.element` that keeps the default layout fails. Evidence gap: no test asserts the untargeted outer row, group heading, or selected state.                                                                                                              | `audit:Typeahead/theming`       |
| FR7                 | `Typeahead.test.tsx` disabledMessage cases, including "remains natively disabled when disabled without a reason" (asserting the current FR7 gap pending conformance); "disables input when isDisabled"                                                                                                                                                                                                                                                                                                                                                                            | Disabled with and without a reason                | A reason not linked from the input, an input that is not focusable with a reason, or typing or selecting while disabled fails.                                                                                                                             | `audit:Typeahead/accessibility` |
| FR8, ORD1, AR2, AR3 | `Typeahead.test.tsx` edit-mode and collapsed-input tab-order cases; "calls onChange with null when clear button is clicked"; "does not show clear button when hasClear is false"; "names the token button, the Tab stop while a value shows, by the field label and the value", "names the token button with a caller aria-labelledby as the input is named"                                                                                                                                                                                                                      | Token, edit, blur, clear; Tab order               | A Token that does not enter edit mode, an input left in the Tab order behind a Token, a composing Escape that leaves edit mode, a clear that does not send `null`, or a token button not named by the label and value fails.                               | `audit:Typeahead/behavior`      |
| FR9, AR1            | `Typeahead.fr10.test.tsx` props-type case; `Typeahead.test.tsx` "forwards DOM props and ref to the combobox input while preserving edit and blur behavior", "forwards DOM props and ref to the input inside InputGroup, with control* on the surface", consumer key-handler cases, caller aria-labelledby cases, and end-controls cases; "exposes the resolved required state on the combobox (FormLayout FR5, AR2)", "marks the combobox invalid for an error status only (WCAG 4.1.2)", "keeps a caller's own aria-invalid and aria-required when the field's own state is off" | Standalone and grouped; key handlers; caller name | A root styling prop, a dropped DOM prop or ref, a caller key handler that runs first or twice, a lost caller name, a missing `aria-required` or error `aria-invalid`, or end controls out of flow fails. Evidence gap: no test asserts the minimum height. | `audit:Typeahead/layout`        |
| PR1                 | Covered by `component:BaseTypeahead`'s rows; no test asserts the absence of Typeahead listeners (evidence gap)                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                 | —                                                                                                                                                                                                                                                          | `audit:Typeahead/behavior`      |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Canonical anatomy and targets                     | Missing, extra, prefixed, stale, or unclassified mappings fail repository validation.                                                                                                                                                                      | `audit:Typeahead/theming`       |

## Current-state impact

- **Disabled input (FR7).** A disabled Typeahead with no `disabledMessage` is
  natively `disabled` and leaves the Tab order, and one with a reason still runs
  caller click, pointer, and key handlers, against `spec:AST-085` FR1 and FR2.

## Decision log

No component-local decision.

## Open questions

- **OQ1 — Should the stable Result row, Result group heading, or Selected result
  state gain a public Typeahead target?** (`human-api`) Their current lack of
  reachability is not settled intent, and the outer-row/default-content
  asymmetry is recorded, not normalized.

## Content boundary

This file does not duplicate consumer prop tables, examples, search algorithms,
implementation steps, or shared layer and theming rules. It links to their owners.
