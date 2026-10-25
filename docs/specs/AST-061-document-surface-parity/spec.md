---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-061
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-06
phase: accepted
owners: [cixzhang]
affects_architecture: []
affects_families: []
affects_contributing: []
affects_consumer_docs: [Markdown, RichTextEditor, RichTextView]
---

# Markdown document surface parity system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

When core `Markdown` and the RichText surfaces, `RichTextEditor` and
`RichTextView`, show the same Markdown document, a person sees one document:
the same typography, block spacing, measure, structure, and direction on
every surface. Where a product switches between reading and editing that
document in place, the switch moves no block relative to the others and
reflows no line; only editing affordances appear or disappear.

## Non-goals

- Byte-identical DOM. Each surface keeps its own markup when the rendered
  result and its semantics match.
- The Markdown dialect itself, and how RichText imports and exports Markdown
  source. This record governs what a supported construct looks like and means
  once rendered, not which source text produces it or how source round-trips.
  The one exception is the character reference decoder that DEC-5 shares.
- Collaboration, persistence, document hosting, and plugin adapters between
  Markdown plugins and the editor.
- Which editor engine a product chooses for editing whole documents, and the
  value that product stores. This record governs how the surfaces render the
  same document; RichText's own role and value are DEC-7.
- RichText's release channel. Package release-channel metadata decides it
  (spec:AST-033 FR4), and promotion follows spec:AST-017 FR23; this record
  does not.
- Equivalent internal implementations remain valid when they satisfy this
  contract, except the character reference decoder, which DEC-5 makes one
  shared public function.

## Requirements

- **FR1 — One contract decides, not either renderer.** Where `Markdown` and a
  RichText surface disagree for the same supported content, CommonMark
  semantics decide meaning and the shared type-scale, spacing, and color
  tokens decide presentation. Neither surface's current output is the
  reference: a mismatch is fixed on the side the contract says is wrong, which
  may be `Markdown`.
- **FR2 — Same typography.** Body text uses `--text-body-size` and
  `--text-body-leading`; heading level N uses `--text-heading-N-size`,
  `--text-heading-N-weight`, and `--text-heading-N-leading` with the heading
  font family, for levels 1–6. Strong text uses `--font-weight-semibold`.
  Inline code uses the same chip size, family, and padding on every surface.
- **FR3 — Same block spacing.** Blocks are separated by one spacing table per
  density. Default density: headings 1–3 `--spacing-6` before and
  `--spacing-3` after; headings 4–6 `--spacing-4` before and `--spacing-2`
  after; paragraphs and lists `--spacing-3` on both edges; fenced code,
  blockquotes, and tables `--spacing-4`; thematic breaks `--spacing-6`.
  Compact density uses the compact column of the same table. The first
  block's leading margin and the last block's trailing margin are zero.
- **FR4 — Same measure.** Prose blocks cap at the same content width,
  `680px` by default, and wide blocks (fenced code, tables) span the
  available width on every surface.
- **FR5 — Same structure.** Paragraph soft line breaks join into one line of
  flowing text; hard breaks break. A blockquote's lines continue one
  paragraph. Ordered and unordered lists nest by CommonMark indentation, show
  one marker per item with the marker style of its depth (DEC-6). Unordered
  lists retain the same themed inset at each nesting step. Within each list,
  sibling item text shares one inline-start line. Lists nested beneath those
  items use that line as their anchor; numbered-list insets follow FR11.
  Task-list items, fenced code, tables, and
  thematic breaks render as those structures, never as their literal source.
  Fenced code wraps long lines on every surface; a code line never scrolls or
  clips sideways (DEC-9).
- **FR6 — Same direction.** Content blocks lay out in the direction of the
  surrounding Internationalization provider on every surface. A surface does
  not choose a block's direction from its text; text that runs against the
  provider direction follows normal bidirectional ordering inside its
  block.
- **FR7 — Same semantics.** Strong, emphasis, strikethrough, inline code, and
  links expose the same element semantics on every surface. A link's
  destination never contains its title; a title is exposed as the link's
  title. Named and numeric character references in text, such as `&copy;`
  and `&#169;`, render as the characters they name on every surface; inside
  inline code and fenced code they stay literal. Every surface decodes them
  with the one decoder `Markdown` exports (DEC-5).
