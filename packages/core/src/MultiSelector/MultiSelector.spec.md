---
schema_version: 3
template_version: 3
kind: component
id: component:MultiSelector
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/MultiSelector/MultiSelector.test.tsx,
    packages/core/src/BottomSheet/BottomSheet.test.tsx,
    packages/core/src/CheckboxInput/CheckboxInput.test.tsx,
    packages/core/src/Divider/Divider.test.tsx,
    packages/core/src/Field/Field.test.tsx,
    packages/core/src/Icon/Icon.test.tsx,
    packages/core/src/Text/Text.test.tsx,
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
system_specs: [spec:AST-011/DEC-1, spec:AST-079/DEC-1]
---

# MultiSelector component contract

## Intent

MultiSelector renders a multi-selection control with an optional standalone Field
shell and one shared panel content tree in either an anchored pointer popup or a
touch-oriented BottomSheet. It also supports a read-only state that preserves and
submits the selected values without exposing that panel or an editing affordance.
This draft records current consumer anatomy, theming ownership, and read-only
behavior.

## Compatibility and migration

- Released default preserved: `yes`
- `isReadOnly` is additive and defaults to `false`. It preserves selected values,
  focus, and form participation while removing selection-surface and editing
  affordances. `isDisabled` takes precedence when both are set.
- Existing DOM, styling, targets, and public API remain unchanged when the prop is
  omitted.
- `renderTrigger`, `handleRef`, and `onOpenChange` are additive and absent by
  default. When omitted, DOM, styling, targets, keyboard behavior, and public
  API remain unchanged. With `renderTrigger`, the caller-rendered control replaces
  the Field shell and Trigger by the caller's choice, not as a change to the
  released default.
- `hasCreate` is additive and off by default. `onChange` gains an optional
  second argument, a `MultiSelectorChange` descriptor, passed only for a
  creation; a one-argument handler keeps working. When `hasCreate` is omitted,
  DOM, styling, targets, keyboard behavior, announcements, and the callback's
  calls are unchanged.
- Controlled/uncontrolled behavior: unchanged. Open state stays owned by the
  component; `handleRef` drives it and `onOpenChange` reports it.
- 0.7.0 removes the `multi-selector-clear-icon` alias; the shared clear glyph
  remains available through `input-clear-icon`.
- Migration decision: replace the removed theme key and CSS class with
  `input-clear-icon` and `.astryx-input-clear-icon`, or run
  `astryx upgrade --from 0.6.3 --apply --path .`

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The painted Trigger and its current `multi-selector` target.
- Indicator icon, Search row, Option row, Section heading, Empty state, and
  Pointer popup presentation through the other six current MultiSelector targets.
- One shared panel-content tree containing optional search, option, divider,
  section, and empty-state content regardless of which presentation hosts it.

**Does not own / non-goals**

- Standalone field-shell presentation — rendered by Field and themed through
  Field's current `field` target; omitted when MultiSelector is inside InputGroup.
- Shared clear actions — rendered by Field's InputClearButton and themed through
  Field's current `input-clear-button` target.
- Option checkbox presentation — rendered by CheckboxInput and themed through
  CheckboxInput's current `checkbox-indicator` target.
- Public option dividers — rendered by Divider and themed through Divider's
  current `divider` target.
- General Icon presentation for start, search, and status icons — rendered by
  Icon and themed through Icon's current `icon` target.
- The Touch sheet heading — rendered by Heading and themed through Text's current
  `heading` target.
- The Touch sheet panel — rendered by BottomSheet and themed through
  BottomSheet's current `bottom-sheet` target.
- Arbitrary ReactNode start content supplied by the caller.
- Shared layer lifecycle, positioning, and dismissal behavior.

## Public concepts

This table names the additive concept introduced by `spec:AST-011`. Complete prop
syntax and examples remain in `MultiSelector.doc.mjs`.

