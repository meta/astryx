---
schema_version: 3
template_version: 7
kind: component
id: component:ListInput
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
    packages/core/src/ListInput/ListInput.test.tsx,
    packages/core/src/ListInput/ListInput.fr10.test.tsx,
    packages/core/src/Field/fieldInputFamily.test.tsx,
    packages/core/src/ListInput/__tests__/ListInputReorder.a11y.chromium.spec.ts,
    packages/lab/src/__tests__/ReorderGripPinchZoom.a11y.chromium.spec.ts,
    packages/lab/src/ListInput/index.test.ts,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:input-fields]
design_specs: [design:ordered-collection-reordering, design:reduced-motion]
architecture:
  [
    architecture:component-theming-surface,
    architecture:internationalization,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-017, spec:AST-085, spec:AST-086, spec:AST-103]
---

# ListInput component contract

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/lab/src/ListInput/index.ts"]
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `ListInput` and the types `ListInputProps`, `ListInputChange`, `ListInputColumn`, `ListInputRenderContext`, and `ListInputValueContext` from `@astryxdesign/core`. Props: `label`, `description`, a controlled `value` and `onChange`, `getItemKey`, `createItem`, `columns`, `itemName`, the three status inputs, `reorderable`, `isDisabled`, `isLoading`, `maxItems`, `isLabelHidden`, `isOptional`, `isRequired`, a `ref`, and the `container*` and `control*` styling props. |
| Behavior                | A Field-labelled `role="group"` holds an ordered list of records and an Add action. Each record renders one caller control per column and a Remove action. Add, Remove, and edits go to `onChange` with a change descriptor. With `reorderable`, each record takes core List's reorder handle, and moves go to the object's `onReorder`, never to `onChange`.                                                                                                                     |
| End-user impact         | Keyboard and screen-reader users hear each add and removal once the app applies it, and focus goes to the record that the change concerns. Disabled and busy controls stay focusable.                                                                                                                                                                                                                                                                                             |
| Builder impact          | Keep `value` in state, give each record a stable key, and render each field with an Astryx input. A Lab import reaches the Core component.                                                                                                                                                                                                                                                                                                                                        |
| Compatibility/readiness | Additive Core export. The `@astryxdesign/lab` exports re-export the Core ones (FR12); whether they carry `@deprecated` is open (OQ1).                                                                                                                                                                                                                                                                                                                                             |
| Review checks           | Reject a move that reaches `onChange`, an announcement or focus move for a change the value does not apply, root styling props, a disabled or busy control that leaves the tab order, or an English literal in a label or announcement.                                                                                                                                                                                                                                           |
| Governing rules         | `family:input-fields` FR10; `spec:AST-103` FR1, FR2, FR5; `spec:AST-085` FR1, FR2, FR4; `spec:AST-086` FR9; `architecture:internationalization` INV1a; `design:ordered-collection-reordering`.                                                                                                                                                                                                                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

ListInput edits a short, ordered collection of simple records with the same
fields, such as guests or tag options. It owns the collection's semantics, its
add, remove, and reorder affordances, the focus and announcements that follow a
change, and where validation shows. The app owns the records and renders each
field with an Astryx input. Consumer usage lives in `ListInput.doc.mjs`.

## Compatibility and migration

- Released default preserved: not yet released in Core; the Lab component's
  props keep their meaning and defaults
- Compatibility class: additive Core export; the Lab exports re-export the Core
  ones (FR12)
- Controlled/uncontrolled behavior: controlled only; the component holds no
  records of its own
- Migration decision: open (OQ1)

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The Field label, description, and status, and the group element: its role,
  name, description, `aria-disabled`, `aria-busy`, and the `list-input` target
  (FR1, FR10).
- The record list and its semantics, the visible column labels, and each
  field's accessible name after the first record (FR2).
- The Add and Remove actions, the change descriptors they report, and the
  focus and announcements that follow them (FR3, FR4, FR5).
- The reorder handle's place in each record (FR6).
- Where list, record, and field statuses show (FR8).

**Does not own / non-goals**

- The records, their keys, and their validation — product callsite.
- Each field's control — the caller's `renderInput`, with an Astryx input.
- The reorder session: dragging, reorder mode, its hint, and its move
  announcements — owned by `spec:AST-103` and List's reorder session.
- Label and status rendering — owned by `component:Field`.
- Long or complex collections — not provided; a Table or a dedicated flow
  holds them.

## Public concepts

