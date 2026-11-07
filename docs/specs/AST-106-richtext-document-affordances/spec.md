---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-106
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [ernestt]
affects_architecture: []
affects_families: []
affects_contributing: []
affects_consumer_docs: [RichTextEditor, RichTextView]
---

# RichText document affordances system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A person writing in `RichTextEditor` can do the document work they expect of a
writing surface: size a table's columns, mention someone or insert a block from
a menu they type, change a link where it sits, add an image, write a formula,
fold a long section away, and format on a phone. A product turns each of these
on. With none turned on, `RichTextEditor` is the form field that
`spec:AST-061/DEC-7` describes. Content an affordance adds reads the same in
`RichTextView`, and in core `Markdown` wherever Markdown can express it.

## Non-goals

- Collaboration, persistence, and document hosting. They stay with the product
  (`spec:AST-061/DEC-7`).
- The services behind an affordance: who a mention can name, what a typed menu
  searches, where an image's bytes are kept, and how a formula is drawn.
- Each affordance's exact props, events, and visuals. A decision in this record
  or the owning component spec settles them before the affordance ships.
- The Markdown dialect and its conversion, which `spec:AST-062` owns.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — Off by default.** An affordance is off until the caller turns it on.
  With every affordance off, `RichTextEditor` and `RichTextView` behave, store,
  and render as `spec:AST-061` and `spec:AST-062` describe.
- **FR2 — The value stays editor state.** Content an affordance adds is part of
  the serialized Lexical editor state the caller already stores
  (`spec:AST-061/DEC-7`). It holds references that the product resolves when the
  content is drawn, such as who a mention names or where an image is kept, and
  never a copy of data the product looks up, such as a person's name or an
  image's bytes (DEC-2).
- **FR3 — Reader state stays out of the value.** State that belongs to one
  reader, such as the sections they folded or the menu items they picked
  recently, is kept for that reader only. It never enters the editor value, its
  Markdown export, or another reader's view.
- **FR4 — Each affordance states its Markdown form.** For each affordance that
  adds content, `editorStateJSONToMarkdown` writes the closest Markdown form, and
  the table below states what that form drops. A document that uses no
  affordance exports exactly as `spec:AST-062` describes.
- **FR5 — Reading shows what editing showed.** `RichTextView` draws an
  affordance's content as the read-only editor draws it, and core `Markdown`
  draws that content's Markdown form under `spec:AST-061/FR1`.
- **FR6 — Editing chrome never reflows the document.** A menu, popover, handle,
  or bar an affordance shows while editing overlays the document or holds space
  that read mode also reserves, so `spec:AST-061/FR9` and `spec:AST-061/FR10`
  hold with the affordance on.
- **FR7 — Keyboard and assistive technology.** Every action an affordance
  offers by pointer also has a keyboard path, and its state is exposed to
  assistive technology. A typed menu keeps focus in the editor and follows the
  WAI-ARIA combobox pattern, resizing a table column has a keyboard equivalent,
  and a fold control is a button that exposes `aria-expanded`.
- **FR8 — The product supplies the services.** Search, people lookup, uploads,
  and formula drawing come from the caller as functions or renderers. RichText
  owns the editing interaction and its accessibility, and makes no network
  request of its own.
- **FR9 — One on-screen keyboard model.** An affordance that responds to a
  phone's on-screen keyboard measures and avoids it as `spec:AST-099`
  describes.

The admitted affordances:

| Affordance           | What a person does                                                                  | What the value keeps                  | Markdown form                        |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| Table sizing         | Drags a column or row border, or uses the table's size commands from the keyboard   | Column widths and row minimum heights | The table, without its sizes (DEC-3) |
| Typed menus          | Types `@`, `/`, or `:` and picks a person, a block, or an emoji from caller sources | What the pick inserts                 | The inserted content's own form      |
| Link popover         | Opens, edits, or removes the link at the caret or under the pointer                 | Links                                 | Links                                |
| Images               | Pastes, drops, or picks an image that the caller uploads, and moves it in the text  | Source, alternative text, and size    | `![alt](src)`, without its size      |
| Math                 | Types inline or display formulas                                                    | Formula source                        | Core `Markdown`'s opt-in math syntax |
| Collapsible headings | Folds the section under a heading while reading or editing                          | Nothing (FR3)                         | None                                 |
| Phone keyboard bar   | Formats from a bar docked above the on-screen keyboard                              | Nothing                               | None                                 |

