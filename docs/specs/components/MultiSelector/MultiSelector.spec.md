---
schema_version: 3
template_version: 7
kind: component
id: component:MultiSelector
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/MultiSelector/MultiSelector.test.tsx,
    packages/core/src/MultiSelector/MultiSelector.fr10.test.tsx,
    packages/core/src/MultiSelector/MultiSelector.focusableDisabled.test.tsx,
    packages/core/src/MultiSelector/CreateRow.a11y.chromium.spec.ts,
    packages/core/src/MultiSelector/OptionActions.a11y.chromium.spec.ts,
    packages/core/src/__tests__/BusyOwnerAnnouncement.test.tsx,
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
system_specs:
  [
    spec:AST-001,
    spec:AST-011/DEC-1,
    spec:AST-055,
    spec:AST-056,
    spec:AST-058,
    spec:AST-079/DEC-1,
    spec:AST-085,
    spec:AST-086,
    spec:AST-102,
  ]
---

# MultiSelector component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | None changes. MultiSelector takes `options`, controlled `value` and `onChange`, `changeAction`, display and format props, `hasSearch`, `hasSelectAll`, `hasCreate`, `isReadOnly`, `isDisabled` and `disabledMessage`, `isLoading`, `presentation`, `renderTrigger`, `handleRef`, `onOpenChange`, field props, and `container*` and `control*` styling. |
| Behavior                | A combobox trigger opens a listbox (or a grid once an option carries an action) in a pointer popup or a bottom sheet; options toggle without closing; search filters with announced counts; a create row can mint the typed query; read-only and disabled states stay focusable.                                                                       |
| End-user impact         | People pick several values by pointer or keyboard, search long lists, and hear counts and changes; disabled and read-only fields stay reachable and explain themselves. The field does not grow with a set text size.                                                                                                                                  |
| Builder impact          | Builders style the field through `container*` and `control*`, may render their own trigger, and receive creations through `onChange`.                                                                                                                                                                                                                  |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Loading read as no options, the zero-option popup, and the fixed field height are listed under Current-state impact.                                                                                                                                                                         |
| Review checks           | Reject a second panel tree per presentation, a lost target, an editable read-only field, native `disabled`, a caller handler reached while disabled, or a create row offered for an exact match.                                                                                                                                                       |
| Governing rules         | `family:input-fields`; `spec:AST-001` FR3, FR4, FR6; `spec:AST-011` DEC-1; `spec:AST-055`; `spec:AST-056`; `spec:AST-058`; `spec:AST-085`; `spec:AST-086`; `spec:AST-102` FR4; `architecture:component-theming-surface`.                                                                                                                               |

This table is a review projection; the body below is authoritative.

## Intent

MultiSelector renders a multi-selection control with an optional standalone Field
shell and one shared panel content tree in either an anchored pointer popup or a
touch-oriented BottomSheet. It also supports a read-only state that preserves and
submits the selected values without exposing that panel or an editing affordance.

## Compatibility and migration

- Released default preserved: yes
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: `value` is controlled; open state is the
  component's, driven by `handleRef` and reported by `onOpenChange`
- Migration decision: none; the removed `multi-selector-clear-icon` alias is
  replaced by the shared `input-clear-icon` target (FR6)

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The painted Trigger and its `multi-selector` target.
- Indicator icon, Search row, Option row, Section heading, Empty state, and
  Pointer popup presentation through the other six MultiSelector targets.
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

Complete prop syntax and examples remain in `MultiSelector.doc.mjs`.