| Concept       | Closed values or states                 | Meaning                                                           | Availability by variant/orientation/state | Default            | Owner                 | Stability | Invalid-value behavior                        |
| ------------- | --------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------- | ------------------ | --------------------- | --------- | --------------------------------------------- |
| Change        | `add`, `update`, `remove`               | What one `onChange` call did, with the record and its index.      | Every `onChange` call.                    | none               | `component:ListInput` | Stable    | Not applicable.                               |
| Record key    | a string or a number from `getItemKey`  | The identity that focus, statuses, and reordering follow.         | Always; required.                         | required           | `component:ListInput` | Stable    | A duplicate key warns in development.         |
| Record noun   | a string                                | The singular noun that labels and announcements name a record by. | Always.                                   | the catalog's noun | `component:ListInput` | Stable    | Not applicable.                               |
| Reorderable   | a `createReorderable` object, or absent | Each record takes a reorder handle; absent means no reordering.   | Always.                                   | absent             | `spec:AST-103`        | Stable    | TypeScript rejects other values.              |
| Busy          | off, on (`isLoading`)                   | The values may still change; every change control is inert.       | Always.                                   | off                | `component:ListInput` | Stable    | Not applicable.                               |
| Maximum count | a number, or absent                     | Add becomes unavailable at the count; nothing is removed.         | Always.                                   | absent             | `component:ListInput` | Stable    | A `value` above the count keeps every record. |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision. A `current` contract contains no unresolved rows.

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Basis                                                                           | Draft review state |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------ |
| FR1  | ListInput renders `component:Field` with `label`, `description`, `status`, `isLabelHidden`, `isOptional`, and `isRequired` around one element with `role="group"`. The label names the element and the description and list status describe it, each joined with a caller's `aria-labelledby` and `aria-describedby`. The element carries the `list-input` target, which reflects `state` (`loading` or `disabled`) and `reorderable`.                                                                                                                                                                                                                                                   | Documented promise; current source and tests                                    | settled            |
| FR2  | The records are an ordered list: each record is a list item with its position and the record count. Each record renders one cell per column through the column's `renderInput`, which gets the record, its index, the field's accessible name, `isLabelHidden`, the field status, `isDisabled`, `isLoading`, and `updateItem`. The first record shows the column labels. A later record's field is named by its column header, the record noun, the position, and the count.                                                                                                                                                                                                             | Documented promise; current source and tests                                    | settled            |
| FR3  | Add calls `onChange` with the value and `createItem()` last, and a change `{type: 'add', item, index}`. `updateItem` calls `onChange` with the record replaced, and a change `{type: 'update', item, previousItem, index, columnKey}`. Remove calls `onChange` without the record, and a change `{type: 'remove', item, index}`. At `maxItems`, Add is unavailable and stays focusable; Remove stays available.                                                                                                                                                                                                                                                                          | Documented promise; current source and tests                                    | settled            |
| FR4  | A pointer activation of Add keeps Add where it was in the viewport: after the new record renders, the vertical scroll containers around Add scroll by the inserted height, from the nearest out, and one animation frame later the position is checked again. A keyboard activation keeps the browser's focus behavior, and a focused field that would be hidden scrolls into view.                                                                                                                                                                                                                                                                                                      | Documented promise; current source and tests                                    | settled            |
| FR5  | An add or a removal is announced, and moves focus, only once a value applies it: a value that holds the added record's key, or no longer holds the removed record's key. The other records may change order or be replaced. An add then focuses the new record's first field; a removal focuses the Remove of the record that takes its place, or Add when there is none or it is not rendered. A value with the same keys as before the change keeps the request; a value with other keys that does not apply it ends it, with no announcement, and moves focus only when focus was lost. A change that applies later moves focus only when focus is still where it was, or on nothing. | `spec:AST-086` FR9; current source and tests                                    | settled            |
| FR6  | With `reorderable`, each record takes core List's reorder handle, named by the record noun and its position. A record that the object's `isReorderable` rejects takes no handle. The object's `handle` option sets the handle's edge and reveal; without a reveal, ListInput uses `'adaptive'`. Each move goes to the object's `onReorder({key, to})`, and a move never calls `onChange`. Without `reorderable`, records render no handle and ListInput loads no reorder code.                                                                                                                                                                                                           | `spec:AST-103` FR1, FR2, FR5; current source and tests                          | settled            |
| FR7  | `isDisabled` disables the fields through `renderInput` and makes Add, Remove, and the handles unavailable, each focusable with `aria-disabled="true"`, and sets `aria-disabled="true"` on the group. `isLoading` sets `aria-busy="true"` on the group and blocks the same changes; Add shows its busy state. A handle that becomes unavailable keeps focus and leaves reorder mode.                                                                                                                                                                                                                                                                                                      | `spec:AST-085` FR1, FR2, FR4; current source and tests                          | settled            |
| FR8  | The list status shows under the list through Field. `getItemStatus` shows a message across its record, which the record's list item references, and an error marks it invalid. `getFieldStatus` goes to the field's `renderInput` with `statusVariant: 'tooltip'`, so a field message does not change the record's height.                                                                                                                                                                                                                                                                                                                                                               | Documented promise; current source and tests                                    | settled            |
| FR9  | Every label and announcement ListInput shows or speaks is a catalog message (`architecture:internationalization` INV1a). Without `itemName`, the record noun is the catalog message `@astryx.listInput.defaultItemName`. The messages use the noun as given, with no plural ending or article, so any noun reads right.                                                                                                                                                                                                                                                                                                                                                                  | `architecture:internationalization` INV1a; current source and tests             | settled            |
| FR10 | The props type takes no root `xstyle`, `className`, or `style`; an untyped one is ignored and warns in development. `containerXstyle`, `containerClassName`, and `containerStyle` reach the Field box; `controlXstyle`, `controlClassName`, and `controlStyle` reach the group element after its own styles; and `ref`, `id`, DOM, and ARIA props reach the group element (`family:input-fields` FR10).                                                                                                                                                                                                                                                                                  | `family:input-fields` FR10; current source and tests                            | settled            |
| FR11 | An added record enters with a translate on the theme's `--duration-fast-max` and `--ease-standard`, and the records after a removal move to their new places when their sizes do not change. The motion never delays `onChange`, focus, or an announcement, and it is instant under the person's reduced-motion setting or a theme that reduces motion for everyone (`design:reduced-motion` DR1, DR2a).                                                                                                                                                                                                                                                                                 | `design:reduced-motion` DR1, DR2a; documented promise; current source and tests | settled            |
| FR12 | The `@astryxdesign/lab` exports `ListInput`, `ListInputChange`, `ListInputColumn`, `ListInputProps`, `ListInputRenderContext`, and `ListInputValueContext` re-export the Core ones, so a Lab import renders the Core component and takes the Core types.                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source and tests                                                        | settled            |