- **FR8 — Same code block frame.** A fenced code block shows the same frame —
  its header, or the corner cluster when it has none, with its language label
  and copy action placed as `component:CodeBlock` FR3 and FR11 place them — at
  the same height in read and edit mode, so the switch does not move the code.
  In edit mode the frame — the header or the corner cluster — sits outside the
  editable text: it is not part of the document and cannot be edited.
- **FR9 — Reading and editing in place.** Edit mode may add a caret,
  selection, placeholder, focus ring, field border and inset, and a toolbar.
  Together these offset the whole document by one constant amount: after that
  offset, every block's top and height match read mode within 2 px and every
  paragraph keeps its line count. The toolbar either overlays content or holds
  space that read mode reserves too, so the offset does not change while
  editing.
- **FR10 — Scroll position survives the switch.** The block at the top of
  the view before a switch between reading and editing is still at the top of
  the view after it, within the FR9 offset.
- **FR11 — Numbered-list indentation is shared within the list.** A numbered
  list MAY widen its marker space from the ordinary themed list inset to
  accommodate that list's widest rendered counter. Every sibling
  item's text starts on the same inline-start line; an individual counter
  MUST NOT shift its item's text or a list nested beneath it. Counters remain
  whole on one line without clipping, truncation, or overlap with item text.
  Separate lists at the same depth MAY have different insets when their
  widest counters differ; each nested list resolves its own inset from its
  parent item's shared text start. This permission changes neither source
  nesting nor DEC-6's numbering and marker styles. It does not exempt
  renderer parity: for the same list, theme, density, and available measure,
  Markdown and the RichText surfaces retain matching text starts and nested
  insets, and FR9's reading/editing geometry and reflow requirements still hold.

### Platform support

- Supported feature/engine floor: the repository's browser support matrix.
- Unsupported behavior: a construct a surface cannot yet render as a
  structure renders as its literal source text. It is never dropped.
- Browser evidence: real-browser block geometry for the shared parity
  fixture at phone and desktop widths, light and dark, left-to-right and
  right-to-left, and a long document switched between reading and editing
  halfway down.

## Current-state impact

`Markdown` already renders FR2–FR6 for its own output except where FR7 names
a link title and FR7 names character references. `RichTextEditor` and
`RichTextView` are governed by FR2–FR11 for the
constructs they render; their default editor theme follows FR2 and FR3.
`@astryxdesign/core/Markdown/parser` and `@astryxdesign/core/Markdown` export
`decodeMarkdownCharacterReferences`, the DEC-5 decoder the RichText surfaces
import with.
`Markdown` draws disc and decimal markers at every depth, and RichText draws
the second bulleted level as a disc; both adopt the DEC-6 marker cycle.
RichText adopts DEC-8: its package entry stops exporting `sharedEditorTheme`,
`URL_MATCHER`, `EMAIL_MATCHER`, and `Transformer`; `RichTextEditorToolbar`
gains `BaseProps` and a `ref` and renames `linkOpensInNewTab` to `hasNewTabLinks`; and its
Lexical peer ranges move to the Lexical 0.52 minor.
`Markdown` renders fenced code unwrapped, scrolling sideways, and adopts the
FR5 wrap; RichText already wraps fenced code. RichText's editing surface is
18px narrower than the reading surface at every width, the field's inset, so a
line that wraps close to the available width can take one more line in edit
mode than in read mode, against FR9; at phone width a long fenced code line
does.
`Markdown`, through `component:CodeBlock`, and the RichText surfaces float
Copy over the code of a fence that names no language; both adopt the FR8
corner cluster that `component:CodeBlock` FR11 places.
RichText code blocks colour with `component:CodeBlock`'s tokenizer and read the
same `CodeLanguageProvider` through `useCodeLanguages()` (`component:CodeBlock`
FR13), so read and edit paint the same languages, except a fence whose first word runs
past letters, digits, and underscores, such as `c++`, `c#`, `objective-c`,
`rust,ignore`, or `diff-ts`: `Markdown` reads a fence by its leading word
characters (`component:Markdown` FR29), while RichText keeps the whole first word.

## Verification

