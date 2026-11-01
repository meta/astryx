---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-057
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
phase: accepted
owners: [cixzhang]
affects_architecture:
  [
    architecture:interaction-modality,
    architecture:public-component-api,
    architecture:react-component-runtime,
  ]
affects_families: []
affects_contributing: [contributing:api-conventions]
affects_consumer_docs: [Item, List, ListItem]
review_triggers: [public-api, accessibility, behavior]
---

# Swipe actions on `Item` system spec

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "public-api": [
      "FR1",
      "FR2",
      "FR3",
      "FR9",
      "FR10",
      "FR11",
      "DEC-1",
      "DEC-3",
      "DEC-4",
      "DEC-6",
      "DEC-8"
    ],
    "accessibility": ["AR1", "AR2", "AR3"],
    "behavior": ["FR4", "FR5", "FR6", "FR7", "FR8", "DEC-2", "DEC-5"]
  }
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Item` carries swipe actions for a finger, a pen, and horizontal wheel input through one prop, `swipe`, whose value comes from `createSwipe({leading?, trailing?, swipeBehavior?})` (DEC-8). Each side declares the verbs a sideways drag uncovers as `SwipeAction[]` — `label`, `icon`, `onActivate`, `variant`, `hasRemoval` — and `Item` renders the panel from them (DEC-1). `swipeBehavior` is `reveal` (rest open) or `commit` (fire on release) (DEC-2). The swipe's code lives in the constructor's module, so an app that never imports `createSwipe` ships none of it (FR10). The capability is `Item`'s, available on any row whose role permits interactive descendants — a `listitem`, a role-less row — and out of scope where it does not (`option`, `menuitem*`, a radio) (DEC-3). No hover reveal and no mouse-drag swipe (DEC-4); a trackpad's horizontal scroll swipes as a finger does (DEC-7). No new DOM: the row's root translates and its panels counter-translate (DEC-5). |
| Behavior                | A sideways drag by a finger or a pen, or a horizontal wheel gesture, moves the row and uncovers the side's panel. Under `reveal` (default) the row rests open so each action is tappable and a long drag fires the outermost; under `commit` the row slides out and the outermost fires; nothing rests. After an action fires the row springs back, or holds out when the action has `hasRemoval` — one bit the component cannot infer, independent of the model. The component waits for nothing afterwards. A short release springs back under both. A mouse never starts the drag; a mostly vertical drag stays the scroller's; a pointer anywhere outside a resting row closes it.                                                                                                                                                                                                                                                                                                              |
| End-user impact         | A person on a phone gets the flick they expect on a mail row or a settings row, with the row's own look. A pen, or a trackpad's horizontal scroll, swipes the row the same way; a mouse drag, a keyboard, or a screen reader meets the row exactly as today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Builder impact          | One prop on `Item` (and so on `ListItem`), `swipe={createSwipe({trailing: [{label: 'Archive', icon: <Icon icon={ArchiveIcon} />, onActivate: archive, hasRemoval: true}]})}`; optionally `swipeBehavior` in the same options. Every field is known before the gesture begins, so the component paints the panel from data. The group around the rows clips in the inline axis — `List` does it; any other host does it once. The consumer documentation states that a verb reachable only by swipe is unreachable by keyboard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Compatibility/readiness | `swipe` is absent by default; every row without it keeps its DOM and paint exactly. The released `swipeActions` and `swipeBehavior` props and their `ItemSwipe*` types are deprecated in a patch with no runtime warning (DEP-0017) and removed at the next minor (CLN-0025); `astryx upgrade` rewrites them to `swipe={createSwipe(…)}`. Implementation gap: `swipe` and `createSwipe` are not built (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Review checks           | Reject a hover-revealed panel or a mouse drag that reveals one; swipe actions on a row whose role forbids interactive descendants; a model restricted by host; `commit` with several entries on a side and no warning; a panel exposed to the tree while closed; any element added to `Item` for the panels; `overflow: hidden` on the group where `clip` is meant; a row exit or enter animation introduced under this record; `hasRemoval` read as an obligation, a warning, or a timing rule; a second adaptive media query; swipe code in or reachable from `Item` or `ListItem` other than DEP-0017's released loader and released row style, or either of them outside the deprecated path; a second way to configure swipe actions.                                                                                                                                                                                                                                                          |
| Governing rules         | [`architecture:interaction-modality`](../../architecture/interaction-modality.md) INV4, INV6, INV7; [`spec:AST-002`](../AST-002/spec.md) FR1, FR4, FR15, FR16, `DEC-1`; [`architecture:public-component-api`](../../architecture/public-component-api.md) INV2, INV3, INV5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

This table is a review projection; the body below is authoritative.

## Intent

On a phone, a person flicks a row sideways to get at a verb — archive,
delete, mark unread, select. Astryx rows do not flick. This record adds the gesture to `Item`, the row primitive, so a `ListItem`
and a bare `Item` in a product's own markup swipe the same way. The rule for where it is available is the row's role: a swipe panel's
controls are interactive descendants of the row, so swipe actions exist on
any row whose role permits them — a `listitem`, a row with no role at all —
and not on one whose role forbids them. That sorts the list row and the
standalone row in, and the option, menu-item and radio rows out, without
naming a component; a row type nobody has written yet sorts itself.

The gesture is an accelerator for a finger, a pen, and a trackpad: it adds a
faster path to a verb under a finger, a pen, or a trackpad's horizontal scroll, and changes
nothing for a mouse drag, hover, or the keyboard. Each side's
verbs are declared as data — a label that names the state the verb reaches,
an icon, a handler, how it looks, and whether the row holds out afterwards —
so the component knows everything it needs before the finger moves: what to
paint, what to fire, and where the row rests when it is done. The row's own root moves
and its panels stay put, so no element is added to any row.

## Ownership boundary

**Owns**

- The public shape of `Item`'s swipe actions: the `swipe` prop,
  `createSwipe` and its options, `SwipeAction` and its fields, the
  per-side arrays, `swipeBehavior`, and the opaque `Swipe` value.
- Where the swipe's code lives: in the constructor's module, never in `Item`
  or `ListItem`, except DEP-0017's released loader and released row style,
  which serve the deprecated path only.
- The rule for where swipe actions are available: the row's role.
- The two models, `reveal` and `commit`, meaning the same thing wherever
  swipe actions are available.
- The finger and trackpad behavior: rest or fire, the accelerator, where the row
  rests after an action, one open row at a time, and how a row closes.
- The anatomy the gesture uses: two out-of-flow positions on `Item`'s
  existing root, the root's translation and the panels' counter-translation,
  and the group's inline clip.
- The accessibility contract of the gesture itself: what the panel exposes
  while resting and while closed, and that a mouse drag and hover touch nothing.

**Why no existing record can hold it**

- [`architecture:interaction-modality`](../../architecture/interaction-modality.md)
  is `current` and owns the rule the gesture must respect — INV7 "essential
  actions remain reachable" — but owns no public API. A record carries one
  `authority` value, so adding unapproved API claims to it would present
  them as approved (`architecture:knowledge-contracts` INV1, INV14).
- `Item` has no component record. This record is the first durable decision
  about `Item`'s public surface; `component:Item`, when written, inherits
  these claims rather than re-deciding them. Of `Item`'s seven in-core renderers, six give the row a role that forbids
  interactive descendants and are out of scope; `ListItem` and a bare `Item` in caller markup — which the system's own
  templates render inside a `BottomSheet` and on a page — are the rows this
  record serves: two real consumers, one home, and the prop stays on the
  primitive (DEC-3).
- [`component:List`](../components/List/List.spec.md) is
  `current` and owns List's geometry; it gains the inline clip and cites
  this record.
- [`spec:AST-002`](../AST-002/spec.md) owns admission: the caller owns which
  verbs earn a gesture and which model fits them, and the component cannot
  derive either.

## Non-goals

- **What else the row offers.** A row's visible controls — a menu or buttons
  in `endContent`, its own primary — are `Item`'s existing composition and
  are not governed, paired, or checked here. The consumer documentation
  states the obligation; the component does not police it.
- **A hover-revealed action panel on a fine pointer** (DEC-4).
- **Animating a row's exit or enter.** Not settled here: a row the caller
  removes after an action unmounts as any row does today. When it is
  settled, the likely form is imperative (`handleRef`, as `Selector` and
  `MultiSelector` expose open/close) so enter can be animated too. `hasRemoval` is not it: it says only where the row
  rests after an action, and a row that holds out and is never removed sits
  off-screen — the caller's bug, which that eventual API is what makes
  graceful.
- **A render prop for a custom panel.** Deferred, not foreclosed: a
  `render*`-shaped addition can land when a caller needs something the
  vocabulary cannot say (DEC-1).
- **Gesture tuning.** Axis-lock distance, commit ratio, fling velocity, slide
  and spring durations, resistance past the panel: behavior constants in
  source, not public API and not design tokens (the same ruling the touch
  press model received for its clocks).
- **Vertical swipes**, and a swipe whose only
  meaning is dismissal (Toast already has that in `useToastGesture`).
- **Public out-of-flow slots on `Item`.** Deliberately not admitted: the
  panel positions are internal, rendered from `swipe`. A second
  consumer — an accent bar, a slide-in checkbox, a drag handle — is a
  `component:Item` anatomy record with its own admission argument.
- **Swipe actions on an element that is not an `Item`.** `createSwipe`
  configures `Item`; attaching its result to any other element is not
  admitted.
- **A programmatic open or close.** Not admitted: a swipe panel's open state
  belongs to the gesture, and the one coordination case met in practice — a
  resting row closing when a neighbour's drag starts — is already a pointer
  outside the row (FR7). No product has asked, and the row this gesture was modelled on exposes no
  such handle. If one ever does, `handleRef` is the established pattern to add
  it with, as `Selector` and `MultiSelector` expose open/close/toggle.
- **Rows whose role forbids interactive descendants.** Swipe actions are
  available on a row whose role permits interactive descendants, because a
  swipe panel's controls are interactive descendants of the row; a
  `listitem` and a role-less `Item` qualify, and "it'll just work" there. A
  row whose role forbids them is out of scope as a consequence: `option`
  (inside a `listbox`), `menuitem`, `menuitemcheckbox`, `menuitemradio`, and
  a row that is the enlarged target of a native radio. This is a scope
  boundary, not a per-call or per-model restriction, so `swipeBehavior`
  means one thing everywhere swipe actions exist. In core today that
  excludes `SelectorOption`, the four `DropdownMenu` rows, and
  `RadioListItem`, and includes `ListItem` and every bare `Item`.
- Equivalent internal implementations remain valid when they satisfy this
  contract. Internal modules, files, function names, algorithms, data
  structures, storage layouts, manifests, journals, locks, transaction
  protocols, and CI job/workflow topology belong in architecture or
  implementation unless callers or interoperating systems intentionally depend
  on that exact mechanism as a public protocol.

## Evidence: in the repository

| Where                                                                                                                                                                                              | What it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Item`'s root: `position: relative`, `borderRadius`, `paddingInline`; no `overflow`, `isolation`, or `z-index`; the focus-within outline is painted on this root; `themeProps('item')` lands on it | The root is already a containing block for absolutely positioned children, and transforming it moves its outline and its theme target with it — nothing on it fights a `transform`. Only the component that owns this element can translate it.                                                                                                                                                                                                                                                                                                                   |
| `Item`'s content: `marker`, a `startContent` span, the label element (a span, an anchor in `href` mode, a `<button>` in `onClick` mode), an `endContent` span — four siblings in every render mode | Nothing can move four siblings as one unit except a common parent. The root is that parent already.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ListItem` renders `<Item as="li">` directly under `List`'s `<ul role="list">`                                                                                                                     | Any wrapper around the row is a non-`li` child of `<ul>`: invalid HTML and a broken "list, N items" announcement. The gesture has to live on `Item`.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `List`'s root sets no `overflow`                                                                                                                                                                   | A translated row paints past the list's inline edge unless the group clips. `overflow-inline: clip` clips without creating a scroll container; `hidden` would create one and fight the list's vertical scroller.                                                                                                                                                                                                                                                                                                                                                  |
| `useToastGesture` drives Toast's slide by writing `--_toast-swipe-y` onto the root with `style.setProperty`; Toast's styles consume it in `transform`                                              | The in-core way a gesture moves a component without re-rendering it: a custom property on the root, read by CSS.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| The AppShell/Field ruling of 2026-09-04: a `z-index` adjustment stays local inside an `isolation: isolate` container                                                                               | The panel must paint above the root's background and below its content; `isolation: isolate` on the root with the panel at `z-index: -1` does that without reaching outside the row.                                                                                                                                                                                                                                                                                                                                                                              |
| `DropdownMenu.items`, `MoreMenu.items`, `DropdownMenuItemData`                                                                                                                                     | Core already declares a verb as data — a label, an icon, a handler, `isDisabled`, a `variant` — and data mode "renders through `DropdownMenuItem`, so the two APIs describe the same thing". `SwipeAction` is that shape.                                                                                                                                                                                                                                                                                                                                         |
| `useMenuPress.onActivate(row, release)`, `useTreeFocus.onActivate`, `Selector` and `TreeList` wiring                                                                                               | Core's word for "this row's verb fired" when the path is a release, a key, or a pointer and not a click. A commit fires on release with no click at all.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ProgressBar.variant` defaults to `'accent'`                                                                                                                                                       | In-core precedent for `accent` as a variant word and as a default on a filled surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `hasSearch`, `hasCreate`, `hasPaging`, `hasHomeEnd` vs `isLoading`, `isOpen`, `isDisabled`                                                                                                         | Core's two boolean prefixes: `has*` declares that a thing has a property; `is*` names a state it is currently in. Whether the row holds out after an action is a property of the action, so `has*`.                                                                                                                                                                                                                                                                                                                                                               |
| `Item` consumers: `DropdownMenuItem`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioItem`, `DropdownMenuSubMenu`, `SelectorOption`, `RadioListItem`, `ListItem`                                    | Six of seven in-core renderers give the row a role that forbids interactive descendants (`option` from `Selector`'s listbox, the three `menuitem*` roles, and `RadioListItem`'s delegation to a native radio where the input is the option's sole focusable); they are out of scope. `ListItem` renders `role="listitem"` under `role="list"`. The system's own templates render a bare `Item` with no `role` at all (a `BottomSheet` snap-point demo, a table-filter page, a hook demo), so the standalone row is a real consumer and sorts in by the same rule. |
| `Toast/useToastGesture.ts`                                                                                                                                                                         | A shipped commit-only swipe whose one meaning is dismissal, with constants (`SWIPE_DISMISS_RATIO`) in source.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Real-device feedback on an earlier implementation of this gesture                                                                                                                                  | On an iOS device the swipe required a press-and-hold before it would start, and the row background did not restore until release. Chromium evidence alone did not predict device behavior.                                                                                                                                                                                                                                                                                                                                                                        |
| The product row this gesture was modelled on                                                                                                                                                       | Its panel names the **state** ("Unread") where a menu would name the sentence ("Mark as unread"). A toggle swipes back; a verb with no single instant (snooze) opens a chooser.                                                                                                                                                                                                                                                                                                                                                                                   |

## Cases the contract serves

| Case                                                                                     | Served | How                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mail: archive and delete                                                                 | Yes    | Two entries in `trailing`, both `hasRemoval`, Delete `variant: 'destructive'`. Under `reveal` the panel rests open with both; a long drag fires the outermost; the row holds out and the caller removes it. |
| One destructive action                                                                   | Yes    | One entry with `variant: 'destructive'` and, if it removes the row, `hasRemoval`. Under `commit` the row slides out and it fires; it holds out or springs back by the bit.                                  |
| Reversible toggle (read/unread, pin/flag)                                                | Yes    | `label` names the state the verb reaches ("Unread"); no `hasRemoval`. Under `reveal` the row springs back wearing it; under `commit` it slides out, fires, and springs back wearing it.                     |
| Archive — removes the row but is not destructive                                         | Yes    | `hasRemoval` without `variant: 'destructive'`. The axes are independent: all four combinations occur (DEC-1).                                                                                               |
| Soft delete with Undo — destructive but row stays                                        | Yes    | `variant: 'destructive'` without `hasRemoval`: the row springs back.                                                                                                                                        |
| More than two actions                                                                    | Yes    | N entries on a side, outermost last. Under `reveal` each is a button.                                                                                                                                       |
| An action that confirms or opens a chooser                                               | Yes    | No `hasRemoval`: the row springs back and `onActivate` opens the dialog; the caller removes the row on confirmation. A verb with no single instant (snooze) commits to opening its chooser.                 |
| Rows in a virtualized list                                                               | Yes    | Open state is the row's own; a row that unmounts takes it along. A mostly vertical drag stays the scroller's (FR6).                                                                                         |
| Rows that are links (`href`)                                                             | Yes    | The axis lock separates the drag from the tap, and the click the browser synthesizes after a drag is swallowed (FR6).                                                                                       |
| `role="list"` rows                                                                       | Yes    | `ListItem` inherits the prop; arbitrary interactive children are valid.                                                                                                                                     |
| A bare `Item` outside a list (a sheet row, a card row)                                   | Yes    | No role, so interactive descendants are permitted; the prop is `Item`'s and the host clips its own group (FR9).                                                                                             |
| A row whose role forbids interactive descendants (`option`, `menuitem*`, a radio target) | **No** | Out of scope by the role rule (Non-goals). Not a model restriction — swipe actions are simply not available there.                                                                                          |
| A panel the vocabulary cannot draw                                                       | **No** | Not in this record. A `render*` addition is the deferred route (DEC-1).                                                                                                                                     |
| Dismiss-only swipe (Toast)                                                               | **No** | Owned by `useToastGesture`; a different concept with one meaning per direction.                                                                                                                             |

## Public API and concepts

| Concept                           | Closed values or states                                                                                                                                             | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Default  | Owner                       | Stability |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------- | --------- |
| `Item.swipe`                      | `Swipe`                                                                                                                                                             | The row's swipe actions, configured by one `createSwipe` call. Inherited by `ListItem` and every host that renders an `Item`. `Item` reads the configuration and hands its root to the runtime the value carries; `Item` holds no swipe code of its own (FR10).                                                                                                                                                                                                                                                                                      | absent   | `spec:AST-057`              | proposed  |
| `createSwipe`                     | `(options: CreateSwipeOptions) => Swipe`                                                                                                                            | Exported from `@astryxdesign/core/Swipe` and the package root. A plain function, not a hook: callable at module scope, outside a render, and on the server, and doing no DOM work when imported or called. Its module carries the swipe's runtime (FR10). The swipe carries no built-in text: every name it exposes is a caller's `label`.                                                                                                                                                                                                           | —        | `spec:AST-057`              | proposed  |
| `CreateSwipeOptions`              | `{leading?: readonly SwipeAction[]; trailing?: readonly SwipeAction[]; swipeBehavior?: SwipeBehavior}`                                                              | The verbs a sideways drag uncovers on each side, outermost last, and what a swipe does on both sides. `leading` is uncovered by a drag toward the inline end, `trailing` by one toward the inline start.                                                                                                                                                                                                                                                                                                                                             | —        | `spec:AST-057`              | proposed  |
| `Swipe`                           | opaque                                                                                                                                                              | The configured swipe actions. Callers create it only through `createSwipe` and pass it only to `swipe`; its contents are not public.                                                                                                                                                                                                                                                                                                                                                                                                                 | —        | `spec:AST-057`              | proposed  |
| `SwipeAction`                     | `{id?: string; label: string; icon?: ReactNode; onActivate: () => void \| Promise<void>; isDisabled?: boolean; variant?: SwipeActionVariant; hasRemoval?: boolean}` | One verb. `Item` renders it as a filled surface in its `variant`'s colour with the icon above the label; `label` is the button's accessible name under `reveal` and names the **state** the verb reaches ("Unread"). Every field is known before the gesture begins.                                                                                                                                                                                                                                                                                 | —        | `spec:AST-057`              | proposed  |
| `SwipeActionVariant`              | `'neutral'` \| `'accent'` \| `'destructive'`                                                                                                                        | How the action looks: ordinary, the one you mean, the dangerous one. Not a status set — a verb is not a state. Minted here (DEC-6).                                                                                                                                                                                                                                                                                                                                                                                                                  | `accent` | `spec:AST-057`              | proposed  |
| `hasRemoval`                      | `false`, `true`                                                                                                                                                     | After this action activates, the row holds out rather than springing back. Only that: not a promise the caller removes the row, not an animation, not a timing rule. Independent of `swipeBehavior` and of `variant`; all combinations occur.                                                                                                                                                                                                                                                                                                        | `false`  | `spec:AST-057`              | proposed  |
| `onActivate`                      | called on tap of a resting panel, on the full-swipe accelerator, and on a `commit` release                                                                          | Core's word for a verb firing by any path. Not `onClick`: a commit fires with no click. Fires once the row's content has left its box (FR5).                                                                                                                                                                                                                                                                                                                                                                                                         | —        | `spec:AST-057`              | proposed  |
| `swipeBehavior` (`SwipeBehavior`) | `'reveal'` \| `'commit'`                                                                                                                                            | Applies to both sides. `reveal`: a release opens or closes the row by its speed, then by half the panel's width, and the open row rests with every entry a real button; a full swipe fires the outermost (FR5). `commit`: a lift past the confirm point slides the row out and fires the outermost entry; nothing rests; the panel is presentational; valid for one entry per side, warns with more. A commit is not a removal: the row springs back unless the entry has `hasRemoval`. `commit` means the same on every row that has swipe actions. | `reveal` | `spec:AST-057`              | proposed  |
| the panels                        | two out-of-flow positions on `Item`'s root                                                                                                                          | Absolutely positioned children of the existing root at the inline start and end, painting above the root's background and below its content; present only when the side has entries. Internal anatomy with a theme target; not public slots.                                                                                                                                                                                                                                                                                                         | —        | `spec:AST-057`              | proposed  |
| the drag's travel                 | a private custom property on the row root                                                                                                                           | Written by the gesture during a drag. The root's `transform` reads it; each panel's `transform` reads its negation, so the row moves and the panel appears fixed in the space the row vacates.                                                                                                                                                                                                                                                                                                                                                       | `0px`    | `spec:AST-057`              | proposed  |
| the group's clip                  | `overflow-inline: clip` on the element containing the rows                                                                                                          | A moving row paints past its group's inline edge unless the group clips. `List` sets it; a host that renders `Item`s outside `List` sets it once. `Item` cannot clip itself: it is the thing moving.                                                                                                                                                                                                                                                                                                                                                 | —        | `component:List` / the host | proposed  |
| open state                        | closed, resting open                                                                                                                                                | The row's own. A pointer landing anywhere outside a resting row closes it, which is also how a drag on a neighbour closes it; no group state exists.                                                                                                                                                                                                                                                                                                                                                                                                 | closed   | `spec:AST-057`              | proposed  |
| the modality split                | internal                                                                                                                                                            | A mouse drag never starts the swipe; a finger's or a pen's pointer event or a horizontal wheel gesture does, read from the input event, not a prop or a media query (`architecture:interaction-modality` INV6).                                                                                                                                                                                                                                                                                                                                      | —        | `spec:AST-057`              | proposed  |

Not public: axis-lock distance, commit ratio, fling velocity, durations,
resistance, panel widths, the custom property's name. They are behavior
constants.

## Requirements

### Behavioral contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Basis                                                                                          | Verification state                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- |
| FR1  | `Item` MUST take its swipe actions as one prop, `swipe`, whose value is the `Swipe` that `createSwipe(options)` returns, where `options` is `{leading?: readonly SwipeAction[]; trailing?: readonly SwipeAction[]; swipeBehavior?: SwipeBehavior}` and `SwipeAction` is `{id?, label: string, icon?: ReactNode, onActivate, isDisabled?, variant?: 'neutral' \| 'accent' \| 'destructive', hasRemoval?: boolean}` with `variant` defaulting to `accent`. An entry MUST NOT carry a node the component renders as the control. `Swipe` MUST be opaque, made only by `createSwipe`. `ListItem` MUST pass `swipe` through unchanged. The deprecated `swipeActions` and `swipeBehavior` props follow DEP-0017.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | DEC-1, DEC-8; `DropdownMenu.items` data mode                                                   | Proposed                                  |
| FR2  | `Item` MUST render each side's panel from its entries into an out-of-flow position on its existing root and MUST add no element to the row for it. The gesture MUST drive the row's travel by writing a custom property on the root; the root's transform MUST read it and each panel's transform its negation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | DEC-5; `useToastGesture`                                                                       | Proposed; real-Chromium evidence required |
| FR3  | `swipeBehavior` MUST be one closed union, `SwipeBehavior`, with the values `reveal` and `commit`, default `reveal`, applying to both sides. `commit` with more than one entry on a side MUST warn in development, because the other entries have no touch path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | DEC-2                                                                                          | Proposed                                  |
| FR4  | A sideways drag by a finger or a pen, or a horizontal wheel gesture, MUST move the row and uncover the side's panel, showing each entry's `label` and `icon` as a filled surface in its `variant`'s colour; while a full swipe is confirmed (FR5) the outermost entry alone MUST cover the uncovered space; the panel MUST NOT be visible at rest, by any pixel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Real-browser finding: a zero-width panel still paints its padding                              | Proposed; real-Chromium evidence required |
| FR5  | Under `reveal`, a release goes by its speed first: at the release speed or faster it opens the row while the row is opening and closes it while it is closing; a slower one opens the row past half the panel's width and closes it short of that. Speed alone MUST NOT fire an entry. Dragged past the confirm point, the row MUST run ahead toward its far edge with the outermost entry covering its place while the finger stays down; a lift still past the confirm point MUST fire the **outermost** entry and no other, at any speed; a swipe that confirmed and came back short of the confirm point MUST close the row and fire nothing; a disabled outermost entry MUST NOT confirm. Under `commit`, only a lift past the confirm point MUST slide the row out and fire the outermost entry; every other release closes; nothing MUST rest. After any entry fires, under either model, the row MUST spring back unless the entry has `hasRemoval`, in which case it MUST hold out at the edge it travelled toward. That bit is the only thing an entry declares about the row; the component MUST NOT wait on, observe, or act on what the caller does next, and MUST NOT warn if a held-out row is never removed. A release short of the threshold MUST spring back under both models. Under reduced motion the slide out, the spring back, and the hold-out follow `design:reduced-motion`: the row reaches its resting place with no travel or spring and cross-fades (DR2) when a finger started the swipe, or, when a pen or a trackpad did, cross-fades on a coarse primary pointer (DR2) and arrives at once otherwise (DR3). `onActivate` MUST fire once the row's content has left its box, and may return a Promise. | DEC-1, DEC-2; UIKit `performsFirstActionWithFullSwipe`                                         | Proposed; real-device evidence required   |
| FR6  | The drag MUST decide its axis once, early, and a mostly vertical drag MUST stay the scroller's. A mouse MUST NOT start the drag. The click the browser synthesizes after a drag MUST NOT fire the row's primary action.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Press-model ORD1                                                                               | Proposed; real-device evidence required   |
| FR7  | An open row (resting open, or settling open from the release that opened it) MUST close on a pointer landing anywhere outside it, on a touch tap on its own content, on a scroll of anything that holds it while focus is outside its open panel, on Escape with focus inside it, on firing an entry, and on unmount. That tap MUST activate nothing and paint no press, an exception to the cell press profile of `spec:AST-094` FR11. Because a drag on a neighbour is a pointer outside it, at most one row is open at a time without any shared state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | DEC-3; SwiftUI `swipeActionsContainer()` for the outcome                                       | Proposed                                  |
| FR8  | Directions MUST be logical: `trailing` is uncovered by a drag toward the inline start and sits at the inline end; `leading` the reverse; so the finger, the uncovered edge, and the panel agree under RTL.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `architecture:public-component-api` INV2 (logical direction)                                   | Proposed                                  |
| FR9  | The element containing swipe-capable rows MUST clip in the inline axis with `overflow-inline: clip`, never `hidden`. `List` MUST set it; `Item`'s consumer documentation MUST state the obligation for any other host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | DEC-5; `List` root styles                                                                      | Proposed                                  |
| FR10 | The `createSwipe` module MUST import every module the swipe runs on — the shared gesture core, the animator, the panels' rendering, and the row's gesture code — statically. `Item` and `ListItem` MUST import none of these swipe modules and MUST NOT load them with `import()`; the touch modules `Item` uses for other jobs, such as press feedback, are outside this rule. DEP-0017 makes two exceptions, both on the deprecated path only: `Item`'s released loader, which loads the swipe code with `import()` the first time a row has `swipeActions`, and the released row style `Item` applies from that row's first render. An app that never imports `createSwipe` therefore loads no swipe code unless a row uses the deprecated props, and a row given `swipe` is swipeable at its first paint. Importing or calling `createSwipe` MUST do no DOM work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | DEC-8; `architecture:public-component-api` INV19; `architecture:react-component-runtime` INV13 | Proposed                                  |
| FR11 | A caller MAY call `createSwipe` inline in a render. A new `Swipe` value MUST NOT close an open row, restart a settle, or attach the gesture again; the row reads the latest value's entries and handlers, so a handler sees the caller's latest state, and a changed entry list repaints the panel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | DEC-8                                                                                          | Proposed                                  |

### Accessibility contract

- **AR1 — The panel is real while resting and absent while closed.** Under
  `reveal`, while the row rests open each entry MUST be a real, focusable
  `<button>` named by `label`, so a touch screen reader that lands on it can
  activate it; while closed the panel MUST be out of the accessibility tree
  and the tab order. Under `commit` the panel MUST be presentational
  (`aria-hidden`) at all times, because nothing in it is ever tappable.
- **AR2 — A mouse drag never swipes a row.** A mouse drag and hover MUST NOT
  uncover the panel, and on a pointer that can hover a closed row's
  `swipe` MUST have no effect on the tab order, the accessible tree, or
  the row's paint. A pen's drag (`spec:AST-094` FR43), a trackpad's horizontal scroll swipe, or a mouse's
  horizontal wheel, which sends the same events, MAY uncover the panel (DEC-7), and a row it leaves resting open follows AR1.
- **AR3 — The row's primary stays one tab stop.** `swipe` MUST NOT
  change the primary element's role or name, MUST NOT change its activation
  while the row is closed, and MUST add no stop while closed. While the row is
  open, a touch tap on its content closes it (FR7); keyboard activation is
  unchanged.
- **Stated in documentation, not enforced:** a swipe is a touch accelerator,
  so a verb reachable only by swipe is unreachable by keyboard and by a mouse
  drag.
  The consumer documentation of `swipe` MUST say so and MUST show the
  verb also reachable through the row's own content. The component does not
  inspect what else the row offers.

### Platform support

- Supported feature/engine floor: every supported renderer and browser.
  A finger's or a pen's swipe is read from its pointer event; a
  trackpad's from a horizontal `wheel` gesture, which has no pointer type. A
  mouse's horizontal wheel sends the same events and swipes the same way,
  since the page cannot tell the two apart; a mouse drag never swipes.
- Unsupported behavior: a device with no touch screen, no pen, and no
  horizontal wheel input gets no swipe, and a mouse drag never swipes; nothing else
  changes.
- Browser evidence: FR2 and FR4–FR9 are paint and gesture claims. jsdom has
  neither; real-Chromium evidence with dispatched touch is required, and
  FR5/FR6 additionally need a physical touch device, because Chromium evidence
  for this gesture has not predicted device behavior.

## Current-state impact

- Implementation gap: `swipe`, `createSwipe`, and the types
  `SwipeAction`, `SwipeActionVariant`, `SwipeBehavior`,
  `CreateSwipeOptions`, and `Swipe` are not built. `Item`
  takes the released `swipeActions` and `swipeBehavior` and loads its swipe
  layer with `import()` the first time a row has swipe actions, so the
  gesture goes live a moment after the row paints.
- `Item` gains `swipe`, and Core exports `createSwipe` with the types
  `SwipeAction`, `SwipeActionVariant`, `SwipeBehavior`,
  `CreateSwipeOptions`, and `Swipe`; `Item` gains two out-of-flow panel
  positions on its root with a theme target, and the root and panel
  transforms. No new element, no gesture on any row that does not ask for
  it. `component:Item`, when written, inherits these claims.
- `ListItem` inherits the released `swipeActions` and `swipeBehavior`
  through its existing `Item` passthrough, deprecated by DEP-0017; the
  `swipe` prop is not built, on `Item` or on `ListItem`.
- `architecture:react-component-runtime` INV13 gains the constructor route
  for an opt-in touch behavior with a large resource cost: `Item` and
  `ListItem` import none of the swipe modules, and its failure signal names
  DEP-0017's released loader and released row style as the only exceptions,
  on the deprecated path only.
- `architecture:public-component-api` INV19 names `swipe={createSwipe(…)}`
  as its plug-in example (DEC-8).
- `component:List` gains the inline clip on `List`'s root, citing this
  record.
- `architecture:interaction-modality` gains `spec:AST-057` in its deciding
  specs; no invariant changes.
- `contributing:api-conventions` gains the rule this record relies on: a
  gesture is an accelerator and never a component's only path to its own
  behavior.
- `spec:AST-058` takes nodes where this record takes objects, on the shared principle in
  DEC-1: the picker places its actions; `Item` renders its panel.
- No shipped public API changes on this record's own merge.
- While this record is `draft` its `review-applicability:v1` block routes
  nothing: global routing loads `current` claims only
  (`architecture:knowledge-contracts` INV20).

## Verification

| Contract      | Verification                                                                                                                                                                                                                               | Representative states                                                                                                                                                                                                                                                                                                                                                                                                                | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR3      | `Item` and `ListItem` prop-surface suites plus exported-type checks                                                                                                                                                                        | One, two, and four entries per side; every `variant` × `hasRemoval` combination; `commit` with two entries on a side; `Swipe` built by hand                                                                                                                                                                                                                                                                                          | A field with a node the row renders as the control, a silent multi-entry `commit`, a `Swipe` a caller can build without `createSwipe`, or `ListItem` reshaping the prop fails.                                                                                                                                                                                                                                                        |
| FR2           | `Item` DOM snapshot suite plus real-Chromium evidence                                                                                                                                                                                      | No swipe actions; one side; both sides; each render mode (`onClick`, `href`, delegation, parent role); mid-drag                                                                                                                                                                                                                                                                                                                      | A new element in any row, a changed DOM on an existing row, a panel that moves with the row, or a panel painted under the root's background or over the content fails.                                                                                                                                                                                                                                                                |
| FR4–FR6, FR8  | Real-Chromium dispatched-touch evidence plus physical-device check; RTL via the direction provider                                                                                                                                         | Rest; a slow release short of and past half the panel; a fast release opening and closing from a short drag; a confirmed full swipe lifted, backed out, and on a disabled outermost entry; a flick under `commit`; both models; both sides; `hasRemoval` and plain entries under each; vertical drag; mouse drag; RTL; a trackpad's horizontal scroll and a mouse's horizontal wheel; a mouse drag, which must not swipe; a pen drag | A resting sliver, a fire from speed alone, a backed-out swipe that fires or rests open, a disabled outermost entry that confirms, a confirmed swipe whose outermost entry does not cover the row, `onActivate` before the row's content has left its box, a rest under `commit`, the wrong entry fired, a plain entry that holds out, a `hasRemoval` entry that springs back, a warning on a held-out row, or a mirrored panel fails. |
| FR7           | `Item` suite with two rows under one parent                                                                                                                                                                                                | Open one, drag the other; outside tap; a touch tap on the open row's content; a tap while the row settles open; a scroll of the list and of the page with focus outside the open panel and with focus inside it; Escape; entry fired; unmount                                                                                                                                                                                        | Two rows open, a row that stays open after any closing event, a tap on an open row's content that activates the row or paints a press, or a scroll that closes the row while focus is inside its open panel, fails.                                                                                                                                                                                                                   |
| FR9           | `List` style assertion plus real-Chromium evidence of a row dragged past the edge                                                                                                                                                          | A row at the list's inline edge mid-drag; the list scrolled vertically                                                                                                                                                                                                                                                                                                                                                               | A horizontal scrollbar, the row painting past the list, or `hidden` where `clip` is specified fails.                                                                                                                                                                                                                                                                                                                                  |
| FR10          | The touch-support bundle guard (main's checks plus one entry for `createSwipe`) and a package-size check: each public import built with the pull-request size report's esbuild options (minified ESM), measured gzipped, base against head | `Item` alone; `ListItem` alone; `Item` with `createSwipe`; every public import that renders an `Item` row; a server import of `createSwipe`                                                                                                                                                                                                                                                                                          | A swipe module imported by `Item` or `ListItem`; an `import()` reachable from `Item` other than DEP-0017's released loader; swipe code in `Item` other than that loader and the released row style, or either of them outside the deprecated path; `Item` alone or `ListItem` alone larger, gzipped, than on the base; or DOM work on importing or calling `createSwipe` fails.                                                       |
| FR11          | `Item` suite re-rendering with a new `Swipe` value                                                                                                                                                                                         | Closed, resting open, and settling; the same entries; a changed entry list; a changed handler                                                                                                                                                                                                                                                                                                                                        | A new value that closes the row, restarts the settle, or attaches the gesture again, a stale handler, or a panel that keeps the old entries fails.                                                                                                                                                                                                                                                                                    |
| AR1–AR3       | Accessible-tree and tab-order assertions, open and closed, both models; hovering-pointer evidence                                                                                                                                          | Closed; resting open; `commit` mid-drag; touch screen-reader cursor on an entry; keyboard activation of the primary while the row is open; hover and Tab on a fine pointer; a trackpad horizontal scroll that opens a row; a mouse drag                                                                                                                                                                                              | A panel exposed while closed, a `commit` panel in the tree, an entry without a name while resting, a changed primary, a panel a mouse drag or hover uncovers, or any effect on a closed row under a hovering pointer fails.                                                                                                                                                                                                           |
| Documentation | Consumer-doc check on `swipe`                                                                                                                                                                                                              | The prop's documentation                                                                                                                                                                                                                                                                                                                                                                                                             | A doc that does not state the keyboard consequence or the group clip fails.                                                                                                                                                                                                                                                                                                                                                           |

Known verification gap: none of the suites above exist on `main`, and no
component implements the contract. This record is `draft`, does not govern
review, and names no implementation.

## Decision log

Every decision below records the owner's direction; the record is `draft`
until `approved_by` is set.

### DEC-1 — Swipe actions are declared as data

**Reference:** `spec:AST-057/DEC-1`
**Decider:** `cixzhang`, `2026-10-02`

`createSwipe`'s `leading` and `trailing` are `SwipeAction[]`: `{id?, label,
icon?, onActivate, isDisabled?, variant?, hasRemoval?}`. `Item` renders each entry —
under `reveal` as a real button, under `commit` as a presentational block —
and paints the panel during the drag from the data.

An object is needed where the component renders the thing; a node works where it only places it (`spec:AST-058` DEC-1 draws the same line from the other side, and its picker-row actions are nodes because the picker only places them in a cell). `Item` paints and animates the panel, so every field is known before the gesture begins; a caller's own node could do neither without registering through a context, which splits the API into nodes that get the behavior and nodes that silently do not. Core already declares a verb as data
in `DropdownMenu.items` and `MoreMenu.items`, and two independent vibe-test recall probes — one for this record, one for
`spec:AST-058` — found every builder reaching for exactly this array with no
prop names given, and none reaching for child components or a render prop.

The vocabulary: `onActivate` is core's word for a row's verb firing by a
path that is not a click (`useMenuPress`, `useTreeFocus`, `Selector`,
`TreeList`), and a commit fires on release with no click at all. `variant` is
`'neutral' | 'accent' | 'destructive'`, with `accent` the default (DEC-6). `label` names the state the verb reaches ("Unread"), because the panel
shares one row width with the title it uncovers and the gesture already
supplies the verb. `hasRemoval` is one bit the component cannot infer: after
the action fires, does the row spring back or hold out? It is independent of
`swipeBehavior` — a commit is not a removal, and a tap on a resting "Archive"
is — and of `variant`, since Archive leaves without being destructive and a
soft Delete with Undo is destructive while the row stays. It takes `has*`
because it declares a property of the action, not a state the row is in. It
is nothing more than the resting position: not a promise the caller removes
the row, so no obligation and no warning; not an animation, so nothing
collapses or fades; not a timing rule, so `onActivate` still fires at
activation.

Composition is deferred, not lost: a `render*`-shaped addition for a panel
the vocabulary cannot draw can land when a caller needs it. How a held-out
row leaves, and how a kept row returns, is not this record's (Non-goals).

Rejected: nodes per side with a shipped `SwipeAction` component — it
needed context registration for `commit`, and left any caller-supplied node
silently without it. Rejected: one action per side with `onAction` and a four-tone `tone` — a
second verb vocabulary. Rejected: a wider `hasRemoval` that promised the caller would remove the row, owned the exit animation, and fired `onActivate` after it — it made a confirm-first delete an exception and tied the resting bit to
the unsettled exit animation. Rejected: `isCommitExit` — the bit applies under `reveal` too, so naming it after commit is wrong.

### DEC-2 — Rest is the default; commit is a caller choice for one verb

**Reference:** `spec:AST-057/DEC-2`
**Decider:** `cixzhang`, `2026-10-02`

`swipeBehavior: 'reveal' | 'commit'`, default `reveal`. Under `reveal` the
row rests open and a long drag fires the outermost entry; under `commit` the row slides out and the outermost entry fires. The slide-out is the gesture's own confirmation; where the row rests afterwards is the entry's `hasRemoval`, not the model's — a commit is not a removal — and the component waits for nothing after firing. `commit` means the same on every row that has swipe actions; no host narrows it.

Where a platform offers both, the full swipe is defined over the resting
list — UIKit's flag is
[`performsFirstActionWithFullSwipe`](https://developer.apple.com/documentation/uikit/uiswipeactionsconfiguration),
indexing the resting actions — so resting is the model that holds several
verbs and commit is the one that holds exactly one; the count and the rest
state are one question, which is why `commit` with several entries on a side
warns. A resting panel also gives a touch user something to see before a
destructive verb fires, which is why it is the default. Commit is kept because both models are wanted, and it is what the row this
gesture was modelled on uses for its one-verb rows.

Rejected: commit-only as the sole model — it cannot grow into resting
without a default change. Rejected: a boolean `hasFullSwipe` — under `reveal` the full swipe is already on and under `commit` it is the whole behavior, so a boolean gates the wrong axis. Rejected: a `hasCommitAnimation` flag — the slide-out is how a commit confirms and `commit` already decides it; a second switch for one thing is the boolean-plus-handler duplication rejected on `hasCreate`. Rejected: requiring the row to stay out after every commit (#6821) — a committed "Mark read" row is still there.

### DEC-3 — The capability is `Item`'s; where it is available follows the row's role

**Reference:** `spec:AST-057/DEC-3`
**Decider:** `cixzhang`, `2026-10-03`

`Item` owns `swipe`. `ListItem` inherits it
through its existing passthrough and declares nothing of its own; a bare
`Item` in a product's own markup gets them the same way. Where swipe actions are available follows one rule: the row's role must
permit interactive descendants, because a swipe panel's controls are
interactive descendants of the row. A `listitem` and a role-less `Item`
qualify; `option`, the `menuitem*` roles, and a row that is the enlarged
target of a native radio do not, and are out of scope — not narrowed to one
model, not warned about per call, simply not served. A rule about the role
rather than a list of components means a row type nobody has written yet
sorts itself, and a scope boundary keeps `swipeBehavior` meaning one thing
everywhere it exists. Open state is the row's own: a pointer landing anywhere outside a
resting row closes it, and a drag on a neighbour is such a pointer, so one
row rests open at a time with no group state and no coordinating hook.

Only the component that owns the root can translate it, and a wrapper around
the row is ruled out by the HTML list content model — it would sit between
`<ul>` and `<li>` — so the gesture has to live where the root lives. Of `Item`'s seven in-core renderers, six give the row a role that forbids
interactive descendants; the seventh is `ListItem`, and the system's own templates render a bare `Item`
outside any list, so the capability has two consumers rather than one, which is why it stays
on the primitive: list rows and standalone rows share one home, and the
excluded rows are excluded by their role, not by where the prop lives.

Rejected: moving the prop to `ListItem` now that six of `Item`'s seven
in-core renderers are out of scope — it would put the prop only where it is
most used and take it from the standalone row, a real consumer the system's
own templates render. Rejected: deciding scope per model — permitting `commit` where `reveal` is
forbidden — because it couples a design choice (what the row does when
swiped) to a structural constraint (what the host may contain), so the same
prop value behaves differently by host. Rejected: a behavior hook that hosts
compose — one-open-at-a-time was its reason to exist as group state, and
outside-close gives the same outcome with nothing shared. Rejected: an
imperative or controlled open — nothing has asked, and the gesture already
owns the one coordination case.

### DEC-4 — No hover reveal

**Reference:** `spec:AST-057/DEC-4`
**Decider:** `cixzhang`, `2026-10-02`

A mouse drag and hover do nothing with `swipe`; horizontal wheel
input, a trackpad's scroll or a mouse's horizontal wheel, and a pen are the
non-finger inputs that swipe a row (DEC-7); what a row offers
a mouse or a keyboard is the row's own content, which this record does not
govern.

Rejected: a reveal axis that rendered the same actions as hover-revealed
buttons on a fine pointer — a second surface for verbs the row's content can
already carry. [React Aria's iOS List example](https://react-aria.adobe.com/examples/ios-list)
takes that route (a panel button in the tree, revealed on focus) and is the
alternative this decision sets aside.

### DEC-5 — The root translates and the panels counter-translate; no element is added

**Reference:** `spec:AST-057/DEC-5`
**Decider:** `cixzhang`, `2026-10-02`

`Item` renders each side's panel as an absolutely positioned child of its
existing root, at the inline start or end, above the root's background and
below the content. The drag writes its travel as a custom property on the
root — the way `useToastGesture` writes `--_toast-swipe-y` — the root's
transform reads it, and each panel's transform reads its negation, so the
row moves and the panel appears fixed in the space the row vacates. Both are
compositor transforms and the cancellation is exact. No element is added to
any row. The group clips with `overflow-inline: clip`. The positions are
internal: no public slot is admitted for them.

Layering and translation are different problems and neither needs a new
element. Layering is absolute positioning inside a containing block the root
already provides, with `isolation: isolate` on the root so a negative
`z-index` on the panel stays local (the 2026-09-04 isolation ruling).
Translation is the root's own transform: the content is four siblings in
every render mode, and the root is already their common parent. The root's
own styles survive the transform — no `overflow` or `contain` on it, the
focus-within outline and the theme target ride it. The clip cannot be the
row's, because the row is the thing moving, so it is the group's; `hidden`
would create a scroll container and fight the list's vertical scroller.

Rejected: a wrapper element inside `Item`, conditional or not — a second
row shape for CSS and tests to straddle, for a problem the root's transform
already solves. Rejected: a clipping container around a new inner row — an element on
every swiping row. Rejected: panels as siblings at
the list level, positioned at each row's offset — a position-sync loop
against resize, reflow and virtualized mounts. Rejected: animating
`padding-inline-start` on the root — layout on every frame under a finger
instead of a compositor transform. Rejected: public `beforeContent` /
`afterContent` slots — nothing in this record needs them, and general
anatomy takes its own admission.

### DEC-6 — The verb variant set is `neutral | accent | destructive`, minted knowingly

**Reference:** `spec:AST-057/DEC-6`
**Decider:** `cixzhang`, `2026-10-02`

`SwipeActionVariant` is `'neutral' | 'accent' | 'destructive'`: three
flavours of verb — ordinary, the one you mean, the dangerous one — and
`accent` is the default on a swipe panel, because the panel is a filled
surface that has to be some colour and `ProgressBar` already defaults a
filled surface to `accent`.

This is minted vocabulary, not reuse, and it was taken knowing that:
`accent` appears on no other variant enum in core except `ProgressBar`'s
default, and `Step.status` carries it as a status. The shared status set —
`success | warning | error` across seven components — names states, and a
verb is not a state: "Archive" is not a success and "Delete" is not an
error. `spec:AST-058` takes the same set for picker-row actions with
`neutral` as its default, so the vocabulary is one across the two surfaces
where a verb gets a colour.

Rejected: the status set — it would make a verb claim a state. Rejected: a `tone: 'accent' | 'success' | 'warning' | 'error'` — a status
set with one decorative member. Rejected: `Badge`'s variant map — it carries
decorative colours (`blue`, `cyan`, …) that a verb slot must not admit.
Rejected: the menu row's two-value `'default' | 'destructive'` — it has no
word for the one action a panel exists to offer.

### DEC-7 — A trackpad swipes a row; a mouse drag does not

**Reference:** `spec:AST-057/DEC-7`
**Decider:** `cixzhang`, `2026-10-26`

A trackpad's two-finger horizontal scroll is the same motion as a finger's
swipe and takes nothing else from the page, so it reveals and fires row
actions as a finger does (`spec:AST-094` FR43). A mouse drag would take the
browser's text selection and native drag, so a mouse drag never swipes a row. A mouse's horizontal wheel sends the
same events as a trackpad and swipes the same way.

Rejected: keeping swipe actions touch-only.

### DEC-8 — Swipe actions are configured through a constructor

**Reference:** `spec:AST-057/DEC-8`
**Decider:** `cixzhang`, `2026-11-01`

`Item` takes one prop, `swipe`, whose value comes from
`createSwipe(options)`. The options keep DEC-1's entries and DEC-2's
two models; one `swipeBehavior` governs both sides. All of the swipe's code —
the shared gesture core, the animator, the panels' rendering, and the row's
gesture code — lives in the constructor's module, which imports it
statically. `Item` carries none of it, so an app pays for the swipe only
when it imports `createSwipe`, the bundler drops it everywhere else,
and nothing loads at run time. This is the plug-in route
`architecture:public-component-api` INV19 gives a feature with a large
resource cost, and the shape CodeBlock already takes with
`language={createCodeLanguage(…)}`.

Rejected: loading the swipe code with `import()` the first time a row has
swipe actions, which makes the gesture live only after the row paints and
needs an exception to `architecture:react-component-runtime` INV13's static
imports. Rejected: keeping the data on `Item`'s props with a static import,
which puts the gesture core in every import that renders a row.

## Deprecation and cleanup descriptions

Consumer migration instructions belong in consumer docs and release notes.

### DEP-0017 — Deprecate `swipeActions` and `swipeBehavior`

| Field            | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id               | `DEP-0017`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| cleanup          | `CLN-0025`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| package          | `@astryxdesign/core`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| surface          | The `swipeActions` and `swipeBehavior` props on `Item` and `ListItem`, and the types `ItemSwipeAction`, `ItemSwipeActions`, `ItemSwipeActionVariant`, and `ItemSwipeBehavior`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| old contract     | `swipeActions: {leading?, trailing?}` with `ItemSwipeAction[]` per side and `swipeBehavior: 'reveal' \| 'commit'`, with FR2–FR9 and AR1–AR3's behavior; `Item` loads its swipe layer with `import()` the first time a row has swipe actions, so the gesture goes live a moment after the row paints                                                                                                                                                                                                                                                                                                                                                                          |
| replacement      | `swipe={createSwipe({leading, trailing, swipeBehavior})}` (FR1); the types map one to one: `ItemSwipeAction` to `SwipeAction`, `ItemSwipeActionVariant` to `SwipeActionVariant`, `ItemSwipeBehavior` to `SwipeBehavior`, and `ItemSwipeActions` to `CreateSwipeOptions`                                                                                                                                                                                                                                                                                                                                                                                                      |
| direct authority | `spec:AST-057` DEC-8. Owner: `cixzhang`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| warning          | Static `@deprecated` metadata on the two props and the four types; consumer docs and the release notes name `DEP-0017` and the replacement. No runtime warning (`spec:AST-017` FR29, FR29a). When `swipe` and either deprecated prop are both given, `swipe` wins and the deprecated props are ignored; a development-only diagnostic names the ignored props (`spec:AST-017` FR29's coexistence case)                                                                                                                                                                                                                                                                       |
| compatibility    | The deprecated props keep their released behavior through their released loader: `Item` loads the swipe code with `import()` the first time a row has `swipeActions`. That loader and the released row style, which `Item` applies from a row's first render on the deprecated path, are the only swipe code in `Item` and the only exceptions to FR10, both on the deprecated path only, and the bundle guard names them                                                                                                                                                                                                                                                    |
| migration        | Mechanical. `swipeActions={X}` becomes `swipe={createSwipe(X)}`; with `swipeBehavior={B}` beside it, `swipe={createSwipe({...X, swipeBehavior: B})}`, and an inline object literal is merged in place. The panel, the gesture, and every handler behave as before; the one observable difference is that the gesture is live at the row's first paint                                                                                                                                                                                                                                                                                                                        |
| codemod          | An `astryx upgrade` codemod staged in `packages/cli/assets/codemods/transforms/next/`, with tests and fixtures, checked by the codemod verify workflow, and available in the release that deprecates the props: it rewrites static `swipeActions` and `swipeBehavior` on `Item` and `ListItem`, adds the `createSwipe` import, renames the four types, removes a `swipeBehavior="reveal"` it would merge as the default, and reports JSX spreads that may carry the deprecated props and call sites that mutate a `leading` or `trailing` array of a value it retypes as `CreateSwipeOptions`, since those arrays are `readonly SwipeAction[]` (`spec:AST-017` FR29c, FR29d) |
| downstream       | In the deprecating release, Core's docs, stories, templates, and examples teach only `swipe` (`spec:AST-017` FR29b)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| transition       | no prior transition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| state            | `proposed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| target plan      | `CLN-0025` in the next minor release                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### CLN-0025 — Remove `swipeActions` and `swipeBehavior`

