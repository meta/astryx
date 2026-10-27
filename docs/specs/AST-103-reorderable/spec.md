---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-103
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:public-component-api]
affects_families: []
affects_contributing: []
affects_consumer_docs: []
---

# Reorderable collections system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/core/src/**", "packages/lab/src/**"]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

`createReorderable` applies to a whole collection: its object is passed as
the collection's `reorderable` prop. Per-item control comes from each item's
key (`itemKey`, or the collection's existing identity) and from
`isReorderable(key)`.

A person can change the order of items in a collection by dragging a row's
handle, by keyboard, or with a screen reader, and every collection that allows
it behaves the same way. A caller turns reordering on by passing one
behavior object, made once by `createReorderable`, to the collection's
`reorderable` prop, and applies the change it reports. A collection that does
not reorder loads none of it.

## Non-goals

- Moving several items in one drag, a destination predicate, moves between
  collection instances; each can be added later without changing this contract.
- Moving items between collections, freeform canvas placement, and file drops.
- Reorder motion values, thresholds, and timing: these stay internal
  (`spec:AST-002` FR3) and come from the theme's motion roles and
  `spec:AST-094`'s measured values.
- The visual treatment of a moving row and the insertion cue, which
  `design:ordered-collection-reordering` owns.

## Public contract

```tsx
import {createReorderable} from '@astryxdesign/core';

const moveTo = (items, key, to) => {
  const moved = items.find(item => item.id === key);
  const rest = items.filter(item => item.id !== key);
  return [...rest.slice(0, to), moved, ...rest.slice(to)];
};

const reorderable = useMemo(
  () =>
    createReorderable({
      onReorder: ({key, to}) => setItems(items => moveTo(items, key, to)),
    }),
  [],
);

<Button label="Move" onClick={() => reorderable.start(selectedId)} />
<List reorderable={reorderable}>
  {items.map(item => (
    <ListItem key={item.id} itemKey={item.id} label={item.name} />
  ))}
</List>;
```

A second collection uses the same object and options, wired to its own
internals. A tree reports positions as a parent and an index:

```tsx
const reorderable = createReorderable({
  onReorder: ({key, to}) => setTree(tree => moveNode(tree, key, to)),
});

<TreeList reorderable={reorderable} items={tree} />;
```

Here `to` is `{ parent, index }` and keys are the nodes' existing `id`s; the handle, keys, actions, and
announcements are those of FR3 and FR4, and the tree adds no option.

## Requirements

- **FR1 — One factory makes the behavior.** `createReorderable(options)`
  returns a reorderable object. `options` carries the change callback,
  `onReorder({ key, to })`, and an optional `isReorderable(key)` predicate;
  in the callback, `key` names the moved item by its key and `to` is the index the item has after the move, counted in the
  collection's full item order (every item it was given, mounted or not). In a
  tree, `to` is `{ parent, index }`: `parent` is the new parent's key (`null`
  at the root) and `index` is the item's position among that parent's children
  after the move (DEC-3). It carries no gesture, animation, or timing settings. An optional
  `isReorderable(key)` predicate keeps a row in place: a row it rejects shows no
  handle and cannot be picked up (DEC-2). A row it rejects at either end of the
  collection also bounds the drop range: nothing drops beyond it, and a
  keyboard or assistive-technology move past it is refused and announced (FR4).
  Each item's key comes from the data,
  never from React's `key`: List reads each `ListItem`'s `itemKey`, a string or a number, the
  shape Table's `idKey` returns, and `onReorder` reports that key as given;
  a collection whose items already carry an identity, such as TreeList's `id`
  or Table's `idKey`, uses it; and a data collection without one takes
  `idKey` in Table's shape, a field name or a function of the item (DEC-4). A row without a key shows no handle and cannot be
  picked up. The
  object is meant to be created once per collection, for example with
  `useMemo`; one created again on each render still works, because the
  collection uses the latest callbacks when a move commits and a new object
  during a drag does not cancel the drag. One object passed to two
  collections reorders each on its own and moves nothing between them; its
  `start` targets the collection mounted last, with a development warning.