| Contract   | Verification                                                                                                | Representative states                                                                                                                                                                                                | Mutation or failure expectation                                                                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR2–FR4    | Real-browser computed style and block geometry of the parity fixture on `Markdown` and RichText             | 390px and 1440px; light and dark; default density                                                                                                                                                                    | Restoring a hard-coded heading size or a different block margin moves a block past 2 px and fails                                                                                                 |
| FR5        | Real-browser structure and line counts of the parity fixture                                                | Nested lists at 2- and 3-space indentation; soft breaks; blockquote continuation                                                                                                                                     | Flattening a nested list or turning a soft break into a line break fails                                                                                                                          |
| FR6        | Real-browser computed direction per block                                                                   | Right-to-left provider with left-to-right text, and the reverse                                                                                                                                                      | Per-block automatic direction fails                                                                                                                                                               |
| FR7        | Semantic DOM of inline marks, links, and character references on every surface                              | Titled link, bare link, strong, emphasis, strikethrough; `&amp;`, `&copy;`, `&#169;` in text and in code                                                                                                             | A title inside a destination, a styled span in place of a semantic element, or an undecoded reference in text fails                                                                               |
| FR7, DEC-5 | Shared conformance cases through `Markdown` rendering and RichText import                                   | Named, decimal, and hexadecimal references; an unknown name; a missing semicolon; an invalid code point                                                                                                              | A second reference table, or a decoder that changes an unknown name or an unterminated reference, fails                                                                                           |
| FR5, DEC-9 | Real-browser line boxes and horizontal overflow of a long-line code fixture on both surfaces, read and edit | 390px and 1440px; light and dark; left-to-right and right-to-left                                                                                                                                                    | A code block whose scroll width exceeds its client width, or a long line that is taller in one mode than the other, fails                                                                         |
| FR5, DEC-6 | Real-browser marker style per depth on both surfaces                                                        | Bulleted and numbered lists nested 0–8 deep and of mixed types; starts of 0, −1, 26, 27, 3999, and 4000 at alpha and roman depths; right-to-left; light and dark                                                     | A level that draws another level's marker, or one surface differing from the other, fails                                                                                                         |
| FR5, FR11  | Real-browser counter line boxes, sibling text starts, and nested-list insets on Markdown and RichText       | Short and wide-counter lists at the same depth; decimal 9–10 and 99–100; alpha z–aa; roman vi–viii; adjacent parents whose child lists have different widest counters; phone/desktop; LTR/RTL; light/dark; read/edit | A split, clipped, or overlapping counter, a per-item text shift, a nested-list anchor displaced from its parent list's shared text-start line, or a cross-renderer/read-edit inset mismatch fails |
| FR8        | Real-browser code block header geometry in both modes                                                       | Fenced code with an info string; a one-line fence with a language; a long fence with no language                                                                                                                     | A header or corner cluster present in only one mode, a control over the code in either mode, or a line that wraps differently between modes fails                                                 |
| FR9–FR10   | Real-browser read/edit switch of the parity fixture and a long document                                     | Short document at the top; long document halfway down                                                                                                                                                                | A per-block shift beyond the constant offset, or an anchor block leaving the top of the view, fails                                                                                               |

## Decision log

### DEC-1 — Parity is a shared contract, not a copy of `Markdown`

**Reference:** `spec:AST-061/DEC-1`
**Decider:** cixzhang, 2026-10-06

Readers move between the read and edit surfaces of the same document, so the
document has to look and mean the same on both. The contract is CommonMark
semantics plus the shared tokens, because those are what a reader's
expectations come from. When `Markdown` is the side that departs from them,
`Markdown` changes.
Rejected: treating current `Markdown` output as the reference, because it
would copy its defects into every editor surface.

### DEC-2 — Editing affordances offset the document but never reflow it

**Reference:** `spec:AST-061/DEC-2`
**Decider:** cixzhang, 2026-10-06

An editor needs a caret, a toolbar, and a field frame, so edit mode cannot be
pixel-identical to read mode. A constant offset keeps the reader's place:
every line stays where it was relative to the others, and the scroll anchor
stays at the top of the view. 2 px absorbs subpixel rounding between
renderers; it does not admit a different spacing value.

### DEC-3 — Character references render decoded

**Reference:** `spec:AST-061/DEC-3`
**Decider:** cixzhang, 2026-10-06

A reader who sees `&copy;` on one surface and `©` on the other is looking at
two documents. CommonMark renders references as the characters they name, so
both surfaces do; code shows exactly what was typed.

### DEC-4 — Read and edit share the code block header

**Reference:** `spec:AST-061/DEC-4`
**Decider:** cixzhang, 2026-10-06

The language label tells a reader what the code is in both modes, and a
header present in only one mode moves every line of code on the switch. The
header is a frame around the document, not document content, so editing never
reaches it.

### DEC-5 — One decoder for character references

**Reference:** `spec:AST-061/DEC-5`
**Decider:** cixzhang, 2026-10-06