### Allowed variation

- **AV1 — Field controls.** Each column's control and its props vary; ListInput
  places the control and never inspects it.
- **AV2 — Layout width.** In a container 640 px wide or less, a record's fields
  stack with their labels repeated, and the record actions keep their column.

### Representative states

| State                | Required invariant                                                            | Allowed variation       |
| -------------------- | ----------------------------------------------------------------------------- | ----------------------- |
| Empty                | An empty state in the list; Add available.                                    | Record noun.            |
| Some records         | One list item a record; column labels on the first record only.               | Column widths.          |
| At the maximum count | Add focusable and unavailable; Remove available.                              | —                       |
| Reorderable          | One handle a record that the object accepts; none on a rejected record.       | Handle edge and reveal. |
| Disabled             | Group `aria-disabled="true"`; every action focusable and unavailable.         | —                       |
| Busy                 | Group `aria-busy="true"`; every change blocked; a focused handle keeps focus. | —                       |
| A refused change     | No announcement and no focus move, then or after the next value.              | —                       |

### Transformation and precedence order

- **ORD1 — Record noun.** `itemName`, then the catalog's noun.
- **ORD2 — Handle reveal.** The object's `handle.revealBehavior`, then
  `'adaptive'`.
- **ORD3 — A change's focus.** The Add anchor focuses an added record's first
  field first; the change's own focus move then does not repeat it.

### Performance and resources

- **PR1 — No standing observer.** ListInput adds no resize or scroll observer.
  The Add anchor's measurements and its one animation frame run only for the
  activation that starts them.

Current measurements belong in the audit record; this subsection owns only
durable constraints and their verification target.

## Accessibility contract

- **AR1 — The collection is a named group and an ordered list.** The Field
  label names the group, and each record is a list item with its position and
  the count (FR1, FR2).
- **AR2 — A change speaks once, when it applies.** The polite channel speaks an
  add or a removal once a value applies it, and never for a change the app
  refuses (FR5).
- **AR3 — Focus follows a change, not a request.** Focus moves to the record a
  change concerns only when the change applies and focus has not moved, and
  otherwise only when focus was lost (FR5).
- **AR4 — Unavailable stays discoverable.** Disabled and busy actions and
  handles keep their tab stops and announce as unavailable (FR7).

## Design relationships

| Anatomy or state | Design requirement                                       | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Reorder handle   | `design:ordered-collection-reordering`                   | prescribed               | Supporting     | FR6                |
| Label and status | Field's label, helper text, and status around the group. | `component:Field`        | Supporting     | FR1, FR8           |