- **FR2 — Present means enabled.** A collection that accepts reordering takes
  the object through one `reorderable` prop; there is no separate boolean.
  With the prop absent the collection renders no handle, registers no reorder
  listener, and loads no reorder code: a collection imports none of
  it until the object is passed.
- **FR3 — Every collection drags the same way.** Each adopting collection
  wires the object to its own internal drag, keyboard, and
  assistive-technology paths, and the behavior is the same in every one:
  - a drag starts from a row's handle (`design:ordered-collection-reordering`
    DR1); under a finger, a hold on the handle picks the row up at
    `spec:AST-094`'s values, and a flick still scrolls;
  - a drag commits once, at the drop (DR4), and `onReorder` is called once
    for it; a cancelled drag calls nothing;
  - under Reduce Motion the dragged row still follows the finger or pointer,
    and the other rows and the drop take their places without travel
    (`design:reduced-motion` DR1–DR3; a mouse drop follows DR3).
- **FR4 — Reorder mode is the one path without a drag.** Each reorderable
  row's handle is a toggle button named "Reorder" and the row's label, with
  `aria-pressed`. Activating it, by click, Enter, or Space, enters reorder
  mode for that item, and a mouse, a keyboard, and assistive technology all
  use it (`spec:AST-094` FR39). In reorder mode:
  - the arrow keys move the item along the layout axis: Up and Down in a
    vertical collection, Left and Right in a horizontal one, and all four in
    a two-dimensional layout such as a grid or a wrapping board, where Left
    and Right move to the previous and next position in reading order,
    mirrored in right-to-left, and Up and Down move to the same column in the
    previous or next row, or to that row's last position when it is shorter;
    rows and columns come from the measured layout, and `to` stays the final
    index in the full order; in a tree, Up and Down move among visible positions,
    and Left and Right move the item out of or into a parent where
    `isReorderable` allows;
  - each move commits at once through `onReorder({ key, to })`, so the data,
    the screen, and the announcement always agree;
  - each move is announced once, after it renders, through the shared polite
    announcement channel, inside a modal as `spec:AST-086` FR14 requires, naming the item, its position and count, and its
    neighbors, such as "Milk, position 3 of 5, after Eggs, before Bread";
    the first and last positions say "at the top" and "at the end", a
    two-dimensional layout adds the row and column, such as "Milk, row 2,
    column 3, position 8 of 12", and a tree adds the parent;
  - a move past a row `isReorderable` rejects at either end of the
    collection is refused and announced, such as "Can't move past Pinned";
    a rejected row in the middle is passed over, as a drag passes it (FR1);
  - focus stays on the handle, and the row scrolls into view;
  - Escape, or activating the handle again, leaves reorder mode and keeps
    every move, announcing "Done" with the item's position, such as "Done,
    Milk at position 3 of 5";
  - while the item is in reorder mode, a hint anchored to it shows the moves
    for its axis and a Done control, with the same layer, anchoring, and
    theme roles as Core's keyboard hint, and stays until the mode ends; each
    move in the hint is a button that does exactly what its key does, with
    the same announcement and focus on the handle, and Done leaves the mode
    as Escape does, so a pointer or a finger can reorder by tapping the
    handle, then the move buttons, then Done;
  - the hint is a part named in each adopting collection's anatomy; it is a
    layer that follows `family:overlay-dismissal`; it uses
    the layer, anchoring, and theme roles of Core's keyboard hint, whose
    public API is unchanged, and unlike that hint its buttons take taps and
    are exposed to assistive technology.