| Concept         | Closed values or states         | Meaning                                                                                             | Availability                                                | Default | Owner  | Stability | Invalid-value behavior                                       |
| --------------- | ------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------- | ------ | --------- | ------------------------------------------------------------ |
| read-only state | `false`, `true`                 | Preserves and submits values without selection affordance                                           | Closed trigger                                              | `false` | Caller | additive  | Boolean normalization                                        |
| anchored mode   | `renderTrigger` absent, present | Caller-rendered control replaces Field shell and Trigger; panel anchored to it and named by `label` | Pointer popup and Touch sheet                               | absent  | Caller | additive  | Render prop must return the control carrying the given props |
| create row      | `hasCreate` `false`, `true`     | First row minting the typed query, reported through `onChange` as `{type: 'create', query}`         | Search mode, query matching no option label, options loaded | `false` | Caller | additive  | Without `hasSearch`: development warning, nothing offered    |

## Behavioral and layout contract

| ID            | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Basis                                                                                             | Draft review state                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| FR1           | The current standalone presentation contains a Field and painted Trigger; the supported InputGroup path renders the same Trigger without a Field. Optional start content, clear action, status icon, or Indicator icon follows supplied props and state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source, docs, and tests                                                                   | Verified current behavior; no new behavior decided |
| FR2           | The shared panel content contains the optional Search row, zero or more Option rows, optional public Option dividers and Section headings, and an Empty state when the applicable result set is empty and the value is not loading.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Current source, docs, and tests                                                                   | Verified current behavior; no new behavior decided |
| FR3           | Trigger, Indicator icon, Search row, Option row, Section heading, Empty state, and Pointer popup carry the seven current non-deprecated MultiSelector targets documented in `MultiSelector.doc.mjs`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Current source, docs, and tests                                                                   | Verified current behavior; no target change        |
| FR4           | When present, Field, shared clear actions, option checkbox indicators, public Option dividers, general icons, Touch sheet heading, and Touch sheet retain their Field, CheckboxInput, Divider, Icon, Text, and BottomSheet theming owners.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current composition and owners                                                                    | Verified current behavior; no target change        |
| FR5           | Pointer popup and Touch sheet are separate surface anatomy rows, but both host the same `panelContent` tree; the Touch sheet additionally renders its Heading. Changing presentation does not create a second search, option, divider, section, or empty-state content model.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests                                                                          | Verified current behavior; no normalization        |
| FR6           | Clear glyphs delegate exclusively to the shared `input-clear-icon` target; removed per-component aliases do not claim anatomy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current public target metadata                                                                    | Verified canonical ownership                       |
| FR7           | While `isReadOnly` is true, selected values remain focusable and form-submittable, while the selection surface, clear action, disclosure indicator, and every value-change path are unavailable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `spec:AST-011`, docs, and tests                                                                   | Accepted read-only behavior                        |
| FR8           | With `renderTrigger`, the caller-rendered control receives `ref`, `id`, `onClick`, `onKeyDown`, `onFocus`, `aria-haspopup`, `aria-expanded`, `aria-controls`, and `aria-busy`; the panel is anchored to it, focus returns to it on close, the listbox is named by `label`, and the listbox takes focus and owns the keyboard on open. No Field, status, clear action, spinner, or indicator renders. `handleRef` exposes `open`, `close`, `toggle`, `isOpen`; `onOpenChange` fires on every open and close.                                                                                                                                                                                                                                                                                                                                                                                                                                    | DEC-1, docs, and tests                                                                            | Proposed; awaiting owner approval                  |
| FR9           | With `hasSearch` and `hasCreate`, once options have loaded, a `Create "<query>"` row leads the list when the trimmed query equals no option label under the search's own case-insensitive matching. Picking it, or Enter with nothing highlighted, calls `onChange` with the query appended to the value and a `{type: 'create', query}` descriptor, clears the search, and announces the creation; every other change passes no descriptor. The row has no checkbox, is never selected, is excluded from select-all and from `renderOption`, and is announced instead of the empty message when it is the only result. While `isLoading`, no row is offered and Enter commits nothing. `hasCreate` without `hasSearch` warns in development and offers nothing.                                                                                                                                                                               | `spec:AST-056` FR5 / DEC-3, `component:Tokenizer` `hasCreate`, docs, and tests                    | Proposed; awaiting owner approval                  |
| option action | `action` absent, present                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The option's secondary control as one node; the popup is a grid of rows pairing option and action | Pointer popup and Touch sheet                      | absent | Caller | additive | `null` is none; a control without a name warns in development |
| FR10          | Once any declared option — at any depth of sections, before any query filters it — carries an `action`, the popup is a `role="grid"` and stays one while mounted; the trigger advertises `aria-haspopup="grid"` (the bottom sheet keeps `dialog`). Each option, the select-all row included, is a `role="row"` carrying the option's id, `aria-selected` and `aria-disabled`, with exactly two `gridcell` children: the option's content, then its action or an empty cell. A section is a `rowgroup` named by its title. Pressing the option cell toggles; pressing the action fires the caller's control and nothing else. Up/Down move rows onto the option cell; the inline-end arrow moves to the action cell and the inline-start arrow back, following visual direction under RTL; Enter on the action cell activates the control. `aria-activedescendant` names the row or the action cell. No control inside the popup is a tab stop. | `spec:AST-058` FR1–FR8, AR1–AR4                                                                   | Proposed; awaiting owner approval                  |