| Concept         | Closed values or states         | Meaning                                                                                             | Availability                                                 | Default | Owner  | Stability | Invalid-value behavior                                        |
| --------------- | ------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------- | ------ | --------- | ------------------------------------------------------------- |
| read-only state | `false`, `true`                 | Preserves and submits values without selection affordance                                           | Closed trigger                                               | `false` | Caller | stable    | Boolean normalization                                         |
| anchored mode   | `renderTrigger` absent, present | Caller-rendered control replaces Field shell and Trigger; panel anchored to it and named by `label` | Pointer popup and Touch sheet                                | absent  | Caller | stable    | Render prop must return the control carrying the given props  |
| create row      | `hasCreate` `false`, `true`     | First row minting the typed query, reported through `onChange` as `{type: 'create', query}`         | Search mode, query matching no option label, not `isLoading` | `false` | Caller | stable    | Without `hasSearch`: development warning, nothing offered     |
| option action   | `action` absent, present        | The option's secondary control as one node; the popup is a grid of rows pairing option and action   | Pointer popup and Touch sheet                                | absent  | Caller | stable    | `null` is none; a control without a name warns in development |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Basis                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| FR1  | The current standalone presentation contains a Field and painted Trigger; the supported InputGroup path renders the same Trigger without a Field. Optional start content, clear action, status icon, or Indicator icon follows supplied props and state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source, docs, and tests                                           |
| FR2  | The shared panel content contains the optional Search row, zero or more Option rows, optional public Option dividers and Section headings, and an Empty state when the applicable result set is empty and the value is not loading. Option-source pending MUST be supplied independently and MUST NOT be inferred from input `isLoading` (`spec:AST-001` FR4), and with zero provided options and no pending state the field MUST be read-only with no selectable option, stating so without opening a popup (`spec:AST-001` FR3, FR6). Implementation gap: no explicit pending state exists; `isLoading` is read as options not yet arrived, so it withholds the Empty state, the create row (FR9), and search announcements (FR14); and a field with zero options keeps an actionable trigger that opens a listbox showing `emptyText`.                                                                                            | Current source, docs, and tests; `spec:AST-001` FR3, FR4, FR6             |
| FR3  | Trigger, Indicator icon, Search row, Option row, Section heading, Empty state, and Pointer popup carry the seven current non-deprecated MultiSelector targets documented in `MultiSelector.doc.mjs`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source, docs, and tests                                           |
| FR4  | When present, Field, shared clear actions, option checkbox indicators, public Option dividers, general icons, Touch sheet heading, and Touch sheet retain their Field, CheckboxInput, Divider, Icon, Text, and BottomSheet theming owners.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Current composition and owners                                            |
| FR5  | Pointer popup and Touch sheet are separate surface anatomy rows, but both host the same `panelContent` tree; the Touch sheet additionally renders its Heading. Changing presentation does not create a second search, option, divider, section, or empty-state content model.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source and tests                                                  |
| FR6  | Clear glyphs delegate exclusively to the shared `input-clear-icon` target; removed per-component aliases do not claim anatomy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current public target metadata                                            |
| FR7  | While `isReadOnly` is true, selected values remain focusable and form-submittable, while the selection surface, clear action, disclosure indicator, and every value-change path are unavailable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `spec:AST-011` DEC-1; current docs and tests                              |
| FR8  | With `renderTrigger`, the caller-rendered control receives `ref`, `id`, `onClick`, `onKeyDown`, `onFocus`, `aria-haspopup`, `aria-expanded`, `aria-controls`, and `aria-busy`; the panel is anchored to it, focus returns to it on close, the listbox is named by `label`, and on open the search input takes focus with `hasSearch`, and otherwise the listbox, which then owns the keyboard. No Field, status, clear action, spinner, or indicator renders. `handleRef` exposes `open`, `close`, `toggle`, `isOpen`; `onOpenChange` fires on every open and close.                                                                                                                                                                                                                                                                                                                                                                 | `spec:AST-055` FR1–FR7, AR1–AR4; DEC-1; current docs and tests            |
| FR9  | With `hasSearch` and `hasCreate`, while `isLoading` is not set, a `Create "<query>"` row leads the list when the trimmed query equals no option label under the search's own case-insensitive matching. Picking it, or Enter with nothing highlighted, calls `onChange` with the query appended to the value and a `{type: 'create', query}` descriptor, clears the search, and announces the creation; every other change passes no descriptor. The row has no checkbox, is never selected, is excluded from select-all and from `renderOption`, and is announced instead of the empty message when it is the only result. While `isLoading`, no row is offered and Enter commits nothing. `hasCreate` without `hasSearch` warns in development and offers nothing. Withholding the row while `isLoading` is the FR2 gap.                                                                                                           | Current behavior; `spec:AST-056` FR5 and DEC-3                            |
| FR10 | Once any declared option — at any depth of sections, before any query filters it — carries an `action`, the popup is a `role="grid"` and stays one while mounted; the trigger advertises `aria-haspopup="grid"` (the bottom sheet keeps `dialog`). Each option, the select-all row included, is a `role="row"` carrying the option's id, `aria-selected` and `aria-disabled`, with exactly two `gridcell` children: the option's content, then its action or an empty cell. A section is a `rowgroup` named by its title. Pressing the option cell toggles; pressing the action fires the caller's control and nothing else. Up/Down move rows onto the option cell; the inline-end arrow moves to the action cell and the inline-start arrow back, following visual direction under RTL; Enter on the action cell activates the control. `aria-activedescendant` names the row or the action cell. No action control is a tab stop. | `spec:AST-058` FR1–FR8, AR1–AR4                                           |
| FR11 | No surface renders native `disabled`. A disabled trigger keeps its tab stop with `aria-disabled`; no press opens it or reaches a caller or ancestor handler, and no key opens it or reaches a caller handler; it submits no value; a `disabledMessage` Tooltip is linked from the trigger through `aria-describedby`; and only `isDisabled` takes disabled paint. While busy (`isLoading` or a pending `changeAction`) the trigger shows a Spinner and `aria-busy`, keeps its ordinary paint, and announces each busy start once.                                                                                                                                                                                                                                                                                                                                                                                                    | `spec:AST-085` FR1–FR6; `spec:AST-086` FR8; `family:input-fields` FR4–FR6 |
| FR12 | ArrowDown on the focused trigger opens the list; ArrowDown and ArrowUp move the highlight; Home and End jump to the first and last option without search, while with search they move the caret and PageDown and PageUp jump the highlight; Enter toggles the highlighted option except during input-method composition; Escape closes; Tab closes and moves focus on, except that while a query shows the search's clear button, forward Tab moves to that button and keeps the list open; with `hasClear` and without `hasSearch`, Delete or Backspace on the focused, closed trigger clears every value when one is selected.                                                                                                                                                                                                                                                                                                     | Current source and tests                                                  |
| FR13 | The field has no root styling props: `control*` reaches the bordered control box around the trigger and `container*` the Field box (`family:input-fields` FR10); a press on the control box outside the trigger opens it; a caller `onClick` runs after the built-in toggle and a caller `onKeyDown` after the built-in keyboard model, and is skipped for keys that model handles and cancels; a caller `aria-describedby` joins the field description and a caller `aria-labelledby` follows the field's own name. With `renderTrigger`, `container*` and `control*` have no effect and warn. The trigger height is the shared element size for its size and MUST grow with a set text size (`spec:AST-102` FR4). Implementation gap: the height is fixed.                                                                                                                                                                         | `family:input-fields` FR10; `spec:AST-102` FR4; current tests             |
| FR14 | Each toggle, select-all, or clear announces politely: the all-selected message when every option ends selected, the cleared message when none does, and otherwise the selection count. Once a person searches, the match count (or the empty-results message, or the create row's label when it is the only result) is announced politely; no search result is announced while `isLoading` (the FR2 gap). With `htmlName` the field submits one entry per selected value.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `spec:AST-086`; current tests                                             |

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

- **ORD1 — Change.** Toggle, select-all, clear, or create → `onChange` (with a
  descriptor only for a creation) → `changeAction` with the optimistic value.

### Performance and resources

- **PR1 — Bounded resources.** The component adds no event listener or
  observer of its own; its timers are an animation frame that moves focus as
  the panel opens and the typeahead reset timeout. Announcements use the shared
  polite channel.

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
`label` instead of `aria-labelledby` the trigger, and on open the search input
(with `hasSearch`) or the listbox takes focus and owns arrow, Enter, Escape, and
typeahead keys while open, so an anchor that cannot take focus still leaves a
keyboard path.

The create row is a `role="option"`, or a `role="row"` with an empty action
cell in a grid (FR10), with `aria-selected="false"` and no checkbox indicator. When it is the only result, the polite live region announces its
label rather than the empty-search message, so what is announced matches what is
on screen; picking it announces the creation. The result count and the create
row's label come from the search's own replacing announcer, so a newer one
replaces one not yet spoken (`spec:AST-086` FR9), and selection messages keep
their own announcer.

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
| Empty state                   | Presents no-results content when a search leaves no rows; the no-options content is the FR2 gap.  | Current source and public docs | Prominent         | FR2, FR3           |
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

- `architecture:public-component-api` and `spec:AST-011/DEC-1` own the
  read-only API and its cross-input meaning.
- `spec:AST-055` owns the caller-rendered trigger (FR8).
- `spec:AST-001` owns option-source pending state (FR2).
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

| Contract            | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Representative states                                             | Mutation or failure expectation                                                                                                                                                                                                                                                                                        | Audit section                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| FR1, FR2            | `MultiSelector.test.tsx` render, labels, count, sections, list-structure, search-affordance, select-all, and empty-state cases; "keeps a standalone secondary trigger out of the group geometry"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Standalone and grouped; search; sections; select-all; empty       | A missing Field, trigger part, search row, option, divider, heading, or empty state fails; the no-options cases assert the current FR2 gap pending conformance. Evidence gap: no test asserts that the InputGroup path omits the Field.                                                                                | `audit:MultiSelector/anatomy`       |
| FR3, FR6            | `MultiSelector.test.tsx` theme-target cases (empty state, clear icon, indicator icon, disabled state, option row, popup); `themingTargets.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Every local target; shared clear glyph                            | A missing or moved target, or a clear glyph with a component alias, fails. Evidence gap: no test asserts the `multi-selector-search` or section-heading targets.                                                                                                                                                       | `audit:MultiSelector/theming`       |
| FR4                 | `MultiSelector.test.tsx` "routes the clear glyph through the shared clear button" and statusVariant cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Shared clear and status                                           | A clear or status that leaves its shared owner fails. Evidence gap: no test asserts the CheckboxInput, Divider, Text, and BottomSheet delegation beyond rendering.                                                                                                                                                     | `audit:MultiSelector/theming`       |
| FR5                 | `MultiSelector.test.tsx` "uses a bottom sheet and stays open while toggling options", "uses a bottom sheet for adaptive presentation on compact touch", "moves keyboard focus into a bottom-sheet listbox"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Popover and sheet                                                 | A sheet that closes on a toggle or lacks the listbox fails. Evidence gap: no test asserts that both presentations host one panel tree.                                                                                                                                                                                 | `audit:MultiSelector/behavior`      |
| FR7                 | `MultiSelector.test.tsx` isReadOnly cases; "a read-only selector advertises no panel on the caller's control"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Read-only with loading; pointer, keyboard, typeahead              | A read-only field that opens or changes fails. Evidence gap: no test asserts read-only form submission or `aria-readonly`.                                                                                                                                                                                             | `audit:MultiSelector/behavior`      |
| FR8                 | `MultiSelector.test.tsx` trigger render prop, read-only, and focus-return cases; `MultiSelector.fr10.test.tsx` renderTrigger cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Caller control closed and open; handle; disabled; focus return    | A caller control that does not open the panel, name the listbox, or get focus back, or a handle that opens a disabled selector, fails.                                                                                                                                                                                 | `audit:MultiSelector/behavior`      |
| FR9                 | `MultiSelector.test.tsx` hasCreate cases; `CreateRow.a11y.chromium.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Create offered, committed, skipped, absent while loading; warning | A create row for an exact match, while loading, or without search, or a creation without its descriptor, fails.                                                                                                                                                                                                        | `audit:MultiSelector/behavior`      |
| FR10                | `MultiSelector.test.tsx` option-actions (grid), ring-under-mixed-input, and create-row-in-grid cases; `OptionActions.a11y.chromium.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Listbox and grid; RTL; search; hover; Tab                         | A grid without actions, a listbox with them, a wrong cell activation, reversed RTL arrows, or an action control as a tab stop fails.                                                                                                                                                                                   | `audit:MultiSelector/accessibility` |
| FR11                | `MultiSelector.focusableDisabled.test.tsx` cases; `MultiSelector.test.tsx` disabledMessage cases, "trigger keeps its tab stop when disabled (spec:AST-085 FR1)", "shows no disabled focus ring after a pointer pick (spec:AST-085 FR6)", "shows loading state with a spinner and aria-busy", "is excluded from form data when disabled"; `BusyOwnerAnnouncement.test.tsx` MultiSelector cases                                                                                                                                                                                                                                                                                                         | Disabled with and without a reason; loading; pending Action       | Native `disabled`, an open or caller handler while disabled, a value submitted while disabled, an unlinked reason, or a missing busy announcement fails. Evidence gap: no test asserts the busy-only paint.                                                                                                            | `audit:MultiSelector/accessibility` |
| FR12                | `MultiSelector.test.tsx` keyboard cases ("supports keyboard navigation with ArrowDown/ArrowUp", "End/Home jump the highlight to the last/first option (non-search)", "PageDown/PageUp jump the highlight to the last/first filtered option", "Home/End move the search caret, not the option highlight", "toggles item with Enter key", "does not toggle the highlighted option on a composing Enter (IME)", "closes on Escape", "closes combobox on Tab and moves focus to next element", "opens the listbox with ArrowDown from a focused trigger", the Delete and Backspace clear cases), and "tabs from the search input to the clear button (keeping the popup open) when a query is showing it" | Current source and tests                                          | A key that does the wrong move, a composing Enter that toggles, or a clear with nothing selected fails.                                                                                                                                                                                                                | `audit:MultiSelector/accessibility` |
| FR13                | `MultiSelector.fr10.test.tsx` cases; `MultiSelector.test.tsx` caller aria-labelledby cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Control box; caller handlers; renderTrigger                       | A root styling prop, `control*` off the control box, a caller handler before the built-in one, or a lost caller name or description fails. Evidence gap: no test asserts that a caller `onKeyDown` is skipped for a key the built-in model cancels, or the trigger height or its growth with text size (the FR13 gap). | `audit:MultiSelector/layout`        |
| FR14, ORD1          | `MultiSelector.test.tsx` announcements, result-announcement, count-text, and form-participation cases; hasCreate announcement cases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Toggle, select-all, clear; search counts; loading; form           | A missing or wrong announcement, a search-result announcement while loading, or a wrong form entry fails. Evidence gap: no test asserts the `onChange`-before-`changeAction` order.                                                                                                                                    | `audit:MultiSelector/behavior`      |
| PR1                 | Evidence gap: no test asserts the absence of listeners or the timer bounds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                 | —                                                                                                                                                                                                                                                                                                                      | `audit:MultiSelector/behavior`      |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Canonical anatomy and targets                                     | Missing, extra, prefixed, stale, or alias-backed mappings fail repository validation.                                                                                                                                                                                                                                  | `audit:MultiSelector/theming`       |

## Current-state impact

- **Loading read as no options (FR2).** `isLoading` withholds the Empty state,
  the create row, and search announcements, so a person searching while the
  field reports loading sees and hears nothing, against `spec:AST-001` FR4.
- **Zero options (FR2).** A field with no options keeps an actionable trigger
  that opens a "No options" list instead of a read-only no-choice state,
  against `spec:AST-001` FR3 and FR6.
- **Fixed field height (FR13).** The trigger holds the shared element height
  instead of growing with a set text size, against `spec:AST-102` FR4.

## Decision log

- **DEC-1 — Anchored mode opens through `handleRef`, not a controlled
  `isOpen`.** The caller-rendered trigger itself follows `spec:AST-055`. The
  component keeps owning open state, and `handleRef`/`onOpenChange` open it from
  a keystroke elsewhere and report every change — the rule already written on
  `ComplexSelectorHandle`. Rejected: an `anchorRef` plus controlled `isOpen`,
  which mirrors open state in the parent and reintroduces the focus pitfalls
  that rule names.

  **Decider:** `cixzhang`, 2026-10-03

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, search or selection
algorithms, implementation steps, or shared layer and theming rules. It links to
their owners.
