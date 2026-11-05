---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-058
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-03
phase: accepted
owners: [cixzhang]
affects_architecture:
  [architecture:public-component-api, architecture:interaction-modality]
affects_families: [family:input-fields]
affects_contributing: [contributing:api-conventions]
affects_consumer_docs:
  [Selector, MultiSelector, Typeahead, BaseTypeahead, Tokenizer]
review_triggers: [public-api, accessibility, behavior]
---

# Secondary action beside a picker option system spec

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "public-api": ["FR1", "FR2", "FR9", "DEC-1", "DEC-4", "DEC-5"],
    "accessibility": ["AR1", "AR2", "AR3", "AR4", "DEC-2", "DEC-3"],
    "behavior": ["FR3", "FR4", "FR5", "FR6", "FR7", "FR8"]
  }
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | An option carries its secondary control as a node: `action?: ReactNode`, one key with one type on both option vocabularies a popup panel renders from — `SelectorOptionData` and `SearchableItem` (FR1, DEC-1, DEC-4). The caller renders the control; the host places it in a grid cell and does nothing else to it.                                                                                                                                                                                                   |
| Behavior                | A popup whose options carry no action is the listbox it is today. Once any declared option carries one, the popup is a grid: each option is a row with two cells, the option and its action (FR2, FR3, DEC-2, DEC-3). Up/Down move rows; the inline-end arrow reaches the action; Enter activates it; pointer and touch press it directly (FR4, FR5). Activating an action never changes the selection (FR4). The action is always visible (FR8).                                                                       |
| End-user impact         | A person picking a label can also edit it from the same panel, with a mouse, a finger, a keyboard, or a screen reader, and pressing Edit never also toggles the label. Today the only place a product can put that control fires the option too and is invalid for assistive technology.                                                                                                                                                                                                                                |
| Builder impact          | One optional key on the option object holding the caller's own control — an `IconButton`, a `Button`, a menu trigger, anything with an accessible name. No new type, no render prop, no guard code for rows without one. Nothing changes for a caller who declares none.                                                                                                                                                                                                                                                |
| Compatibility/readiness | Additive. Every current picker renders exactly as before; the grid exists only when a caller declares an action (DEC-5). Authority: `draft`, `approved_by` `null`. No owner questions are open.                                                                                                                                                                                                                                                                                                                         |
| Review checks           | Reject a control rendered inside `role="option"`; a `role="none"` or `role="group"` wrapper standing between a listbox and a control; a host that inspects, clones, or wraps the `action` node; a host-owned type or component for an action; an array-typed `action`; a popup whose role follows the filtered view rather than the declared options; a row with any number of cells other than two; an action reachable only by pointer; a Tab stop added inside the popup; a hover-revealed or swipe-revealed action. |
| Governing rules         | [`spec:AST-002`](../AST-002/spec.md) FR1, FR4, FR15, FR16, `DEC-1`, `DEC-6`; [`architecture:public-component-api`](../../architecture/public-component-api.md) INV1, INV2, INV3, INV9; [`architecture:interaction-modality`](../../architecture/interaction-modality.md) INV4, INV7; [`spec:AST-056`](../AST-056/spec.md) AR1 for the empty state's announcement; `component:DropdownMenu` for the item-data vocabulary this record reuses.                                                                             |

This table is a review projection; the body below is authoritative.

## Intent

A picker's combobox opens a popup panel of options. Sometimes an option in
that open panel carries a second verb beside its first: a saved label that can be edited, a saved search that can be
renamed, a recent value that can be removed. The person needs to press that
control without also picking the option, and a screen-reader user needs to
know it exists and reach it.

Astryx's pickers cannot host it. Every option slot renders inside the
option's click target, so a control placed there fires and toggles at once,
and `role="listbox"` permits only `option` and `group` children, so the
control is invalid wherever it lands. Builders drop the verb or rebuild the
list.