### Allowed variation

- Standalone MultiSelector renders Field; the supported InputGroup path omits it.
- `presentation="popover"` uses the Pointer popup; `presentation="bottom-sheet"`
  uses the Touch sheet and its Heading; `presentation="adaptive"` selects between
  those existing branches from current modality and viewport behavior.
- Search row, Option divider, Section heading, Empty state, select-all Option row,
  and both clear actions are optional under their documented prop and data conditions.
- Semantic names and icon component types render through Icon. Arbitrary ReactNode
  start content renders directly and stays caller-owned.
- Trigger text, labels, badges, and custom option content may vary inside the
  Trigger or Option row without creating another MultiSelector target.

### Representative states

| State                                  | Required invariant                                                                                          | Allowed variation                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Standalone or InputGroup               | Field is present only standalone; Trigger anatomy and targets remain the same in both paths.                | InputGroup owns grouped layout and labeling support.                     |
| Pointer presentation                   | Pointer popup carries `multi-selector-popup` and hosts the shared panel content.                            | Search, groups, options, and empty content follow their ordinary states. |
| Touch presentation                     | BottomSheet owns the Sheet panel, Text owns its Heading, and the sheet hosts the same shared panel content. | Adaptive or explicit selection may choose this branch.                   |
| Search enabled with a query            | Search row owns `multi-selector-search`; its icons/actions keep their shared owners.                        | Results may be flat, grouped, or empty.                                  |
| Option, select all, selected, disabled | Option row owns `multi-selector-option` and reflects its current size/state metadata.                       | Checkbox state and custom row content vary independently.                |
| Attached or tooltip status             | Status icon replaces the Indicator icon.                                                                    | Tooltip status wraps the icon in a button without changing Icon owner.   |
| Read-only                              | Values stay focusable and submittable; panel, clear, and disclosure affordances are absent.                 | Trigger display, status, and busy presentation remain available.         |

### Transformation and precedence order

- No new search, selection, presentation, or styling precedence rule is introduced.

### Performance and resources

- No new performance or resource rule is introduced.

## Accessibility contract

Existing field, combobox, listbox, checkbox, live-region, focus, and dismissal
behavior remains unchanged when editable. A read-only value stays focusable,
retains `role="combobox"`, and exposes `aria-readonly="true"` plus
`aria-expanded="false"`. Its rendered content remains the combobox value. It does
not expose `aria-controls`, `aria-activedescendant`, or an active selection
surface. The implicit listbox popup describes the widget's selection capability;
read-only state communicates that its values cannot currently change. Chromium's
button-hosted combobox mapping omits the ARIA read-only property, so a localized
accessible description also announces that state. Search and non-search modes use
the same read-only combobox semantics because neither exposes a search control in
this state.

