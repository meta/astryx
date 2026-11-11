---
schema_version: 3
template_version: 4
kind: module
id: module:Table/useTableTreegrid
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-11
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/core/src/Table/plugins/tree/useTableTreeData.test.tsx,
    apps/storybook/stories/TableTree.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
parent_component: component:Table
references:
  [
    spec:AST-020,
    spec:AST-009,
    spec:AST-058,
    architecture:interaction-modality,
    architecture:internationalization,
    architecture:list-windowing,
    architecture:public-component-api,
    module:Table/useTableTreeData,
    module:Table/useTableActivation,
    module:Table/useTableRowsVirtualization,
    component:TreeList,
  ]
---

# useTableTreegrid module contract

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | New opt-in plugin hook `useTableTreegrid(config)` with `UseTableTreegridConfig<T>`, which takes `getRowMeta`, `onToggleItem` and `hasExpandableRows` (the `treeConfig` that `useTableTreeState` returns). No Table protocol field changes.            |
| Behavior                | Composed with `useTableTreeData`, a tree table becomes an APG treegrid with row focus: one Tab stop for the rows, arrow keys between rows, inline-end/inline-start to expand, collapse, reach the parent and step into a row's cell controls.         |
| End-user impact         | Keyboard and screen-reader users hear each row's level, expanded state and position, and move through a tree table with arrows instead of tabbing through every chevron and checkbox. Tree tables without the plugin are unchanged.                   |
| Builder impact          | One extra plugin entry. Adopting it changes the table's role to `treegrid`, makes the rows the Tab stop and takes cell controls out of the Tab order; tests that query `role="table"` on a tree table query `treegrid`.                               |
| Compatibility/readiness | Additive and opt-in; omitting the plugin preserves every released tree-table behavior. Implementation, unit and real-browser verification are required before release.                                                                                |
| Review checks           | Reject a second Tab stop among body rows, a cell control left in the Tab order, Left/Right not mirrored under RTL, position values taken from mounted or paged rows, a focus move that re-renders the whole body, or a new Table protocol field.      |
| Governing rules         | `spec:AST-020` FR15 (adopt a pattern where the part already acts as one composite); `architecture:internationalization` INV11 (direction from the DOM); `architecture:interaction-modality` INV1, INV3, INV4; `component:Table` FR1, FR9, FR17, FR22. |

This table is a review projection; the body below is authoritative.

## Intent

`useTableTreegrid` gives a tree table the WAI-ARIA treegrid semantics and its
row-focus keyboard model. The table is one composite control: its body rows share
one Tab stop, arrow keys move between rows and expand or collapse them, and the
controls inside a row's cells are reached with the inline-end arrow. The module
owns the treegrid role, row state, the roving Tab stop, the key model and focus
preservation. It does not render tree rows, indentation or expansion controls;
`module:Table/useTableTreeData` owns those.

## Compatibility and migration

- Released default preserved: yes. A Table without this plugin renders and
  behaves exactly as without it, tree tables included.
- Compatibility class: additive opt-in plugin hook and configuration type.
- Adopting the plugin changes three observable things for a tree table: the
  `<table>` role is `treegrid`; the body rows hold one Tab stop in place of the
  Expansion controls' and cell controls' individual stops; cell controls are
  reached with the inline-end arrow and leave with the inline-start arrow, Up,
  Down or Escape (FR4–FR6). Header controls keep their Tab stops.
- A table that renders a tree with its own expand/collapse cell and no treegrid
  semantics changes keyboard model when it moves to this plugin: one Tab stop
  plus arrow keys, in place of one Tab stop per toggle.
- Migration decision: DEC-1.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The `treegrid` role on the Table element and the computed `row`, `gridcell`
  and `columnheader` exposure inside it while active.
- Row `aria-expanded`, `aria-posinset` and `aria-setsize`.
- The roving Tab stop across body rows, the tab order of controls inside body
  cells while active, the row and cell-control key model, the row focus ring,
  and focus preservation across expansion and data changes.

**Does not own / non-goals**

- Aggregate plugin protocol, ordering and composition, the Scroll region's own
  Tab stop (`component:Table` FR1) and the focus owner for removed content
  (`component:Table` FR22) — owned by `component:Table`.
- Tree flattening, row keys, expansion state, indentation, the Expansion
  control, its accessible name, and row `aria-level` — owned by
  `module:Table/useTableTreeData` and the caller's tree state.
- Selection state, `aria-selected` and selection keys — owned by the selection
  plugin. Row activation — `module:Table/useTableActivation`, which is inactive
  on the tree row model.
