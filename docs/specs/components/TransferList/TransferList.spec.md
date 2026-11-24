---
schema_version: 3
template_version: 7
kind: component
id: component:TransferList
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang, imdreamrunner]
review_triggers:
  [public-api, behavior, layout, theming, accessibility, interaction]
verified_by:
  [
    packages/core/src/TransferList/TransferList.test.tsx,
    packages/core/src/TransferList/TransferList.composition.test.tsx,
    packages/core/src/TransferList/TransferList.doc.test.mjs,
    packages/core/src/TransferList/TransferListSelector.test.tsx,
    packages/core/src/TransferList/__tests__/TransferListReorder.a11y.chromium.spec.ts,
    packages/lab/src/__tests__/ReorderGripPinchZoom.a11y.chromium.spec.ts,
    packages/lab/src/TransferList/index.test.ts,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: [design:ordered-collection-reordering]
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:internationalization,
  ]
contributing: []
system_specs: [spec:AST-017, spec:AST-056, spec:AST-085, spec:AST-103]
---

# TransferList component contract

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/lab/src/TransferList/index.ts"]
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `TransferList`, `TransferListOption`, `TransferListProps`, and `transferListVars` from `@astryxdesign/core`. Props: `label`, `isLabelHidden`, `description`, `options`, a controlled `value` and `onChange`, `isDisabled`, `selectedLabel`, `availableLabel`, `hasSearch`, `searchLabel`, `searchPlaceholder`, `emptySearchText`, `reorderable`, `hasSelectAll`, `hasClear`, `renderOption`, `selectedEmptyText`, `availableEmptyText`, a root `ref`, and BaseProps. |
| Behavior                | Two labelled panels of semantic lists: the selected values in `value` order and the remaining options. A row's Add or Remove commits at once through `onChange`; Add all and Clear commit in bulk; a search filters both panels; with `reorderable`, the selected rows reorder through Core List's handle.                                                                                                                                                           |
| End-user impact         | Keyboard and screen-reader users reach every action as a named button, hear each accepted change, keep their place after a transfer, and find disabled and busy actions in the tab order.                                                                                                                                                                                                                                                                            |
| Builder impact          | Keep `value` in state; pass `reorderable={createReorderable(…)}` to reorder. A Lab import reaches the Core component.                                                                                                                                                                                                                                                                                                                                                |
| Compatibility/readiness | Additive Core export. The `@astryxdesign/lab` exports re-export the Core ones (FR11); whether they are deprecated is OQ1.                                                                                                                                                                                                                                                                                                                                            |
| Review checks           | Reject a listbox or option role on the panels or rows, a transfer that announces a change the owner did not accept, a native `disabled` on a row or bulk action, a theme target on a node that paints nothing, a second name for the empty-search state, or a reorder API other than `reorderable`.                                                                                                                                                                  |
| Governing rules         | `spec:AST-103` FR2, FR8 (`reorderable`); `spec:AST-056` FR1–FR3 (`emptySearchText`); `spec:AST-085` FR1 (focusable disabled); `architecture:component-theming-surface` INV2, INV4, INV6; `architecture:public-component-api` DEC-1; `design:ordered-collection-reordering`.                                                                                                                                                                                          |

This table is a review projection; the body below is authoritative.

## Intent

TransferList chooses an ordered subset of a known set of options: it moves each
option between a selected panel and an available panel, and orders the
selected values. It owns the two panels, the row actions, the bulk actions, the
search across both panels, and the announcements of each change. The caller
owns the value, its persistence, and any draft. TransferListSelector puts it in
a selector popover (`component:TransferListSelector`). Consumer usage lives in
`TransferList.doc.mjs`.

## Compatibility and migration

- Released default preserved: not yet released in Core; the Lab component's
  props keep their meaning and defaults
- Compatibility class: additive Core export; the Lab exports re-export the Core
  ones (FR11)
- Controlled/uncontrolled behavior: controlled only; the list holds only its
  search query and the state of a gesture in progress
- Migration decision: open (OQ1)

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The root group, its name and description, and the `transfer-list` target
  (FR1).
- The two panels, their headings, their lists, their empty messages, their
  layout, and the `transfer-list-panel` and `transfer-list-item` targets (FR2,
  FR3).
- The row actions, the bulk actions, the focus after a transfer, and the
  announcements of transfers and search results (FR4, FR5, FR6).