This record owns one answer: **an option carries its action as one node the
caller renders, and a popup panel holding any such option is a grid whose
rows pair the option with its action.** The action lives beside the option
inside the open popup; nothing here touches the collapsed trigger, whose
own controls (clear, chevron, status) keep their current contracts. The combobox contract is kept, the keyboard path exists without a
second surface, and no caller writes guard code for rows that have none.

## Ownership boundary

**Owns**

- That an option's secondary control is carried on the option as one node
  the caller renders, and the name and type of that key across every option
  vocabulary a popup panel renders from.
- That a popup holding an option with an action is a grid, how its rows are
  shaped, and when the popup switches.
- How a pointer, a finger, a keyboard, and assistive technology reach an
  action, and that reaching it never changes the selection.
- The accessibility floor the arrangement keeps: a valid tree, a named
  control, one tab stop, no hover-only path.
- Which components adopt, and how a host that renders the vocabulary without
  adopting behaves.

**Why no existing record can hold it**

- `spec:AST-057` owns a touch gesture that
  accelerates verbs a host already shows. Its FR9 and DEC-4 keep `Item`
  unchanged and exclude `option` rows from its `reveal` model by their own
  text. This record is the always-visible control in a selection widget —
  the surface AST-057 presumes exists and does not define.
- `component:Selector` is `current` and `component:MultiSelector` is
  `draft`; `SelectorOptionData` is one type shared by both, and a key on it
  belongs to neither alone (`architecture:knowledge-contracts` INV2).
  `component:MultiSelector`'s draft claim about a per-row action (its FR9 /
  DEC-2) is withdrawn in favour of this record.
- `component:BaseTypeahead`, `component:Typeahead`, and
  `component:Tokenizer` are `draft` and render from `SearchableItem`, a
  second vocabulary. One rule binding two vocabularies across five components
  is a system fact, not a component fact.
- [`spec:AST-056`](../AST-056/spec.md) is `current` and owns the vocabulary
  of a typed query's states. It governs the same panels and is read here —
  the empty state's announcement (AR1) and the create row (DEC-3) share the
  panel — but a secondary control is not a search state, and a `current`
  record cannot carry unapproved claims (`architecture:knowledge-contracts`
  INV1, INV14).
- [`architecture:public-component-api`](../../architecture/public-component-api.md)
  holds the shared naming grammar and links its rulings through
  `deciding_specs`; a new cross-component ruling belongs in a spec it links.
- [`family:input-fields`](../../families/input-fields.md) owns field chrome.
  `BaseTypeahead` is not a member, and the panel is not chrome.

## Non-goals

- **Movement among several controls inside one cell.** The cell holds one
  node (FR1, DEC-3), so no rule for walking focus inside it is needed. A
  caller with several verbs puts a menu trigger in the node; the popup it
  opens owns its own keyboard model. If a later record ever admits several
  controls in the cell, the repository's own tree-walking focus precedents
  are its starting point.
- **A hover-revealed, swipe-revealed, or touch-gesture counterpart.** The
  action is visible at rest on every input. Touch gestures over a row belong
  to `spec:AST-057`.
- **`CommandPalette`.** Its rows are compound children (`CommandPaletteItem`),
  and its internal conversion of `SearchableItem` to `SelectorOptionData`
  carries only `value` and `label`, so neither declaration site reaches its
  rendered rows. Adopting it is its own admission under `spec:AST-002`.
- **`ComplexSelector`.** Its content is caller-owned markup with no listbox
  role; a caller there already renders rows with controls.
- **A theme target for the action cell.** Whether one is admitted is each
  component's theming record.
- **Controls on the collapsed trigger.** A clear button, a chevron, a status
  icon, or anything else a caller composes around the closed control is not
  an option action and is not governed here.
- **The action's handler semantics.** What Edit does — open a dialog, mutate
  in place — is the caller's. The panel neither closes nor re-filters because
  an action fired; the handler may. Whether a row leaves after its action
  fires is a swipe question and stays in `spec:AST-057`; a picker option does
  not vanish when someone presses Edit.