- Focus moving cell by cell, a focusable cell without a control, and an editing
  mode for editable controls inside cells (OQ1).
- Row windowing of tree tables (FR10).
- Keyboard and pointer modality detection — `architecture:interaction-modality`.

## Public API and concepts

| Concept           | Closed values or states                                                                                                        | Meaning                                                                            | Default                                   | Owner                           | Stability                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------- | --------------------------- |
| Plugin            | `useTableTreegrid(config)` returning a `TablePlugin`                                                                           | Opt-in treegrid semantics and keyboard model for a tree table                      | Absent: native table                      | `module:Table/useTableTreegrid` | Additive from first release |
| Tree input        | `getRowMeta`, `onToggleItem`, `hasExpandableRows`                                                                              | The same structural meta and toggle the tree plugin consumes; no second tree store | Required; `treeConfig` supplies all three | Caller / tree state             | Additive from first release |
| Activity          | `active`, `inert`                                                                                                              | Whether the plugin contributes anything to the render                              | Derived (FR1)                             | `module:Table/useTableTreegrid` | Stable                      |
| Row stop          | One body row key                                                                                                               | The row that holds `tabindex=0`                                                    | First visible row                         | `module:Table/useTableTreegrid` | Stable                      |
| Focus location    | `row`, `control` (a focusable element inside a body cell), outside                                                             | What the key model applies to                                                      | Outside                                   | `module:Table/useTableTreegrid` | Stable                      |
| Cell control kind | `press` (button, link, checkbox, menu trigger), `editable` (text entry, contenteditable, select, slider, spinbutton, combobox) | Whether arrow keys belong to the treegrid or to the control                        | Derived from the element's role and type  | `module:Table/useTableTreegrid` | Stable                      |

Consumer signatures and examples belong in `useTableTreegrid.doc.mjs`.