With `renderTrigger`, the caller's control carries `aria-haspopup`, `aria-expanded`,
and `aria-controls` for the listbox, the listbox carries `aria-label` from
`label` instead of `aria-labelledby` the trigger, and the listbox is the
focused element that owns arrow, Enter, Escape, and typeahead keys while open,
so an anchor that cannot take focus still leaves a keyboard path.

The create row is a `role="option"` with `aria-selected="false"` and no checkbox
indicator. When it is the only result, the polite live region announces its
label rather than the empty-search message, so what is announced matches what is
on screen; picking it announces the creation. The result count and the create
row's label come from the search's own `useAnnounce({hasReplace: true})`
instance, so a newer one replaces one not yet spoken (`spec:AST-086` FR9), and
selection messages keep their own instance.

## Design relationships

| Anatomy or state              | Design requirement                                                                                | Representation authority       | Hierarchy role    | Component contract |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------- | ------------------ |
| Field                         | Provides the label and optional supporting content outside InputGroup; omitted inside InputGroup. | Field component                | Supporting        | FR1, FR4           |
| Trigger                       | Presents the current selection or placeholder and opens the active presentation.                  | Current source and public docs | Prominent         | FR1, FR3           |
| Icon-rendered start icon      | Presents a semantic or component icon through Icon.                                               | Icon component                 | Supporting        | FR1, FR4           |
| Caller-rendered start content | Presents arbitrary caller content directly in the trigger's start slot.                           | Caller-supplied content        | Context-dependent | FR1                |
| Trigger clear button          | Removes every selected value through the shared field clear action.                               | Field component                | Supporting        | FR1, FR4           |
| Status icon                   | Presents attached or tooltip validation state through Icon.                                       | Icon component                 | Supporting        | FR1, FR4           |
| Indicator icon                | Presents disclosure state when status presentation does not replace it.                           | Current source and public docs | Supporting        | FR1, FR3           |
| Search row                    | Provides query entry at the top of the shared panel content.                                      | Current source and public docs | Supporting        | FR2, FR3, FR5      |
| Search icon                   | Presents the search affordance through Icon.                                                      | Icon component                 | Supporting        | FR2, FR4           |
| Search clear button           | Clears a present query through the shared field clear action.                                     | Field component                | Supporting        | FR2, FR4           |
| Option row                    | Presents one option or the select-all choice and owns row interaction/state.                      | Current source and public docs | Prominent         | FR2, FR3           |
| Option checkbox indicator     | Presents the option's selected, unselected, or indeterminate state through CheckboxInput.         | CheckboxInput component        | Supporting        | FR2, FR4           |
| Option divider                | Separates adjacent groups when a public divider entry is present in the options data.             | Divider component              | Supporting        | FR2, FR4           |
| Section heading               | Labels a visible group of option rows.                                                            | Current source and public docs | Supporting        | FR2, FR3           |
| Empty state                   | Presents no-options or no-results content when the panel has no selectable rows to show.          | Current source and public docs | Prominent         | FR2, FR3           |
| Pointer popup                 | Paints the anchored pointer surface around the shared panel content.                              | Current source and public docs | Prominent         | FR3, FR5           |
| Touch sheet heading           | Names the bottom-sheet presentation above the shared panel content.                               | Text component                 | Prominent         | FR4, FR5           |
| Touch sheet                   | Paints the BottomSheet surface around the same shared panel content.                              | BottomSheet component          | Prominent         | FR4, FR5           |