`decodeMarkdownCharacterReferences(text)`, exported from the server-safe
`@astryxdesign/core/Markdown/parser` subpath and from
`@astryxdesign/core/Markdown`, returns `text` with every valid named or
numeric character reference replaced by the characters it names, and a
numeric reference to NUL, a surrogate, or a code point past U+10FFFF replaced
by U+FFFD, as CommonMark specifies; an unknown name, a reference without its
semicolon, and all other text stay as written.
It works on plain text and knows nothing of Markdown: each caller decides
where it applies, so backslash escapes and code stay literal. It is the
decoder `Markdown` itself renders with: one implementation and one named
reference table, private to `Markdown`, so the surfaces cannot drift apart.
This is the narrow exception to this record's non-goals on import mechanism
and equivalent internals; every other internal stays free, and no general
HTML entity utility is exported.

### DEC-6 — List markers cycle by depth

**Reference:** `spec:AST-061/DEC-6`
**Decider:** cixzhang, 2026-10-06

A list's depth is the number of lists, bulleted or numbered, that enclose it;
a top-level list has depth 0. A bulleted list draws disc, circle, or square
markers when its depth modulo 3 is 0, 1, or 2; a numbered list writes its
numbers as decimal, lower-alpha, or lower-roman the same way. The cycle
repeats without end, so each level differs from the levels beside it and a
reader can tell depth apart on every surface. Numbering keeps the list's
start value and counts the same items; only how each number is written
changes. Letters past `z` continue as `aa`, `ab`, and so on. A number outside
its style's range — zero or a negative number under lower-alpha or
lower-roman, as a start of 0 or below gives, or a number past 3999 under
lower-roman — is written in decimal, as the CSS counter styles fall back; the
start value and the items stay as written. Task list items show checkboxes
instead of markers. Markers are presentation: the
list keeps its list semantics, and the source does not change.

### DEC-7 — RichText is a form-field editor whose value is Lexical editor state

**Reference:** `spec:AST-061/DEC-7`
**Decider:** cixzhang, 2026-10-14

`RichTextEditor` is a public form-field editor: a labelled field in which a
person writes formatted text. Its value is serialized Lexical `EditorState`
JSON: `defaultValue` takes it, `onChange` reports the editor state that
serializes to it, and `RichTextView` renders it. Markdown is an import and
export format, not the value: `markdownToEditorStateJSON` and
`editorStateJSONToMarkdown` convert between the two, and `spec:AST-062` owns
what that conversion returns. RichText is not a document editor; collaboration,
persistence, and document hosting stay outside it, and a product that edits
whole documents chooses its own engine and stored value. This record stays
the one visual contract that RichText and `Markdown` share.

### DEC-8 — RichText's public surface is Lexical's, kept small

**Reference:** `spec:AST-061/DEC-8`
**Decider:** cixzhang, 2026-10-14

RichText is built on Lexical and says so: `nodes` and `transformers` take
Lexical types, `plugins` takes Lexical React plugins, and `onChange(editorState,
editor)` and the editor ref's `getEditorState()` report Lexical types, so a
caller extends the editor with Lexical directly.
The package supports one Lexical minor and declares it in its Lexical peer
ranges; `spec:AST-017` classifies a change to that minor. The package exports
only what a caller builds with: the generated editor theme classes, the
autolink regular expressions, and a re-export of Lexical's `Transformer` type
are internal, and `Transformer` comes from `@lexical/markdown`.
`RichTextEditorToolbar` takes `BaseProps` and a `ref` and passes them to the
core `Toolbar` it renders, which places them as it places its own: the `ref`
and styling on its root, and other base props on its `role="toolbar"`
element. Its option for links that open in a new tab is `hasNewTabLinks`. `RichTextEditorAutoLinkPlugin` renders no element of
its own, so it takes no `BaseProps`.
Rejected: Astryx document, node, and plugin types over Lexical's, because they
would duplicate Lexical's extension model with no gain for a caller.

### DEC-9 — Fenced code wraps

**Reference:** `spec:AST-061/DEC-9`
**Decider:** cixzhang, 2026-10-14

A reader on a narrow screen sees a whole code line without scrolling it
sideways, and a long line takes the same height in read and edit mode, so the
switch does not move the blocks below it (FR9). Wrapping is presentation: the
code's text, its line numbers, and what copy returns do not change.
Rejected: both surfaces scrolling sideways, because editing inside a
sideways-scrolling region hides the caret's context.

## Open questions

- None.