## Family and system relationships

- `family:input-fields` FR10 sets how a component that composes Field takes
  base props and styling; ListInput follows it as CheckboxList and RadioList
  do.
- `spec:AST-103` owns the reorderable object, the drag, reorder mode, and the
  handle's reveal; ListInput places the handle and keeps moves out of
  `onChange`.
- `spec:AST-085` keeps unavailable controls focusable; `spec:AST-086` joins the
  announcements of one frame.
- `architecture:internationalization` INV1a makes every string a catalog
  message.

## Verification map

| Contract      | Verification                                                                                                               | Representative states                                                                                                                                                                                                                           | Mutation or failure expectation                                                                                                                   | Audit section              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| FR1, AR1      | `ListInput.test.tsx` list-semantics, status, and labelling cases                                                           | With a description; a list status; a caller's `aria-labelledby`                                                                                                                                                                                 | A group without its role or name, or a lost caller id, fails.                                                                                     | `audit:ListInput/a11y`     |
| FR2, FR3      | `ListInput.test.tsx` field-label, change-descriptor, and `maxItems` cases                                                  | First and later records; add, update, remove; at the maximum                                                                                                                                                                                    | A wrong descriptor, a lost field name, or an Add that adds past the maximum fails.                                                                | `audit:ListInput/behavior` |
| FR4           | `ListInput.test.tsx` scroll-anchor cases                                                                                   | A newly scrollable container; blur-driven validation; clipping ancestors                                                                                                                                                                        | An Add that moves under the pointer, or a hidden focused field, fails.                                                                            | `audit:ListInput/behavior` |
| FR5, AR2, AR3 | `ListInput.test.tsx` removal-focus, refused-change, later-change, sorting-owner, and replacing-owner cases                 | A synchronous change; a refused remove and add; a change the app applies later; focus moved away; an owner that sorts the records; an owner that puts a blank record in place of the last one; an owner that answers an add with another record | An announcement or focus move for a refused change, a focus move that takes focus from where the user moved it, or no focus move on apply, fails. | `audit:ListInput/a11y`     |
| FR6           | `ListInput.test.tsx` reorder cases; `ListInputReorder.a11y.chromium.spec.ts`; `ReorderGripPinchZoom.a11y.chromium.spec.ts` | End and start handles; always and adaptive; a rejected record; keyboard, mouse, and touch moves                                                                                                                                                 | A move that reaches `onChange`, a handle on a rejected record, an element added outside the handle, or reorder code without the prop fails.       | `audit:ListInput/behavior` |
| FR7, AR4      | `ListInput.test.tsx` disabled and busy cases                                                                               | Disabled; busy; a handle that becomes busy while focused                                                                                                                                                                                        | A change while disabled or busy, or an action or handle that leaves the tab order, fails.                                                         | `audit:ListInput/a11y`     |
| FR8           | `ListInput.test.tsx` validation-placement cases                                                                            | List, record, and field statuses                                                                                                                                                                                                                | A record status without its reference, or a field status that is not forwarded, fails.                                                            | `audit:ListInput/behavior` |
| FR9           | `ListInput.test.tsx` catalog-noun and empty-state cases                                                                    | No `itemName`; an override under another locale; an irregular noun                                                                                                                                                                              | An English literal, or a message that adds a plural ending or an article to the noun, fails.                                                      | `audit:ListInput/i18n`     |
| FR10          | `ListInput.fr10.test.tsx`, the shared input-fields FR10 suite; `fieldInputFamily.test.tsx` coverage                        | An untyped `className`; `container*` and `control*`; a caller `ref`, `id`, and `data-*`; a horizontal-labels FormLayout                                                                                                                         | A root styling prop that reaches the group, a `container*` prop that misses the Field box, or base props that miss the group fail.                | `audit:ListInput/api`      |
| FR11          | `ListInput.test.tsx` motion and reduced-motion cases                                                                       | An add and a removal; reduced motion                                                                                                                                                                                                            | Motion that delays `onChange` or focus, or motion under reduced motion, fails.                                                                    | `audit:ListInput/design`   |
| FR12          | Lab `index.test.ts` identity and type cases                                                                                | Lab imports                                                                                                                                                                                                                                     | A Lab export that is not the Core component, or Lab types that differ from Core's, fail.                                                          | `audit:ListInput/api`      |

## Decision log

None recorded.

## Open questions

- **OQ1 — Do the `@astryxdesign/lab` re-exports carry `@deprecated`, and in
  which release are they removed?** (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables or examples, the reorder
session's rules, Field's label rules, or family and system rules. It links to
their owners.