- Which selected rows show a reorder handle, and the moves it hands the owner
  in `value`'s terms (FR7).
- The disabled and busy states of its actions (FR8, FR9).

**Does not own / non-goals**

- The reorder gestures, reorder mode, its hint, and its announcements — owned
  by `spec:AST-103` and Core List's reorder engine.
- The selector field, its popover, and staged commits — owned by
  `component:TransferListSelector`.
- Persistence, drafts, saved views, and limits on how many values are
  selected — product callsite.
- Virtualization of a large option set — not provided.

## Public concepts

| Concept       | Closed values or states                                | Meaning                                                               | Availability by variant/orientation/state       | Default        | Owner                    | Stability | Invalid-value behavior                                                |
| ------------- | ------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------- | -------------- | ------------------------ | --------- | --------------------------------------------------------------------- |
| Value         | `ReadonlyArray<T>` of option values                    | The selected values, in their order.                                  | Always; required.                               | required       | `component:TransferList` | Stable    | A value with no option renders no row and keeps its place in `value`. |
| Transfer lock | `isTransferDisabled` on an option                      | The option stays in its panel.                                        | Every option.                                   | off            | `component:TransferList` | Stable    | Not applicable.                                                       |
| Reorder       | absent, or a `Reorderable<T>` from `createReorderable` | Whether the selected rows reorder, and which values keep their place. | The selected panel, while no search filters it. | absent         | `spec:AST-103`           | Stable    | TypeScript rejects any other object.                                  |
| Empty search  | `ReactNode`                                            | What a panel shows while the search matches none of its options.      | While a search is active.                       | `'No results'` | `spec:AST-056`           | Stable    | Not applicable.                                                       |
| Disabled      | off, on                                                | Every action and the search field are unavailable but focusable.      | Always.                                         | off            | `component:TransferList` | Stable    | Not applicable.                                                       |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                                                                                             | Draft review state |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------ |
| FR1  | The root is one element with `role="group"`, or the caller's `role`, named by `label` and described by `description`, each joined with a caller's `aria-labelledby` or `aria-describedby`. `isLabelHidden` hides the label and keeps the name. The root carries the `transfer-list` target. `ref`, root `xstyle`, `className`, `style`, and the other base props reach the root.                                                                                                                                                                                                                     | Documented promise; current source and tests                                                      | settled            |
| FR2  | Two panels, selected then available, each a `role="group"` named by its heading (`selectedLabel`, else "Selected"; `availableLabel`, else "Available") and holding one list. They sit side by side with one divider; in a container narrower than 40rem they stack, clip nothing, and grow to their rows. Otherwise each panel body scrolls between `--transfer-list-panel-min-block-size` and `--transfer-list-panel-max-block-size`, which `transferListVars` exposes. Each panel carries the `transfer-list-panel` target, reflecting `side`; the wrapper that lays the panels out carries none.  | Documented promise; `architecture:component-theming-surface` INV2, INV4; current source and tests | settled            |
| FR3  | The selected panel lists the options of `value` in its order; the available panel lists the other options in `options` order, under a heading for each `group` when any option has one, with the ungrouped ones under "Other". A row shows `renderOption(option)`, else the label, and ends with Remove ("Remove {label}") or Add ("Add {label}"). Each row carries the `transfer-list-item` target, reflecting `side`, `state` (`enabled` or `disabled`), and, while the selected rows reorder, `reorder` (`movable` or `fixed`). An empty panel shows `selectedEmptyText` or `availableEmptyText`. | Documented promise; `architecture:component-theming-surface` INV6; current source and tests       | settled            |
| FR4  | Add appends the option's value to `value`; Remove removes it. Each calls `onChange` once with the next array, announces the option and the new selected count politely, and moves the focus to the action at the same index in the same panel, else the last one, else the search field when shown, else the panel. An option with `isTransferDisabled` never moves: its action is disabled and focusable, with `disabledMessage`, else "{label} cannot be moved", as its tooltip.                                                                                                                   | Documented promise; `spec:AST-085` FR1; current source and tests                                  | settled            |
| FR5  | With `hasSelectAll`, Add all appends every transfer-enabled option that is not selected, in `options` order. With `hasClear`, Clear removes every transfer-enabled selected value. Each announces how many values moved, and is disabled and focusable when it would move none.                                                                                                                                                                                                                                                                                                                      | Documented promise; current source and tests                                                      | settled            |
| FR6  | With `hasSearch`, one search field, named by `searchLabel`, else "Search {label}", filters both panels on each option's label, its string `description`, and its `group`, without regard to case; the value does not change. A query that matches announces how many options match. A panel with no match shows `emptySearchText`, else "No results"; when no option matches, the list announces the text that message renders. Emptying the query announces nothing.                                                                                                                                | `spec:AST-056` FR1–FR3, AR1, AR2; current source and tests                                        | settled            |
| FR7  | With `reorderable`, each selected row reorders through Core List's handle, placed and revealed by the object's `handle` option: at the row's end and always shown unless the option says otherwise. A value the object's `isReorderable` rejects shows no handle and keeps its place; at either end of the list it also keeps the others from moving past it. Each move calls the object's `onReorder({key, to})`, `to` being the value's index in `value` after the move. A search pauses reordering; without `reorderable`, the selected rows keep their order.                                    | `spec:AST-103` FR2, FR3, FR8; current source and tests                                            | settled            |
| FR8  | `isDisabled` makes every Add, Remove, Add all, Clear, reorder handle, and the search field disabled and focusable; option messages do not apply; each disabled handle's tooltip says "{label} cannot be reordered"; a disabled row dims once.                                                                                                                                                                                                                                                                                                                                                        | `spec:AST-085` FR1; documented promise; current source and tests                                  | settled            |
| FR9  | While its TransferListSelector has a change pending, every Add, Remove, Add all, and Clear that could act is `aria-busy` and `aria-disabled`, stays focusable, makes no change, and announces nothing. After a transfer, the focus still moves to the next action, busy as it is.                                                                                                                                                                                                                                                                                                                    | `component:TransferListSelector` FR4; current source and tests                                    | settled            |
| FR10 | Every string the list shows or announces comes from the provider's catalog, and every visible one also has a prop that replaces it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `architecture:internationalization`; current source                                               | settled            |
| FR11 | The `@astryxdesign/lab` `TransferList`, `TransferListOption`, `TransferListProps`, and `transferListVars` exports re-export the Core ones, so a Lab import renders the Core component and takes the Core props.                                                                                                                                                                                                                                                                                                                                                                                      | Current source and tests                                                                          | settled            |