## Behavioral contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                                                                              | Evidence state        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------- |
| FR1  | The plugin declares `rowModel: 'tree'` and `wholeRowOwner: 'navigation'` (`component:Table` FR17). It is active only when Table renders in data mode, the admitted row model is `tree`, `hasExpandableRows` is true and the caller passes no explicit Table `role`. Otherwise every transform is a pass-through and the table renders as without the plugin. Data mode without a tree row model, or an explicit caller `role`, emits one development diagnostic. Its position in the named plugin record does not change its output (`component:Table` FR9).                                                                                                                                                                                                      | DEC-1; `component:Table` FR9, FR17                                                 | Verification required |
| FR2  | While active, the Table element has `role="treegrid"` and keeps the Table's own accessible name (`component:Table` FR1). Header rows compute to `row` with `columnheader` cells; body rows compute to `row` with `gridcell` cells. The plugin adds no row `aria-label`: a row's name comes from its cells. An active treegrid without an accessible name emits one development diagnostic.                                                                                                                                                                                                                                                                                                                                                                        | APG Treegrid roles; `spec:AST-020` FR15                                            | Verification required |
| FR3  | Every body row with children has `aria-expanded` `true` or `false`; a leaf has none. Every body row has `aria-posinset` and `aria-setsize` for its sibling group: from the row meta's `posInSet` and `setSize` when both are present (`module:Table/useTableTreeData` FR5), otherwise from the rows sharing its parent in the complete visible tree order. Values never come from mounted, windowed or paged rows. `aria-level` stays with the tree module. All four update in the same commit as an expansion, sort or data change.                                                                                                                                                                                                                              | APG Treegrid states; full-set semantics                                            | Verification required |
| FR4  | Exactly one body row has `tabindex="0"`; every other body row has `-1`. The stop starts on the first visible row and moves to whichever row, or control inside a row, receives focus by key, pointer or script. Focusable elements inside body cells, the Expansion control included, have `tabindex="-1"` while the plugin is active, and get back the caller's value when it becomes inert or unmounts. Header controls (sort, select-all, expand-all) and the Scroll region keep their own Tab stops. Tab from a row or a cell control leaves the treegrid; Shift+Tab returns to the stop row.                                                                                                                                                                 | APG Treegrid, one composite Tab stop; `spec:AST-020` FR15; `component:Table` FR1   | Verification required |
| FR5  | With focus on a body row: Down and Up move to the next and previous visible row, stopping at the ends. The inline-end arrow expands a collapsed row and keeps focus on it; on an expanded row or a leaf it moves focus to the row's first cell control in DOM order, the Expansion control excluded, and does nothing when the row has none. The inline-start arrow collapses an expanded row and keeps focus on it; on a collapsed row or a leaf it moves focus to the parent row, and does nothing on a root row. Home and End, and Control+Home and Control+End, move to the first and last visible rows. Enter and Space toggle a row with children and keep focus on it; on a leaf they do nothing, and Space never scrolls.                                 | APG Treegrid keyboard; DEC-2, DEC-4                                                | Verification required |
| FR6  | With focus on a press cell control: the inline-end and inline-start arrows move to the next and previous control in the same row; the inline-start arrow on the row's first control moves focus to the row; the inline-end arrow on its last control does nothing. Home and End move to the row's first and last controls. Up and Down move focus to the previous and next visible row. Control+Home and Control+End move to the first and last visible rows. Escape moves focus to the row. Enter and Space belong to the control; the plugin never toggles expansion from a control. With focus on an editable cell control, every arrow, Home, End, Page and printable key belongs to the control; Escape the control does not consume moves focus to the row. | APG Treegrid and Grid cell keys; `spec:AST-058` FR5; DEC-2, DEC-3                  | Verification required |
| FR7  | The plugin handles a key only when it is unmodified, or modified only by Control for Home and End, when no earlier handler prevented its default, and when its target is the focused row or a control inside that row's cells. It prevents the default of every key it handles. Keys from portalled content, Alt or Meta chords, Shift chords and printable characters pass through. The treegrid has no typeahead. PageUp and PageDown keep the browser's scrolling of the Scroll region and do not move focus.                                                                                                                                                                                                                                                  | APG Treegrid has no typeahead; Table has no Page-key row movement                  | Verification required |
| FR8  | Toggling a row keeps focus on that row. When a row collapses while focus or the stop is on a row inside it, however it collapses (a key, a pointer on an ancestor's Expansion control, collapse-all, a data change), focus and the stop move to the outermost collapsed row that stays visible. Focus moves only if it was inside the removed rows.                                                                                                                                                                                                                                                                                                                                                                                                               | `component:TreeList` AR2                                                           | Verification required |
| FR9  | A focused row keeps focus across sort, filter, label and other data changes while its canonical key stays visible. When the row holding focus or the stop leaves the visible rows for another reason, they move to its nearest ancestor that is still visible; a root row's successor is the row now at its position, else the previous row. With no body rows left, focus goes to Table's focus owner (`component:Table` FR22). Focus moves only if it was inside the removed row; a caller who already moved focus keeps it there. The stop moves without moving focus when focus is elsewhere.                                                                                                                                                                 | `component:Table` FR16, FR22                                                       | Verification required |
| FR10 | Table's windowing admission excludes the tree row model (`component:Table` FR17, FR18), so every visible row of an active treegrid is mounted and a focused row never leaves the DOM by scrolling. Moving focus to a row scrolls it into view through native focus, with the shared focus owner's scroll rules. Position values never depend on which rows are mounted (FR3).                                                                                                                                                                                                                                                                                                                                                                                     | `component:Table` FR17, FR18; `architecture:list-windowing`                        | Verification required |
| FR11 | The inline-end and inline-start arrows resolve from the computed direction of the treegrid element at the time of the key press: Right is inline-end in a left-to-right region and Left is inline-end in a right-to-left region. Up, Down, Home, End and Escape do not depend on direction. No render-time direction value drives the key model.                                                                                                                                                                                                                                                                                                                                                                                                                  | `architecture:internationalization` INV11; shared focus hooks' direction detection | Verification required |
| FR12 | A pointer press on a row's non-interactive area moves focus and the stop to that row and shows no focus ring after pointer input. The Expansion control stays a pointer and touch target with its name and `aria-expanded` (`module:Table/useTableTreeData` AR1), so a touch screen-reader user activates it directly. Touch input needs no key; no state is revealed only on hover. `hasRowClickExpansion` keeps its pointer-only behavior.                                                                                                                                                                                                                                                                                                                      | `architecture:interaction-modality` INV1, INV4                                     | Verification required |
| FR13 | A selection checkbox in a body cell is a press cell control (FR6); Space on a row toggles expansion, not selection. Composition with another structural row model, such as expanded detail panels or grouped rows, makes the plugin inert with one development diagnostic, because those rows are not tree rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `component:Table` FR17; DEC-4                                                      | Verification required |

### Transformation and precedence order

- **ORD1 — Admission.** Table resolves row model, whole-row owners and data mode
  (`component:Table` ORD5); the plugin then decides activity (FR1) before it
  contributes any attribute or handler.
- **ORD2 — Row props.** The plugin adds `tabIndex`, `aria-expanded`,
  `aria-posinset`, `aria-setsize` and its key and focus handlers to the
  accumulated body-row props. Earlier handlers run first and their
  `preventDefault` skips the plugin (FR7). An explicit caller row `tabIndex` is
  replaced while active and restored when inert.
- **ORD3 — Key resolution.** Classify the target (row, press control, editable
  control, outside), resolve direction from the DOM (FR11), then apply FR5 or
  FR6. An editable control's own key handling precedes the plugin.

### Performance and resources

- **PR1 — Inert costs nothing.** An inert plugin adds no attributes, handlers,
  listeners or observers.
- **PR2 — Focus moves are local.** A focus or stop move re-renders at most the
  two rows whose `tabindex` changes; it never re-renders the body. Expansion
  renders only what the tree module already renders for the toggle.
- **PR3 — No body scans per key.** A key press reads only the visible-row
  sequence and the focused row's controls. Cell-control `tabindex` management
  runs when a row's cells mount or change, never on each focus move, and adds no
  document-level listener.
- **PR4 — Shared key engine.** The row model reuses the shared tree focus hook
  rather than a second key engine. The plugin is a separate import, so a Table
  without it ships none of its code; its own code stays within 2 KB
  minified and gzipped.

## Accessibility contract

- **AR1 — The tree table adopts the APG Treegrid pattern** (`spec:AST-020`
  FR15) as one composite control, with row focus: roles, accessible name,
  `aria-level`, `aria-expanded`, `aria-posinset`, `aria-setsize`, one Tab stop
  and the row keys of FR5. Named exceptions: cells without a control never take
  focus, and a row's cell controls are its only focusable descendants (DEC-2);
  PageUp and PageDown are not adopted, because Table moves no row on them; the
  header row is outside the roving set and its controls keep their Tab stops;
  the Scroll region keeps its own stop while it overflows (`component:Table`
  FR1).
- **AR2 — Visible focus.** A focused row paints the shared focus ring inset on
  the row, fully visible over pinned cells and at the first and last rows,
  after keyboard input only (`architecture:interaction-modality` INV1, INV3).
  A cell control paints its own ring.
- **AR3 — Exposure, not phrasing.** Computed accessibility-tree role, level,
  expanded state and position establish the contract. No live region is added
  and no particular spoken phrase is promised; real assistive-technology
  evidence follows `spec:AST-009` only for a recorded divergence.

## Design relationships

| Anatomy or state  | Design requirement                           | Representation authority | Module contract |
| ----------------- | -------------------------------------------- | ------------------------ | --------------- |
| Focused row       | Shared focus ring, inset, on the whole row   | Prescribed: shared ring  | AR2             |
| Expansion control | Unchanged anatomy; leaves the keyboard order | Existing tree control    | FR4, FR12       |

## Parent and system relationships

- `component:Table` owns the plugin protocol, named ordering, row-model and
  whole-row admission, the Scroll region stop and the removed-content focus
  owner. This module adds no protocol field.
- `module:Table/useTableTreeData` owns tree rows, indentation, the Expansion
  control and `aria-level`; this module consumes the same tree input.
- `spec:AST-020` FR15 governs pattern adoption; `component:TreeList` AR2 is the
  collapse-focus precedent; `spec:AST-058` FR5 is the in-row control precedent
  (inline-end arrow, no Tab stop).

## Verification map

| Contract      | Verification                                                                                   | Representative states                                                                                                                  | Mutation or failure expectation                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| FR1           | Plugin unit tests                                                                              | Flat data; tree with and without the tree plugin; caller `role`; both plugin orders                                                    | Any attribute or handler while inert, a missing diagnostic, or order-dependent output fails                                           |
| FR2, FR3, AR3 | Unit DOM assertions plus a real-Chromium accessibility-tree check                              | Roots, nested rows, leaves; expand, collapse, sort; `posInSet`/`setSize` supplied and derived; partial children with supplied set size | A `table` role, a leaf with `aria-expanded`, a position from visible or paged rows when meta supplies another, or a stale value fails |
| FR4           | Unit tabindex assertions plus a real-browser Tab walk                                          | Initial stop; stop after click, key and script focus; chevron, checkbox and button cells; plugin removed                               | Two `tabindex=0` rows, a cell control in the Tab order, or a caller value not restored fails                                          |
| FR5, FR6, FR7 | Unit key tests for every key, and a real-browser keyboard walk in Chromium, Firefox and WebKit | Collapsed, expanded, leaf, root; first and last rows; first and last controls; editable control; modifiers; portalled menu             | A missing move, a wrap, a toggle from a control, typeahead, a handled modified key, or a scrolled page on Space fails                 |
| FR8, FR9      | Unit and real-browser focus tests                                                              | Collapse via key, ancestor chevron and collapse-all; delete, filter, sort; root removal; empty data; caller-moved focus                | Focus on `body`, a stolen caller focus, or a stop on a removed row fails                                                              |
| FR10          | Real-browser scroll check                                                                      | A 200-row tree in a block-constrained Table; End, Home and arrows past the viewport                                                    | A focused row out of view after its move, or a position value that changes with scroll, fails                                         |
| FR11          | Unit tests under `dir="rtl"` on an ancestor and a real-browser RTL walk                        | Provider direction disagreeing with the DOM `dir`                                                                                      | Keys following provider direction instead of the DOM, or unmirrored arrows, fail                                                      |
| FR12, AR2     | Real-browser pointer, touch-emulation and focus-ring screenshots                               | Pointer then key; pinned first column; first and last rows; light and dark                                                             | A ring after pointer input, a ring clipped by a pinned cell or the viewport edge, or a chevron that loses its name fails              |
| FR13          | Unit composition tests                                                                         | Selection plugin; row expansion; grouped rows                                                                                          | Space toggling selection, or an active treegrid over detail or grouped rows, fails                                                    |
| PR1–PR4       | Render-count test and bundle-size check                                                        | Focus move across 1,000 rows; inert plugin; Table without the plugin                                                                   | More than two rows re-rendered per move, any inert work, or own code over 2 KB min+gzip fails                                         |

## Decision log

### DEC-1 — An opt-in plugin, separate from tree data

**Reference:** `module:Table/useTableTreegrid/DEC-1`
**Decider:** cixzhang, 2026-11-11

Treegrid semantics change a tree table's role and its Tab order, so a caller
chooses them by composing this plugin; a Table without it keeps every released
behavior. The plugin consumes the tree plugin's input instead of a second tree
store. Rejected: treegrid built into `useTableTreeData` by default, because it
changes every tree table's Tab order without the caller choosing it.

### DEC-2 — Row focus; the inline-end arrow enters the row's cell controls

**Reference:** `module:Table/useTableTreegrid/DEC-2`
**Decider:** cixzhang, 2026-11-11

Rows take focus, and cells without a control never do. Following the APG
Treegrid pattern, the inline-end arrow on an expanded row or a leaf moves into
the row; here it lands on the row's first cell control, as the option-action
cell is reached in `spec:AST-058` FR5. Children are reached with Down, the next
visible row. This keeps cell controls operable once they leave the Tab order.
Rejected: the inline-end arrow moving to the first child (the Tree View model),
because cell controls would then have no keyboard path.

### DEC-3 — Escape returns from a cell control; no F2

**Reference:** `module:Table/useTableTreegrid/DEC-3`
**Decider:** cixzhang, 2026-11-11

Escape, the inline-start arrow from the first control, Up and Down all return
focus to rows. The APG Grid pattern uses Enter or F2 to enter a cell's own
interaction only where cells take focus; here rows take focus, Enter belongs to
the row (DEC-4), and no current Astryx grid record (Calendar, option actions)
uses F2.

### DEC-4 — Enter and Space toggle expansion on a row

**Reference:** `module:Table/useTableTreegrid/DEC-4`
**Decider:** cixzhang, 2026-11-11

A row's one keyboard action is its expansion, activated by Enter or Space as
`spec:AST-020` FR15 requires for a pattern's activation. Selection stays on its
checkbox, reached with the inline-end arrow.

## Open questions

- **OQ1 — Editable controls in tree-table cells** (`human-design`). FR6 gives an editable control every arrow key, so a later control
  in the same row is reachable only by pointer once focus is in the editable
  one. Options: (a) keep FR6 and limit the supported contract to press controls
  in tree-table cells, with docs saying so; (b) adopt the APG Grid editing
  mode for editable controls: arrows pass over them like press controls,
  Enter, F2 or a printable key starts editing, and Escape or F2 ends it.

## Content boundary

This record does not duplicate consumer signatures or examples, the Table
plugin protocol or ordering, tree rendering, current audit results,
implementation steps, or shared modality and direction rules. It links to their
canonical owners.