- Equivalent internal implementations remain valid when they satisfy this
  contract. Internal modules, files, function names, algorithms, data
  structures, storage layouts, manifests, journals, locks, transaction
  protocols, and CI job/workflow topology belong in architecture or
  implementation unless callers or interoperating systems intentionally depend
  on that exact mechanism as a public protocol.

## Evidence: in the repository

Read from `packages/core/src` at this record's base commit.

| Where                                                                                                                                                                           | What it shows                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Selector/types.ts` — `SelectorOptionData {value, label?, description?, disabled?, icon?}`; `MultiSelector/types.ts` re-exports it                                              | One option vocabulary, two public components. `CommandPalette` imports it only to build a flat index for its combobox; its rendered rows do not read it.                                                                                                                        |
| `Typeahead/types.ts` — `SearchableItem {id, label, element?, auxiliaryData?}`                                                                                                   | The second vocabulary. Rendered by `BaseTypeahead`, which `Typeahead` and `Tokenizer` compose; also the item type of `ChatComposerInput`'s trigger menu, which renders its own listbox. `element?` shows items already carry render-time content from a source.                 |
| `Selector.tsx`, `MultiSelector.tsx`, `BaseTypeahead.tsx` — `role="listbox"` hosts, `role="option"` rows, `aria-activedescendant`                                                | Three listboxes, one combobox pattern. Each option is one element that is both the click target and the exposed row, so nothing interactive can sit beside the option's content without being its descendant.                                                                   |
| `Selector.tsx` and `MultiSelector.tsx` — the divider is `aria-hidden`, the empty state is `role="presentation"`, the section heading sits `aria-hidden` inside a `role="group"` | Three workarounds, each commented "`role="listbox"` only permits option/group children". A grid's rule is different: rows and row groups, with hidden children excluded as before — so the divider and empty state keep working and the section wrapper must change role (FR7). |
| `BaseTypeahead.tsx` — the empty state is `role="option" aria-disabled="true"`                                                                                                   | A fourth, divergent workaround: the "nothing matched" message is itself a disabled option. In a grid that element is an invalid child, and `spec:AST-056` AR1 already asks the announcement to carry what was rendered (FR7).                                                   |
| `Selector.tsx` — `aria-haspopup` is `'listbox'`, or `'dialog'` for the bottom sheet; `BaseTypeahead.tsx` omits it (the combobox default is `listbox`)                           | The popup's role is already advertised per presentation. A grid popup needs `'grid'` advertised the same way (FR2).                                                                                                                                                             |
| `MultiSelector.tsx` — the select-all row is a sentinel option rendered through the same row renderer; a create row for a query that matched nothing is an `option`              | System-minted rows exist and will exist. They are rows like any other, with an empty action cell (FR3).                                                                                                                                                                         |
| `hooks/useGridFocus.ts` — `columns: number`, fixed; rows and columns computed over every cell in DOM order; `Calendar` consumes it                                              | The repository's grid model moves vertically by a fixed column count. Two cells per row, always, is the shape that model walks without a counting pass (DEC-3).                                                                                                                 |
| `Selector.tsx` — Tab from the search input reaches the clear control inside the popover "keeping the popup open"                                                                | The only sequential stop inside a picker panel today, and it is the component's own. Actions add none (FR5, AR3).                                                                                                                                                               |
| `SideNav/SideNavItem.tsx` — `actions?: ReactNode`; `Item.endContent` doc: "badges, metadata, timestamps, or action buttons"                                                     | Rows already take their controls as a node the caller renders and the row only places. `action` here is that convention, singular because the cell holds one (DEC-1, DEC-3).                                                                                                    |

## Public API and concepts

| Concept                     | Closed values or states                                                                 | Meaning                                                                                                                                                              | Default | Owner          | Stability |
| --------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------- | --------- |
| `SelectorOptionData.action` | `ReactNode \| undefined`                                                                | The option's secondary control, in `Selector` and `MultiSelector`: one node the caller renders and names; the host places it. Absent and `null` mean the same: none. | absent  | `spec:AST-058` | proposed  |
| `SearchableItem.action`     | `ReactNode \| undefined`                                                                | The same key with the same type on the typeahead family's item, reaching `Typeahead` and `Tokenizer` through `BaseTypeahead`.                                        | absent  | `spec:AST-058` | proposed  |
| the panel's role            | `listbox` → `grid`                                                                      | A listbox until a declared option carries an action; a grid from then on while the component stays mounted (FR2, DEC-5). Advertised through `aria-haspopup`.         | listbox | `spec:AST-058` | proposed  |
| a row                       | `row` with exactly two `gridcell`s                                                      | The option — everything it renders today — then its action. System-minted rows have an empty action cell.                                                            | —       | `spec:AST-058` | proposed  |
| reaching an action          | pointer, touch, inline-end arrow + Enter, screen reader through `aria-activedescendant` | Every supported modality; never hover, swipe, or Tab alone.                                                                                                          | —       | `spec:AST-058` | proposed  |

The action cell is a part named in each adopter's option anatomy: a rendered
content slot the caller fills with a component
(`architecture:public-component-api` INV18).

Not public: the row and cell markup, how the active descendant is tracked,
how the action column is sized, and which hook walks the grid.

## Requirements

### Behavioral contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Basis                                                                                                         | Verification state                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| FR1 | An option carries its secondary control as `action?: ReactNode`, one node. The key has the same name and the same type on `SelectorOptionData` and on `SearchableItem`. The caller renders the control and owns its name, its handler, its disabled state, and its appearance; a caller with several verbs renders one menu trigger whose popup owns the rest. The host renders the node where FR3 says and MUST NOT inspect, clone, or wrap it to decide anything; checking that it is present (FR2) is not inspection. No host-owned type or component for an action exists. | DEC-1, DEC-3, DEC-4; `SideNavItem.actions`, `Item.endContent`; `architecture:public-component-api` INV2, INV3 | Proposed; no evidence on `main`                      |
| FR2 | A popup is a listbox until a render in which any declared option — at any depth of sections, before any query filters it — carries an `action` that is not `null` or `undefined`; from that render it is a grid and stays a grid while the component is mounted. The control that owns the popup advertises the role in force through `aria-haspopup` (`grid`; the bottom sheet keeps `dialog`). A popup whose role followed the filtered view, or switched back, is a defect.                                                                                                 | DEC-2, DEC-5; `spec:AST-002` FR8, FR15                                                                        | Proposed                                             |
| FR3 | In a grid, each option is one `role="row"` carrying the option's id, `aria-selected`, and `aria-disabled`, with exactly two `gridcell` children for every row: the first holds everything the option renders today — selection mark or checkbox, icon, label, description, `renderOption` output — and the second holds its `action` node, empty when it declares none. Rows the component mints (select-all, a create row) are rows of the same shape with an empty action cell. No row has one cell or three.                                                                | DEC-2, DEC-3; `useGridFocus` fixed columns                                                                    | Proposed                                             |
| FR4 | Activating an action runs the caller's own handler and nothing else: the selection does not change, the highlighted row does not change on its account, and the panel neither closes nor re-filters. Pressing the option cell selects or toggles exactly as it does today. An option's `disabled` governs its selection only; whether an action is disabled is the caller's control's own state, and the host does not read it.                                                                                                                                                | `spec:AST-002` FR16, DEC-6                                                                                    | Proposed                                             |
| FR5 | Up and Down move the highlight between rows as today, landing on the option cell; the inline-end arrow moves it from the option cell to the row's action cell, and the inline-start arrow moves it back, so the keys follow visual direction under RTL. Enter or Space on the option cell selects as today; Enter or Space on the action cell activates the control there. Typing to jump, Home, End, PageUp, PageDown, Escape and Tab keep their current meanings. No action control is in the sequential tab order.                                                          | APG combobox with grid popup; `useGridFocus` RTL handling; `component:Selector` keys                          | Proposed                                             |
| FR6 | `aria-activedescendant` on the element that holds focus — the trigger, the search input, or the bottom-sheet panel — references the row while the highlight is on the option cell, and the action's control while it is on the action cell. It never references an element the person cannot act on.                                                                                                                                                                                                                                                                           | AR3; current `aria-activedescendant` wiring in all three hosts                                                | Proposed                                             |
| FR7 | In a grid, a section is a `rowgroup` named by its title, with its heading hidden as today. Dividers and the "nothing matched" message stay out of the accessibility tree, as `Selector` and `MultiSelector` already keep them; `BaseTypeahead`'s message, an `option` today, becomes presentational in every mode and is announced as `spec:AST-056` AR1 requires. The popover and the bottom sheet render the same tree.                                                                                                                                                      | ARIA grid required owned elements; `spec:AST-056` AR1                                                         | Proposed; the `BaseTypeahead` message diverges today |
| FR8 | An action is visible at rest on every input and every pointer type. The host places the caller's control in the action cell with the cell's size and alignment and paints nothing of its own over it. Nothing is revealed on hover, focus, or swipe.                                                                                                                                                                                                                                                                                                                           | `architecture:interaction-modality` INV4; `spec:AST-057` DEC-5                                                | Proposed; real-Chromium evidence required            |
| FR9 | `Selector`, `MultiSelector`, `Typeahead`, and `Tokenizer` adopt this contract; the last two through the one panel `BaseTypeahead` renders. A host that renders either option vocabulary in a listbox it owns and has not adopted MUST NOT render the action inside the option; until it adopts, it renders the option without the action and warns in development when an item carries one.                                                                                                                                                                                    | DEC-4; `spec:AST-002` FR15 (never silently render a broken state)                                             | Proposed                                             |

### Accessibility contract

- **AR1 — The tree is valid in both modes.** A listbox exposes only `option`
  and `group` children, as today. A grid exposes only `row` and `rowgroup`
  children, every exposed child of a row is a `gridcell`, and no `option` or
  `listbox` role remains anywhere in the panel. A `role="none"` or
  `role="presentation"` wrapper is never used to make a control appear
  beside an option; the required-children and required-parent checks pass
  with an action present and absent.
- **AR2 — Names stay separate.** The option cell's content is the row's
  accessible name; the caller's control carries its own name and it is not
  folded into the row's name. A control without an accessible name is the
  caller's defect and the host's development warning. A `MultiSelector` row that carries a name of its
  own today — the partially selected select-all row — keeps it on the row.
- **AR3 — Every modality reaches the action.** A mouse clicks it, a finger
  taps it, a keyboard reaches it with the inline-end arrow and fires it with
  Enter, and a screen reader is told about it through `aria-activedescendant`
  and the control's name. No path depends on hover, on a gesture, or on
  leaving the combobox's focus.
- **AR4 — Selection semantics are unchanged.** `aria-selected` moves from the
  option to the row and means what it meant; `aria-multiselectable` stays on
  the host; the selection announcement a person hears when toggling an option
  does not change because a grid now holds it.

### Platform support

- Supported feature/engine floor: every supported renderer and browser; the
  roles used are ARIA 1.2 and the key handling is the combobox pattern
  already shipped.
- Unsupported behavior: none. A host that cannot keep AR1 does not partially
  adopt; it keeps its listbox and FR9's warning.
- Browser evidence: FR1–FR7, FR9 and AR1–AR4 are tree, role, and
  event claims provable in jsdom, with the required-children and
  required-parent rules checked by an accessibility engine against the
  rendered DOM. FR8 and the alignment of the action column against its rows
  are paint claims and need real-Chromium evidence, including RTL.

## Current-state impact

- `SelectorOptionData` and `SearchableItem` gain `action?: ReactNode`.
  No new type or component is exported. Additive: no shipped prop, default,
  or behavior changes for a caller who declares none. A caller who extends
  `SearchableItem` and already declares a member named `action` of another
  type meets a type conflict on upgrade; the adoption change names that in
  its compatibility note.
- `component:Selector` (`current`) gains the key and the grid mode as local
  concepts citing this record when adoption lands; `component:MultiSelector`,
  `component:BaseTypeahead`, `component:Typeahead`, and `component:Tokenizer`
  (`draft`) cite it rather than copying it. `component:MultiSelector`'s FR9 /
  DEC-2 is withdrawn in favour of FR3 and AR1 here.
- A create row for a query that matched nothing is a system-minted row
  under FR3 whenever the popup is a grid; its own contract is
  `spec:AST-056` DEC-3 and is not changed here.
- `architecture:public-component-api` gains `spec:AST-058` in its
  `deciding_specs` when this record becomes `current`; no invariant changes.
- `architecture:interaction-modality` is read, not changed; AR3 applies its
  INV4 and INV7.
- `spec:AST-057` is read, not changed. Its swipe actions are declared
  objects and this record's are nodes, by one principle stated in DEC-1: the
  component that paints a control needs the object; the component that only
  places one takes the node.
- `contributing:api-conventions` gains one sentence: a control the component
  renders is declared as data; a control the component only places is a node
  on the row's own data, never a render prop on the host.
- Consumer docs for the five adopters gain the key and one example each.
- No shipped public API changes on this record's own merge. While this record
  is `draft` its `review-applicability:v1` block routes nothing
  (`architecture:knowledge-contracts` INV20).

## Verification

| Contract      | Verification                                                                                        | Representative states                                                                                                                          | Mutation or failure expectation                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR9      | Per-adopter prop-surface and rendering suites; exported-surface inventory                           | `action` on both vocabularies; an `IconButton` node; a plain `Button` node; a menu trigger node; a non-adopting host given an item with one    | A host-owned action type or component, an array-typed key, a host that inspects, clones, or wraps the node, or a non-adopting host rendering the control inside an option, fails. |
| FR2, DEC-5    | Per-adopter role suites across re-renders                                                           | No key; `action: null`; one option with an action inside a section; a query that filters that option out; the action removed on a later render | A grid with no declared action, a listbox with one, a role that follows the filtered view, a switch back to listbox, or a stale `aria-haspopup`, fails.                           |
| FR3, AR1      | Tree assertions plus required-children and required-parent checks in both modes                     | Plain options; sections; dividers; the empty state; select-all; a create row; a row without an action beside one with                          | A row with other than two cells, an `option` inside a grid, a `group` inside a grid, or a `none`/`presentation` wrapper carrying a control, fails.                                |
| FR4           | Per-adopter interaction suites                                                                      | Click the action; click the option cell; a disabled action; a disabled option with an enabled action; single and multiple selection            | A selection change, a highlight change, a panel close, or a re-filter attributable to the action, or an action silenced by the option's `disabled`, fails.                        |
| FR5, FR6, AR3 | Per-adopter keyboard suites with `aria-activedescendant` assertions; RTL via the direction provider | Down to a row; inline-end to its action; Enter; inline-start back; Escape; Tab; typing to jump; the same in RTL; bottom-sheet presentation     | A sequential tab stop inside the panel, an action unreachable by arrow, Enter on the action cell selecting the option, or an active descendant on an inert element, fails.        |
| FR7           | Per-adopter tree and live-region suites                                                             | Sections with and without titles; dividers while searching; the empty state in each host                                                       | A `group` in a grid, a divider or message exposed as a child, or a `BaseTypeahead` message still exposed as an `option`, fails.                                                   |
| FR8           | Real-Chromium evidence at rest, hover, focus, and in RTL                                            | An icon-only control; a text control; a row with and without an action; coarse and fine pointer                                                | An action absent at rest, revealed on hover, misaligned with its row, or repainted by the host, fails.                                                                            |
| AR2, AR4      | Accessible-name and selection assertions                                                            | A row with a named control; a row with an unnamed control; the partially selected select-all row; toggling in multiple selection               | A row named by its control's label, a missing warning for an unnamed control, a select-all row that loses its name, or a changed selection announcement, fails.                   |

Known verification gap: none of the suites above exist on `main`; no
component implements the contract; the repository's accessibility pattern
contracts cover `listbox` and not `grid`. This record is `draft`, does not
govern review, and names no implementation.

## Decision log

`approved_by` is `null` and the record is `draft` until the owner approves
it as a whole.

### DEC-1 — The action is one node on the option, because the host only places it

**Reference:** `spec:AST-058/DEC-1`
**Decider:** `cixzhang`, `<pending>`

`action?: ReactNode` on the option, rendered by the caller.

```tsx
options={[
  {
    value: 'eng',
    label: 'Engineering',
    action: <IconButton icon={<PencilIcon />} label="Edit Engineering" onClick={edit} />,
  },
  {value: 'design', label: 'Design'},
]}
```

The option is where the information lives: which rows have a control is a
fact about that option, so a host checks `action != null` before it renders
anything and decides its own structure (DEC-2) without calling anything, and
a row with no action needs no code from the caller.

The value is a node rather than a declared object by one principle, shared
with `spec:AST-057`, which takes the other side of it: **the object is
needed where the component renders the thing; a node works where the
component only places it.** A swipe panel is painted and animated by the
component and needs a label, a variant, and whether the row leaves before
the gesture begins, so it is declared. A picker-row action is a control the
caller renders — its name, handler, disabled state, and appearance are
already on the caller's own button — and the host puts it in a grid cell and
does nothing else to it. There is nothing for the host to know up front, so
there is no type to declare, no shipped control, and no tier between what
the system ships and what a caller brings.

The key is singular because the cell holds one node (DEC-3). An array that
could only ever hold one element would advertise a capability that does not
exist, and a caller would pass two and meet the limit at runtime. The cap
costs nothing: a caller with several verbs renders one menu trigger in the
node, and the popup it opens owns its own keyboard model, so the cell still
holds one focusable control.

A shape test of four candidate shapes with isolated builders, given the
behavior and no prop names, reached a declared array of
`{label, icon, onClick}` on every recall probe and rejected a render prop
unprompted. That measures what builders expect; the node is what the
component needs, since it renders nothing of the control itself. A key on
the option is what the two agree on. The report is held by the owner outside
the repository.

Rejected: a render prop on the host — a host
cannot tell "no actions anywhere" from "a function returning `null` for
every row" without calling it for every row, so it cannot know its own
structure, and the caller ends up guarding it. Rejected: a declared
`OptionAction` object — it would have the host render a control it has no
reason to own, and a `variant` vocabulary with it. Rejected: `actions:
ReactNode[]` so the key need not change if within-cell movement is ever
specified — `spec:AST-056` DEC-2 rejected exactly this speculative
generality, and the deprecation cycle `spec:AST-017` establishes makes
`action` to `actions` cheap if that day comes.

### DEC-2 — The host is a grid once an option carries an action

**Reference:** `spec:AST-058/DEC-2`
**Decider:** `cixzhang`, `<pending>`

A control beside an option cannot be a listbox child: `role="listbox"`
permits only `option` and `group`. The combobox pattern permits a popup of
`listbox`, `tree`, `grid`, or `dialog`, so a grid keeps the contract the
trigger and the search input already fulfil — `aria-haspopup="grid"`,
`aria-controls`, `aria-activedescendant` — and gives the keyboard its path
for free: Up and Down move rows as before, the inline-end arrow reaches the
action. No second surface, no hidden panel, no Tab stop.

Rejected: a `role="none"` wrapper around the option and its control —
`none` reparents its children to the nearest exposed
ancestor, so the control lands directly inside the listbox and fails the same
required-children rule, the rule `MultiSelector`'s own source cites twice for
its divider and its empty state. Rejected: an absolutely positioned column of
controls outside the listbox, each at its row's measured offset — valid, but it trades a structural fix for a position-sync
loop against resize, reflow, and virtualized mounts.

### DEC-3 — Two fixed cells per row

**Reference:** `spec:AST-058/DEC-3`
**Decider:** `cixzhang`, `<pending>`

Every row has two cells: the option, then its action. A row with no action
has an empty second cell.

A grid is walked by a fixed column count — the repository's own grid hook
moves vertically by exactly `columns` cells and computes rows over every
cell in DOM order — so ragged rows break vertical movement. Two cells always
means no counting pass, no per-row geometry, and no difference between a
plain option, a select-all row, and a create row. The grid is walked to cells, never into them, so the caller's node inside
the second cell changes none of this — and because the cell holds one node
(DEC-1), there is no movement inside it to specify.

Rejected: one cell per control — row widths vary with the data and vertical
movement lands in the wrong column.

### DEC-4 — One key, one type, both option vocabularies; the typeahead family adopts through its one panel

**Reference:** `spec:AST-058/DEC-4`
**Decider:** `cixzhang`, `<pending>`

The repository renders picker panels from two option types.
`SelectorOptionData` is shared by `Selector` and `MultiSelector`.
`SearchableItem` is the typeahead family's item: `BaseTypeahead` renders it,
`Typeahead` and `Tokenizer` compose `BaseTypeahead`, and the query's results
are what the panel shows. A key on the first reaches two components; the
typeahead family only gets the capability if its own item carries it.

So the same key, with the same name and the same type, is declared on both. One concept keeps one name across the
components that have it — the rule `spec:AST-056` FR1 applies to a state,
applied here to a declaration. `SearchableItem` already carries a rendered
node from a source (`element?`), so a source attaching an action node to its
items is in character; `createStaticSource` passes them through untouched.
`BaseTypeahead` is the single renderer, so adopting it once covers
`Typeahead` and `Tokenizer`.

Hosts that render `SearchableItem` in a listbox of their own —
`ChatComposerInput`'s trigger menu — are bound by FR9 until they adopt.
`CommandPalette` is not an adopter: its rows are compound children and its
internal `SelectorOptionData` conversion drops every field but `value` and
`label`, so neither declaration reaches its rendered rows (Non-goals).

Rejected: a host-level function `getAction(item)` for the typeahead
family — the same detection problem DEC-1 rules out, now on the one family
whose rows arrive asynchronously.

### DEC-5 — The grid is conditional: detection reads the declared options and latches

**Reference:** `spec:AST-058/DEC-5`
**Decider:** `cixzhang`, `<pending>`

A host decides its role from the options it was given, before any query
filters them: any option, at any depth of sections, whose `action` is not
`null` or `undefined`. An absent key and a `null` value are one state — a
caller who writes `action: canEdit ? <Edit/> : null` for every option gets
`null` on most rows, and that must not make a grid. The check is presence;
the host never reads the node.

Once a host has been a grid it stays a grid while mounted. A `Selector`
whose `options` are stable never switches at all; one whose options arrive
after a loading state switches once, before anyone has read the panel. A
typeahead's rows are a query's results, so a per-result-set role would
change as the person types; the latch bounds that to one switch per mounted
instance, never back. The trigger's `aria-haspopup` follows.

Rejected: a permanent grid on every picker — every current user would hear
"grid" for a one-column list and horizontal arrow keys would reach nothing.
Rejected: a role that follows each render's filtered view — a picker that
changes role as a caller filters would be worse than either mode.

## Open questions

None. How many controls a cell may hold is answered by the type: one node
(DEC-1, DEC-3). Within-cell movement is outside this record's scope.

## Content boundary

The research that produced this record — the shape test's design, prompts,
and scores — is a report, not a contract, and lives outside it, held by the owner.

This record does not duplicate any adopter's anatomy, prop table, theming
targets, or consumer examples; the admission argument in `spec:AST-002`; the
deprecation and release mechanics in `spec:AST-017`; the shared naming
grammar in `architecture:public-component-api`; the modality invariants in
`architecture:interaction-modality`; the search-state vocabulary in
`spec:AST-056`; the swipe gesture in `spec:AST-057`; or the menu item-data
contract in `component:DropdownMenu`. It links their canonical owners.