### Platform support

- Supported feature/engine floor: the repository's browser support matrix.
- Unsupported behavior: where a browser lacks what an affordance needs, the
  affordance is absent and the editor keeps working without it.
- Browser evidence: real-browser keyboard and pointer runs of each affordance,
  and the `spec:AST-061` reading and editing geometry with each affordance on,
  at phone and desktop widths.

## Current-state impact

- `spec:AST-061/DEC-7` names this record as the owner of RichText's opt-in
  document affordances.
- Existing behavior is unchanged while every affordance is off (FR1).
- The `RichTextEditor` and `RichTextView` consumer docs gain each affordance's
  props when it ships.

## Verification

| Contract | Verification                                                         | Representative states                              | Mutation or failure expectation                       |
| -------- | -------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| FR1      | The `spec:AST-061` parity fixture and `spec:AST-062` corpus, all off | Default editor and view                            | An affordance that is on by default fails             |
| FR2, FR3 | Serialized-state tests per affordance                                | A mention, an image, a folded section              | A stored name, image bytes, or fold state fails       |
| FR4      | Export tests per affordance                                          | Each row of the affordance table                   | An export that drops more than the table states fails |
| FR5      | Parity fixture rows per affordance                                   | Light and dark, left-to-right and right-to-left    | A view that draws the content differently fails       |
| FR6      | Reading and editing geometry with the affordance's chrome open       | Phone and desktop widths                           | A reflowed block fails                                |
| FR7      | Keyboard-only runs and accessibility-tree assertions                 | An open menu, a resize, a fold                     | An action reachable only by pointer fails             |
| FR8      | Tests with caller services replaced by fakes                         | Slow, failing, and empty sources                   | A network request made by RichText fails              |
| FR9      | The `spec:AST-099` verification states with the keyboard bar shown   | On-screen keyboards opening, resizing, and closing | A second keyboard measurement fails                   |

## Decision log

### DEC-1 — RichText offers opt-in document affordances

**Reference:** `spec:AST-106/DEC-1`
**Decider:** `ernestt`, `2026-10-26`

Writers expect these affordances from a writing surface, and a product that
needs one otherwise builds its own editor and re-earns the parity and
accessibility RichText already provides. Each affordance's editing interaction
is generic while its data and services stay with the product, so each belongs in
RichText behind an opt-in.

Rejected: a separate document-editor package, because two editors would each owe
the parity contract.

### DEC-2 — The value holds references, not looked-up data

**Reference:** `spec:AST-106/DEC-2`
**Decider:** `ernestt`, `2026-10-26`

A mention keeps who it names and an image keeps where it is kept; the product
resolves them each time they are drawn. Every reader sees current data, and a
document never carries data its reader may not see.

Rejected: a stored display snapshot, because it goes stale and can expose data
to a reader who may not see its source.

### DEC-3 — Table sizes live in the value, and Markdown drops them

**Reference:** `spec:AST-106/DEC-3`
**Decider:** `ernestt`, `2026-10-26`

The widths and heights a writer sets are part of the document they made, so the
editor value keeps them and the editor and `RichTextView` draw them. A Markdown
table cannot hold sizes, so the export writes the table without them, and core
`Markdown` lays it out as it lays out any table. A table with no sizes set lays
out as `spec:AST-061/FR4` describes on every surface.

## Open questions

- **OQ1 — One prop per affordance, or one grouped prop?** (`human-api`)
  - One prop each, such as `hasTableSizing`, `typeahead`, and `images`, follows
    the existing `has*` props and grows the props table by about seven entries.
  - One grouped prop keeps the top-level surface small (`spec:AST-061/DEC-8`) at
    the cost of a nested configuration shape.