- **FR4a — An app can start reorder mode.** The object exposes one method,
  `start(key)`, which enters FR4's reorder mode for that item from the app's
  own UI, such as a toolbar button or a Move item in a menu.
  Focus moves to that item's handle, which scrolls into view, the hint
  appears, and the announcements and exits are FR4's. A key that is not
  reorderable, not mounted, or not found does nothing and warns in
  development. The mode ends through Escape, Done, the handle, or the item
  unmounting, so there is no `stop`. Nothing else on the object is public;
  `start` and the handle enter the same mode.
- **FR5 — Reordering adds at most one element to a row.** The one added
  element is the handle, the interactive drag target, with its role. Its grip
  is decoration, drawn by a pseudo-element or a theme-role glyph, not by
  elements. The moving row is the row itself, moved in place, not a copy
  (`architecture:component-style-authoring` INV7). Reorder listeners are per
  collection or on the document, never per row (`spec:AST-094` FR24).
- **FR6 — Stable from the start.** `createReorderable`, its options, and a
  collection's `reorderable` prop are stable public Core API: no
  `_experimental` name and no experimental subpath (DEC-1). `spec:AST-017`
  FR21 and DEC-28 apply only to an API chosen as experimental.
- **FR7 — Admitted and documented as public API.** `reorderable` is caller
  intent no collection can derive (`spec:AST-002` FR1, DEC-1), and its
  thresholds stay internal (`spec:AST-002` FR3). `createReorderable` has its
  own canonical descriptor and each adopting collection's descriptor documents
  `reorderable` (`spec:AST-039` FR1, FR3).
- **FR8 — One public shape for the job.** A collection that reorders uses
  this object and no other public reorder API.

## Current-state impact

- `component:List` gains `reorderable` as the first adopter.
- No collection in Core reorders by drag today. Tokenizer reports a
  `reorder` change (`spec:AST-056`); bringing it onto this object is
  follow-up work. A Lab collection that reorders adopts this object.

## Verification

| Contract            | Verification                                                                                     | Representative states                                                                                                                                                                                                                                                              | Mutation or failure expectation                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR6–FR8        | Public-API review, type tests, and descriptor checks                                             | the factory's options; a collection's `reorderable` type; the factory's and List's descriptors                                                                                                                                                                                     | an extra gesture, timing, or animation option, an experimental name or subpath, a missing descriptor, or a second public reorder API, fails                                                                                                                   |
| FR2                 | Bundle and runtime check of a collection with and without the prop                               | without the prop; with the prop                                                                                                                                                                                                                                                    | reorder code in the bundle, a handle, or a reorder listener without the prop fails; the measured cost is recorded in the pull request                                                                                                                         |
| FR3                 | Browser tests with real touch input and a mouse (`spec:AST-013` FR10)                            | a hold and drag; a flick; a drop; a cancelled drag; Reduce Motion                                                                                                                                                                                                                  | a drag that starts off the handle, a commit before the drop, two callbacks for one drag, a callback on cancel, or travel under Reduce Motion fails                                                                                                            |
| FR4                 | Keyboard, mouse, and announcement-routing tests of reorder mode (`spec:AST-009` FR17)            | entering by click, Enter, and Space; arrows in vertical, horizontal, and grid collections; Up, Down, Left, and Right in a tree; each move's announcement at the top, middle, and end; a move past a rejected row; Escape and a second activation; focus and scroll after each move | a move that does not commit at once, an announcement missing, repeated, or before render, a move past a rejected row at either end, or a mid-list rejected row that blocks a move, focus leaving the handle, or moves undone on exit fails                    |
| FR4 hint            | Browser tests with a mouse, a finger, and a keyboard                                             | the hint's axis in vertical, horizontal, and grid collections; each move button and Done; a tap-only reorder; the hint's theme roles                                                                                                                                               | a hint off the keyboard hint's layer, anchoring, or theme roles, buttons that ignore taps or are hidden from assistive technology, a button whose move or announcement differs from its key, focus leaving the handle, or a hint that outlives the mode fails |
| FR4 two-dimensional | Keyboard and announcement-routing tests on a wrapping card grid, left-to-right and right-to-left | Left and Right across a row end; Up and Down between full rows and into a short last row; announcements with row and column; the hint's four buttons; a resize that changes the column count                                                                                       | a move off reading order, a mirrored direction wrong in right-to-left, a short-row move that is not clamped to its last position, a missing row or column, or a column count read from anything but layout fails                                              |
| FR4a                | Keyboard, mouse, and announcement-routing tests of `start(key)`                                  | `start` from a context-menu item and a toolbar button; a key that is not reorderable, not mounted, or unknown; an object re-created each render; one object on two collections                                                                                                     | `start` that does not focus and scroll to the handle, a hint or announcement that differs from the handle's mode, a missing-key call that throws or acts, or a two-collection call without a development warning fails                                        |
| FR5                 | Element and listener counts of a list with and without the prop                                  | a row at rest; a row picked up                                                                                                                                                                                                                                                     | more than one added element per row, a grip drawn with elements, a per-row listener, or a copy of the moving row, fails                                                                                                                                       |

