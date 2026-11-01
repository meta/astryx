---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-075
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-15
phase: accepted
owners: [vjeux]
affects_architecture:
  [architecture:interaction-modality, architecture:public-component-api]
affects_families: [family:input-fields, family:overlay-dismissal]
affects_contributing: []
affects_consumer_docs:
  [BaseTypeahead, Typeahead, ChatComposerInput, useCombobox, useMultiCombobox]
---

# Combobox over a caller-rendered field system spec

## Intent

A person picks from a filtered list while focus stays in a text field the
product renders itself: a chat composer's textarea, a search field above an
emoji grid, a settings search whose results replace a page section, an "add
people" field whose matches list inline in a dialog. Astryx gives that field the
combobox semantics and keyboard model it gives its own typeahead input. The
product supplies the field, the rows, and where the list renders, and composes
the behavior from hooks; every such field behaves and announces the same way.

## Non-goals

- The field's shell and appearance, the rows' appearance, and where the list
  renders (a layer or the page's flow) stay with the caller.
- Searching, filtering, debouncing, and asynchronous sources stay with the
  caller.
- Finding the query inside the field's text, such as text after a trigger
  character in a composer, stays with the caller.
- Comboboxes whose focus sits on a button (`Selector`, `MultiSelector`) or that
  live in a modal command surface (`CommandPalette`) keep their own records; this
  spec does not set one interaction model for every combobox.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — Focus stays in the field.** Moving the active option MUST NOT move DOM
  focus out of the field. The field MUST name the active option through
  `aria-activedescendant`, which references a rendered option, and MUST carry no
  `aria-activedescendant` while no option is active.
- **FR2 — Expanded state follows the list.** While the list is shown, the field
  MUST expose `aria-expanded="true"` and an `aria-controls` that names the
  listbox. While it is not shown, the field MUST expose `aria-expanded="false"`
  and MUST NOT reference an element that is not rendered. A `textarea` field
  (FR3) exposes `aria-controls` the same way and carries no `aria-expanded`.
- **FR3 — Roles.** The field MUST expose an accessible name. An `input` or a
  contenteditable field MUST expose `role="combobox"`. A `textarea`, which
  admits no explicit role, keeps its implicit `textbox` role and MUST expose
  `aria-autocomplete="list"`. The list MUST be a named
  `listbox` whose rows are `option`s, with `aria-selected="true"` on the active
  one. The listbox MAY render anywhere in the document, including the page's
  flow. Controls that are not options MUST render outside the listbox.
- **FR4 — Keys.** While the list is shown, ArrowDown and ArrowUp MUST move the
  active option, Enter on an active option MUST pick it and only then stop the
  field's own Enter, and Escape MUST hide the list without dismissing an
  enclosing layer in the same press (`family:overlay-dismissal`). While the list
  is hidden, ArrowDown in a single-line `input` field MUST show the list when it
  has options, as `component:BaseTypeahead` does for its own input; in a
  multi-line field (a `textarea` or a contenteditable element) every key MUST
  reach the field and its surroundings unchanged, so the arrows keep moving the
  caret between lines. While the list is shown, Home and End are outside this
  requirement until OQ2 is ruled, and every other key MUST reach the field
  unchanged.
- **FR5 — Input method.** A key MUST NOT activate a combobox command, including
  Escape's dismissal (`family:overlay-dismissal`), while an input-method
  composition is active.
- **FR6 — Pointer.** Moving the pointer over an option MUST make it active
  without moving DOM focus. Pressing an option MUST pick it, and the field MUST
  keep focus through the press.
- **FR7 — Result count.** When the options change for a new query, the number of
  options, or that there are none, MUST be announced politely through the shared
  announcer rather than a live region per field, through the field's own
  `useAnnounce({hasReplace: true})` instance (`spec:AST-086` FR9), so a newer
  count replaces one not yet spoken.
- **FR8 — The hooks are discoverable as hooks.** Each public hook that
  implements this contract MUST be returned by `astryx hook <name>` and
  `astryx search` with its parameters, its return fields, and the requirements
  above it satisfies, so a product finds it without first finding a component
  that uses it.

### Platform support

- Supported feature/engine floor: the repository's supported engines; no new CSS
  or DOM feature.
- Unsupported behavior: none; screen readers announce `aria-activedescendant` on
  a contenteditable combobox unevenly, and FR1 still holds there.
- Browser evidence: Chromium accessibility-tree receipts for FR1–FR3 and real
  keyboard and pointer input for FR4–FR6, with screen-reader claims bounded by
  `spec:AST-009`.

## Current-state impact

- `component:BaseTypeahead` meets AR1–AR5 for the input it renders; this
  contract carries the same obligations to a field the caller renders.
- `component:ChatComposerInput` exposes combobox semantics for its trigger menu
  inside its own contenteditable field only, through an internal hook.
- `useCombobox` (exported from `@astryxdesign/core/Selector`) tracks the active
  option, opens and closes, and handles the keys for Selector and CommandPalette.
  For a single-line `input` the caller renders, over any option type with a
  string `value`, its `getFieldProps`, `getListboxProps`, and `getOptionProps`
  carry FR1–FR6. It does not yet take a multi-line field (DEC-3), and the caller
  announces the result count through its own `useAnnounce({hasReplace: true})`
  instance (FR7), as DEC-2 describes.
- `useMultiCombobox` (exported from `@astryxdesign/core/MultiSelector`) does the
  same for MultiSelector's own control. It takes MultiSelector's option type,
  leaves the ARIA wiring to the caller, and does not guard keys during an
  input-method composition.
- `useTypeahead` already ignores keys during an input-method composition, and
  `useAnnounce` is the shared announcer FR7 names.
- Both combobox hooks ship hook docs that `astryx hook` and `astryx search`
  return. The `useCombobox` doc names the requirements above it satisfies (FR8);
  the `useMultiCombobox` doc covers no caller-rendered field and names none.

## Verification

| Contract | Verification                                                         | Representative states                                                                                                | Mutation or failure expectation                                                                                                                            |
| -------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR3  | Chromium accessibility-tree binding under `spec:AST-021`; unit tests | input, textarea, contenteditable; list in a layer and in flow                                                        | focus leaves the field, a stale `aria-activedescendant` or `aria-controls` remains, or axe reports `aria-allowed-role` or `aria-allowed-attr` on the field |
| FR4, FR6 | real keyboard and pointer input in Chromium                          | arrows, Enter, Escape inside a dialog, hover and press; ArrowDown on a hidden list in an `input` and in a `textarea` | a key or press picks, dismisses, or blurs the field at the wrong time                                                                                      |
| FR5      | composition event tests                                              | candidate selection confirmed with Enter                                                                             | Enter during composition picks an option                                                                                                                   |
| FR7      | shared announcer tests                                               | results, none, a new query, two queries in one frame                                                                 | no announcement, or an announcement from a per-field live region, or a superseded count spoken with the newer one                                          |
| FR8      | CLI hook discovery tests over core's exported hooks                  | each public hook named in DEC-2; a hook exported from a component's entry point                                      | a combobox hook is exported without a hook doc, or `astryx hook <name>` denies it exists                                                                   |

## Decision log

### DEC-1 — The caller renders the field and the list; Astryx owns the semantics and the keys

**Reference:** `spec:AST-075/DEC-1`
**Decider:** `cixzhang`, `2026-10-15`

A product that already renders a composer, a search field, or a dialog field
cannot adopt the typeahead without replacing that field and moving its list into
a layer, so it wires the combobox pattern by hand, and each copy differs in the
details FR1–FR7 fix. With the field and the list left to the caller and the
semantics owned by Astryx, every such surface meets one tested contract.

Rejected: requiring the product's field to be the typeahead's own input — a textarea or contenteditable composer cannot be one, and an in-flow list is not a layer.

### DEC-2 — The contract ships as composable hooks, built on `useCombobox`

**Reference:** `spec:AST-075/DEC-2`
**Decider:** `cixzhang`, `2026-10-15`

A product builds a combobox over its own field by composing hooks, the same way
Astryx builds its own: `useCombobox` for the active option, the expanded state
and the keys, generalized from Selector's option type to any option list and to
a field the caller renders; the input-method guard `useTypeahead` already
applies; and `useAnnounce` for the result count. Astryx's own comboboxes compose
the same hooks, so one tested implementation backs every surface this spec
covers, and each hook is documented as a hook (FR8). Generalizing
`useCombobox` keeps its released options and return fields working unchanged
for existing callers; the new inputs are optional additions. A component stays
the convenient path for the common case; the hooks are the path for every other
field.

Rejected: a new component, or `BaseTypeahead` accepting a caller's field, which
keeps the behavior locked inside one component's markup.

### DEC-3 — A hidden list reopens on ArrowDown in a single-line field only

**Reference:** `spec:AST-075/DEC-3`
**Decider:** `cixzhang`, `2026-10-15`

In a single-line field the arrows have no caret work to do, so ArrowDown
reopens a hidden list, the keyboard model Astryx's own typeahead input already
gives. In a multi-line field the arrows move the caret between lines, which a
person writing a message needs, so they reach the field while the list is
hidden.

Rejected: leaving every key to every field while the list is hidden, which
leaves a single-line search field with no keyboard way back to its list but
typing.

## Open questions

- **OQ2 — Home and End** (`human-design`): in a field the caller renders, they
  either keep moving the caret or move to the first and last option, as
  `component:BaseTypeahead` FR5 does for its own input.
- **OQ3 — A two-dimensional list** (`human-api`): whether a grid of options,
  such as an emoji picker, belongs to this contract or to a separate one.