| Field       | Value                                                                                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id          | `CLN-0025`                                                                                                                                                                                    |
| lifecycle   | `DEP-0017`                                                                                                                                                                                    |
| delta       | `swipeActions`, `swipeBehavior`, and the four `ItemSwipe*` types are removed from `Item` and `ListItem`, with `Item`'s swipe loader and released row style; FR10 then holds with no exception |
| replacement | `swipe={createSwipe(…)}` (FR1)                                                                                                                                                                |
| codemod     | The minor's `astryx upgrade` runs DEP-0017's rewrite over any remaining site and reports what it cannot prove                                                                                 |
| rollback    | Restore the props, the types, and the loader from the final-patch baseline                                                                                                                    |
| state       | `pending` — lands in a declared minor with its `[breaking]` Changeset                                                                                                                         |

## Open questions

None.

## Content boundary

The research that produced this record — the cross-library survey, the
shapes weighed, and the vibe test's design and scores — is a report, not a contract, and lives outside it.

This record does not duplicate `Item`'s or `List`'s anatomy, prop tables,
theming targets, or geometry contracts; the modality invariants in
`architecture:interaction-modality`; the admission argument in
`spec:AST-002`; the press model in `module:DropdownMenu/useMenuPress`; or the
gesture constants an implementation will hold in source. It links their
canonical owners.