### Allowed variation

- **AV1 — Row content.** `renderOption` varies a row's content; the row keeps
  its action, its constraints, and its reorder handle.
- **AV2 — Panel height.** A theme varies the two panel-body bounds through
  `transferListVars`.

### Representative states

| State                    | Required invariant                                                                            | Allowed variation            |
| ------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------- |
| Default                  | Two named panels; each row ends with its named action.                                        | Row content (AV1).           |
| Grouped and locked       | Group headings in the available panel; a locked option's action is focusable with its reason. | —                            |
| Searching, partial match | Both panels filtered; a panel with no match shows `emptySearchText`.                          | —                            |
| Searching, no match      | Both panels show `emptySearchText`, and its text is announced.                                | —                            |
| Reorderable              | Movable rows end with a handle; a row that keeps its place has none and keeps the columns.    | Handle placement and reveal. |
| Disabled                 | Every action focusable and disabled; rows dimmed once.                                        | —                            |
| Busy (in a selector)     | Every action that could act is busy and focusable; no change and no announcement.             | —                            |
| Narrow container         | One column; the panels clip nothing.                                                          | —                            |

### Transformation and precedence order

- **ORD1 — Selected rows.** `value`, mapped to options, then the search filter;
  a reorder move maps back from the shown rows to `value`.
- **ORD2 — An action's availability.** `isDisabled`, then `isTransferDisabled`,
  then a pending change (FR9).

### Performance and resources

- **PR1 — Reorder code comes with the object.** The list loads no reorder code
  of its own; the engine arrives with the owner's `reorderable` object
  (`spec:AST-103` FR2).

Current measurements belong in the audit record; this subsection owns only
durable constraints and their verification target.

## Accessibility contract

- **AR1 — Groups and lists, not a listbox.** The root and each panel are named
  groups and each panel holds a semantic list, because each row carries
  interactive actions, which an option role does not permit.
- **AR2 — Each accepted change is announced once.** Add, Remove, Add all,
  Clear, and search results are announced politely from the action that caused
  them; a change the owner refuses is not announced (FR4, FR5, FR6, FR9).
  Reorder announcements are the List engine's (`spec:AST-103` FR4).