The seven current MultiSelector targets remain on their shipped visible elements.
Nested shared primitives keep their own owners. The Pointer popup and Touch sheet
are intentionally separate rows because they use different surface owners; the
Touch sheet adds a Heading owned by Text. Search, option, divider, section, and
empty-state content remains one shared tree.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Field": {"delegatesTo": {"owner": "component:Field", "target": "field"}},
  "Trigger": {"target": "multi-selector"},
  "Icon-rendered start icon": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Caller-rendered start content": {
    "none": {
      "reason": "intentional: Arbitrary ReactNode content is caller-owned and receives no MultiSelector target."
    }
  },
  "Trigger clear button": {
    "delegatesTo": {
      "owner": "component:Field",
      "target": "input-clear-button"
    }
  },
  "Status icon": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Indicator icon": {"target": "multi-selector-indicator-icon"},
  "Search row": {"target": "multi-selector-search"},
  "Search icon": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Search clear button": {
    "delegatesTo": {
      "owner": "component:Field",
      "target": "input-clear-button"
    }
  },
  "Option row": {"target": "multi-selector-option"},
  "Option checkbox indicator": {
    "delegatesTo": {
      "owner": "component:CheckboxInput",
      "target": "checkbox-indicator"
    }
  },
  "Option divider": {
    "delegatesTo": {"owner": "component:Divider", "target": "divider"}
  },
  "Section heading": {"target": "multi-selector-section-heading"},
  "Empty state": {"target": "multi-selector-empty-state"},
  "Pointer popup": {"target": "multi-selector-popup"},
  "Touch sheet heading": {
    "delegatesTo": {"owner": "component:Text", "target": "heading"}
  },
  "Touch sheet": {
    "delegatesTo": {
      "owner": "component:BottomSheet",
      "target": "bottom-sheet"
    }
  }
}
```

## Family and system relationships

- `architecture:public-component-api` and `spec:AST-011/DEC-1` own the additive
  read-only API and its cross-input meaning.
- `architecture:component-theming-surface` owns anatomy qualification, local
  target mapping, delegation, and exclusion of removed aliases.
- `architecture:layer-runtime` owns the current Popover host and the distinction
  between browser popover and native-dialog sheet presentation.
- `family:overlay-dismissal` owns shared Escape and platform-close ordering. The
  Pointer popup participates through its composed Popover owner; the Touch sheet
  inherits BottomSheet's current local-only adoption gap.
- Field, CheckboxInput, Divider, Icon, Text, and BottomSheet retain ownership of
  their delegated targets and presentation.

## Verification map

| Contract            | Verification                                                                                                                             | Representative states                                                                                                                                                                                                                              | Mutation or failure expectation                                                                                                                                                                                                                                                | Audit section                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| FR1, FR2            | `MultiSelector.test.tsx` render, search, divider, grouping, status, select-all, and empty-state suites plus InputGroup source inspection | Standalone/InputGroup, search, divided, selected, empty, status                                                                                                                                                                                    | Removing a documented part or misreporting Field presence conflicts with existing structure, content assertions, or source.                                                                                                                                                    | `audit:MultiSelector/anatomy`       |
| FR3, FR6            | Component target suites, source inspection, and public target inventory                                                                  | All seven canonical local targets and shared clear-icon delegation                                                                                                                                                                                 | A current target is missed, invented, moved, or the clear glyph stops delegating to `input-clear-icon`.                                                                                                                                                                        | `audit:MultiSelector/theming`       |
| FR4                 | Composed owner source/tests for Field, CheckboxInput, Divider, Icon, Text, and BottomSheet                                               | Field omission/presence, clear actions, checkbox, divider, icons, heading, sheet                                                                                                                                                                   | A shared part gains the wrong local owner or its documented owner no longer renders it.                                                                                                                                                                                        | `audit:MultiSelector/theming`       |
| FR5                 | `MultiSelector.test.tsx` presentation suites and `panelContent` source inspection                                                        | Explicit popover, explicit sheet, adaptive touch                                                                                                                                                                                                   | A presentation stops using its owner or receives a divergent panel-content implementation.                                                                                                                                                                                     | `audit:MultiSelector/overlay`       |
| FR7                 | read-only interaction, form, ARIA, and theme-state tests                                                                                 | search/non-search, clearable, open→read-only, disabled precedence                                                                                                                                                                                  | A value changes, popup or edit affordance remains, form value disappears, or read-only semantics are absent.                                                                                                                                                                   | `audit:MultiSelector/accessibility` |
| FR8                 | `MultiSelector.test.tsx` "trigger render prop" suite                                                                                     | External trigger closed/open; handle open/close; disabled; listbox focus                                                                                                                                                                           | Field chrome renders with a trigger, the control lacks disclosure state, the listbox is unnamed, or the handle opens a disabled selector.                                                                                                                                      | `audit:MultiSelector/accessibility` |
| FR9                 | `MultiSelector.test.tsx` "hasCreate" suite; `CreateRow.a11y.chromium.spec.ts` appear/disappear cycle                                     | Create row offered, committed by click/Enter with descriptor, skipped on a case-insensitive exact match, offered for a label the filter cannot surface, absent while loading, beside select-all; toggle without descriptor; warning without search | The row appears while loading or for an existing label, reports without a descriptor, keeps the search text, is silently inert without search, or the live region says "no results" beside a create row.                                                                       | `audit:MultiSelector/accessibility` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                            | Canonical anatomy and current local targets                                                                                                                                                                                                        | Missing, extra, prefixed, stale, or multiply assigned mappings fail repository validation.                                                                                                                                                                                     | `audit:MultiSelector/theming`       |
| FR10                | `MultiSelector.test.tsx` "option actions (grid)" suite; `OptionActions.a11y.chromium.spec.ts`; `Selector.test.tsx` non-adoption case     | No action; `action: null`; action inside a section; filtered out; removed later; options after loading; click cell vs action; disabled option with action; arrows LTR/RTL; search Left/Right; hover; Tab; unnamed control                          | A grid with no declared action, a listbox with one, a role that follows the filtered view, a row with other than two cells, a `group` in a grid, a toggle on an action press, an action unreachable by arrow, a tab stop inside the popup, or an action absent at rest, fails. | `audit:MultiSelector/accessibility` |

Existing component tests directly assert the Trigger, Indicator icon, Search row,
Option row, Section heading, Empty state, and Pointer popup targets. Presentation
tests directly distinguish the Popover and BottomSheet branches. Source inspection
distinguishes standalone Field presence from InputGroup omission and confirms that both surface branches receive the same `panelContent`, while the touch branch
adds Heading; Divider, Text, BottomSheet, and other shared primitive tests provide
owner evidence rather than new MultiSelector targets.

## Decision log

- **DEC-1 — Anchored mode through `renderTrigger` + `handleRef`, not a controlled
  `isOpen`.** A picker anchored in a row the caller owns (a link row whose
  opener is a presentational glyph) cannot host the Field shell or a nested
  button. The caller renders the control and spreads the given props; the
  component keeps owning open state, and `handleRef`/`onOpenChange` open it
  from a keystroke elsewhere and report every change — the rule already written
  on `ComplexSelectorHandle`. Rejected: an `anchorRef` plus controlled
  `isOpen`, which mirrors open state in the parent and reintroduces the focus
  pitfalls that rule names.

  **Decider:** `cixzhang`, 2026-10-03

- **DEC-2 — The create row is one switch reporting through `onChange`.** The
  row exists only while a query does, so it is enabled by `hasCreate` alone
  and reported on the channel the caller already listens to, with a
  descriptor naming the creation and the typed text already in the value, so
  adding the option and accepting the value are one update (`spec:AST-056`
  DEC-3; the shape `Tokenizer` ships). The duplicate rule is the search's own
  matching rule at full equality: a label the filter shows as an exact match
  is never offered for creation, and one the filter cannot surface for the
  query is never a dead end. Nothing is offered while options are loading,
  because a label a moment from arriving is not new. Rejected: a `hasCreate` +
  `onCreate` pair (three silently inert half-configurations); offering the
  row while loading (mints duplicates); a diacritic-folding duplicate rule
  beside a case-only filter (hides `Café` from `CAFE` and refuses to create
  it — the two rules widen together under `spec:AST-056` FR4 or not at all).

  **Decider:** pending owner review

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, search or selection
algorithms, implementation steps, or shared layer and theming rules. It links to
their owners.