## Decision log

### DEC-1 — Reorderable is stable public API

**Reference:** `spec:AST-103/DEC-1`
**Decider:** `cixzhang`, `2026-10-25`

Reordering is a capability callers build on, so `createReorderable` and a
collection's `reorderable` prop are stable public API from the start, with no
experimental name or subpath.

Rejected: shipping it as experimental first.

### DEC-2 — A predicate keeps a row in place

**Reference:** `spec:AST-103/DEC-2`
**Decider:** `cixzhang`, `2026-10-25`

Some rows must not move, such as a pinned first row, and a person should see
that before trying. An optional `isReorderable(key)` predicate marks them: the row
shows no handle and cannot be picked up, as a UIKit table's `canMoveRow` does.
The name follows Astryx's `is…` predicate convention.

Rejected: no per-row control, with unwanted moves ignored after the drop.

### DEC-3 — A move names the item by its key

**Reference:** `spec:AST-103/DEC-3`
**Decider:** `cixzhang`, `2026-10-25`

`onReorder` receives the moved item's key and its new position, and
`isReorderable` receives a key, so the contract names items by key everywhere. A
key stays correct when a list is virtualized and when a tree moves an item
between parents, where a pair of indices would not. A caller that filters the
items it passes maps `to` back to its full list.

Rejected: `onReorder(from, to)` with a pair of positions.

### DEC-4 — The reorder key comes from the data

**Reference:** `spec:AST-103/DEC-4`
**Decider:** `cixzhang`, `2026-10-25`

React does not pass `key` to a component, so a collection cannot rely on it.
A `ListItem` names its item with one `itemKey` prop, and a data collection
without an identity of its own takes `idKey` in Table's shape, a field name
or a function of the item, so the same job keeps one name. `itemKey` is a new name because no row prop
carries item identity today: `value` on option-like rows is the selected value
a form reads, a different job. A collection whose items already carry an
identity, such as TreeList's `id` or Table's `idKey`, uses it rather than a
second one, since no new API shares a job with an existing one.

Rejected: reading each direct child's React `key`.

### DEC-5 — Reorder mode, not a move menu, is the path without a drag

**Reference:** `spec:AST-103/DEC-5`
**Decider:** `cixzhang`, `2026-10-25`

Move menus are tiring for keyboard users. The handle instead toggles a reorder
mode in which the arrow keys move the item and each move is announced with its
position and neighbors. Each move commits at once, so leaving the mode keeps
the moves and the app never undoes several commits; focus stays on the handle
until Escape or a second activation.

While the mode is on, a hint anchored to the item shows the moves and Done,
and its glyphs are buttons, so a sighted person who does not want to drag can
tap through the same moves; it reuses the keyboard hint's layer rather than a
second hint pattern.

Rejected: a menu of Move before and Move after.

## Open questions

None.