- **AR3 — The focus stays put.** After a transfer the focus moves to the next
  action in the same panel (FR4); disabled and busy actions stay in the tab
  order (FR8, FR9).
- **AR4 — The search field has a name.** Its accessible name is `searchLabel`,
  else "Search {label}", never its placeholder (`spec:AST-056` AR2).

## Design relationships

| Anatomy or state | Design requirement                     | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------- | ------------------------ | -------------- | ------------------ |
| Reorder handle   | `design:ordered-collection-reordering` | Prescribed               | Supporting     | FR7                |
| Panels and rows  | Two unframed lists beside one divider. | Current source and docs  | Prominent      | FR2, FR3           |
| Bulk actions     | Text actions in the panel headers.     | Current source and docs  | Supporting     | FR5                |

## Family and system relationships

- `spec:AST-103` owns `reorderable` and the reorder behavior every reorderable
  collection shares; TransferList adapts the owner's object to its shown rows.
- `spec:AST-056` owns the name and type of the empty-search state and how it is
  announced.
- `spec:AST-085` FR1 keeps disabled actions focusable.
- `component:TransferListSelector` hosts the list in a selector popover and
  tells it when a change is pending.

## Verification map

| Contract      | Verification                                                                                                                     | Representative states                                  | Mutation or failure expectation                                                                                       | Audit section                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| FR1, FR2, AR1 | `TransferList.test.tsx` structure, naming, layout-wrapper, and theme-target cases; `themingTargets.test.ts`                      | Default; hidden label; caller ARIA                     | A listbox role, an unnamed panel, or a target on the layout wrapper fails.                                            | `audit:TransferList/a11y`     |
| FR2           | `TransferListReorder.a11y.chromium.spec.ts` clip cases                                                                           | Phone layout; desktop width                            | A panel that clips in the phone layout, or does not at a desktop width, fails.                                        | `audit:TransferList/design`   |
| FR3, FR4, AR3 | `TransferList.test.tsx` transfer, focus, and transfer-lock cases                                                                 | Add; Remove; a locked option                           | A second `onChange`, a moved locked option, or focus that leaves the panel fails.                                     | `audit:TransferList/behavior` |
| FR5           | `TransferList.test.tsx` bulk cases                                                                                               | Add all; Clear with locked values                      | A locked value that moves, or a bulk action enabled with nothing to move, fails.                                      | `audit:TransferList/behavior` |
| FR6, AR4      | `TransferList.test.tsx` search and announcement cases; `TransferListSelector.test.tsx` search case                               | A match; no match; an element as `emptySearchText`     | A count announced for no match, or an announcement that differs from the shown message, fails.                        | `audit:TransferList/a11y`     |
| FR7           | `TransferList.test.tsx` reorder cases; `TransferListReorder.a11y.chromium.spec.ts`; `ReorderGripPinchZoom.a11y.chromium.spec.ts` | Keyboard, mouse, and touch moves; fixed rows; a search | A move in the wrong terms, a fixed row passed at an end, or a handle while searching fails.                           | `audit:TransferList/behavior` |
| FR8           | `TransferList.test.tsx` disabled cases; `TransferListReorder.a11y.chromium.spec.ts` disabled cases                               | Disabled list; disabled mid-reorder                    | A native `disabled` on an action, or a focus drop, fails.                                                             | `audit:TransferList/a11y`     |
| FR9, AR2      | `TransferListSelector.test.tsx` pending-change cases                                                                             | A pending `changeAction`                               | An announced transfer the selector dropped, a busy action that is not `aria-disabled`, or a native `disabled`, fails. | `audit:TransferList/a11y`     |
| FR11          | Lab `index.test.ts` identity and props-type cases                                                                                | Lab imports                                            | A Lab export that is not the Core one, or Lab props that differ from Core's, fail.                                    | `audit:TransferList/api`      |

## Decision log

None recorded.

## Open questions

- **OQ1 — Do the `@astryxdesign/lab` re-exports of `TransferList`,
  `TransferListOption`, `TransferListProps`, and `transferListVars` carry
  `@deprecated`, and in which release are they removed?** (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables or examples, the reorder
rules of `spec:AST-103`, or the search vocabulary of `spec:AST-056`. It links
to their owners.
