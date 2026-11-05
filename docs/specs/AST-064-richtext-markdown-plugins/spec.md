---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-064
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
affects_consumer_docs: [RichTextEditor, RichTextView, Markdown]
---

# Markdown plugins in RichText system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A product that extends Markdown with a plugin writes the plugin once. The
same inline syntax, and the same block syntax at the top level of a document,
becomes the same node, drawn by the same renderer, whether a person reads the
document in `Markdown`, views it in `RichTextView`, or edits it in
`RichTextEditor`. Each surface uses only the plugins its caller gives it, and
a plugin RichText cannot honor exactly is refused rather than half applied.
Syntax a surface does not adopt stays as the author wrote it.

## Non-goals

- Block extension syntax nested inside a list item, a quote, or a table cell.
  It stays literal text in RichText.
- Editing inside an extension node, plugin-supplied editing commands or
  toolbars, and inserting new extension nodes from the editor's interface.
- Running a plugin's immutable document transform while editing, and
  plugin-derived heading projection or outlines. Plugins that need them are
  refused (FR4).
- Moving RichText's own Markdown import onto core's parser. Core's parser
  recognizes adopted plugin syntax only (FR5); RichText's transformers import
  everything else.
- Deprecating or removing the `transformers` prop and option.
- A public theme target for extension nodes; each plugin's renderer owns its
  node's visuals.
- Rendering RichText surfaces in Server Components, server-rendering
  `RichTextView`'s content, which stays filled in the browser, and
  serializable extension props.
- Exposing the editor engine's own plugin, node, or extension types through
  RichText's public API; package discovery; global registration; streaming
  input.

## Requirements

- **FR1 — One definition.** A plugin is the entry core's
  `createMarkdownPlugin` returns. RichText adopts that same entry through
  `createRichTextExtension(plugin)` (FR3), which returns an opaque
  `RichTextMarkdownExtension`. RichText recognizes the
  plugin's syntax with core's parser and draws its nodes with core's own
  extension rendering (FR8); there is no RichText-specific plugin format and
  no second copy of a plugin's parsing or rendering. Plugin entries stay
  opaque: RichText reads only what core's plugin protocol exposes.
- **FR2 — Adopted per surface, never globally.** A RichText surface uses
  exactly the extensions its caller passes it: `markdownExtensions` on
  `RichTextEditor` and `RichTextView`, and the `extensions` option of
  `markdownToEditorStateJSON`. Nothing registers on import, globally, or by
  discovery. Surfaces with different extensions on one page do not affect
  each other.
- **FR3 — A server-safe entry point.** `createRichTextExtension`,
  `RichTextMarkdownExtension`, `RichTextExtensionError`,
  `markdownToEditorStateJSON`, `editorStateJSONToMarkdown`, and their option
  types are exported from `@astryxdesign/richtext/markdown`, which imports no
  React, DOM, or client-only module: from core it imports the parser and the
  server-safe plugin protocol, never the plugin renderer (FR8). The package's
  main entry stays a client module and re-exports them for client code; server
  and Node code imports them from `@astryxdesign/richtext/markdown`. An extension holds its plugin's
  functions and renderers, so it is not serializable: client modules create
  the extensions they pass to `RichTextEditor` and `RichTextView`, and
  headless code creates its own from the plugin and the server-safe entry.
- **FR4 — Default-deny.** `createRichTextExtension` reads a plugin's
  capabilities with `getMarkdownPluginCapabilities(plugin)`, exported from
  core's server-safe `@astryxdesign/core/Markdown/plugins` subpath, which
  reports whether the plugin declares syntax and whether it declares an
  immutable transform, and nothing else about its definition. RichText adopts syntax; a plugin that declares a
  transform is refused: `createRichTextExtension` throws a
  `RichTextExtensionError` naming the plugin and the capability, before any
  surface uses it. A syntax match whose node name has no renderer never
  becomes a node — core's parser rejects it and reports a syntax failure — so
  its source stays text. A refused or absent plugin's syntax imports as
  literal text (`spec:AST-062` FR5).
- **FR5 — Core recognizes plugin syntax first.** Before RichText's own
  Markdown import reads a top-level block, core's parser, given exactly the
  adopted plugins, finds their nodes in it. Each node's exact source is
  shielded from RichText's import and becomes one extension node; RichText's
  transformers import everything else as they do without plugins. Where core
  recognizes plugin syntax, the plugin's node wins for that range. The
  recognized spans are the spans core `Markdown` recognizes with the same
  plugins — the same start, end, display, node name, and data, and nothing
  inside code, after an escaping backslash, or anywhere else core shields
  from plugins — for inline syntax wherever inline content imports and block
  syntax at the top level.
- **FR6 — Extensions and transformers never own the same node.** The
  `transformers` prop and option import base Markdown after the adopted
  extensions have claimed their spans (FR5). Ordinary syntax overlap is not a
  conflict: inside a span core recognizes for a plugin, the plugin's node
  wins, so link, list, emphasis, or any other transformer syntax within plugin
  source never stops a document from opening. A surface or serializer is
  refused when it is configured — it throws a `RichTextExtensionError` naming
  the plugin, the transformer or second extension, and the capability — if a
  transformer imports or exports an extension's node type, or two extensions
  adopt the same plugin.
- **FR7 — Extension nodes are atomic.** A recognized span is one node in the
  editor that cannot be typed into. The caret moves over it in one step; it is
  selected, deleted, cut, copied, pasted, moved, undone, and redone whole. An
  inline node sits in its line of text; a block node is a top-level block.
  Assistive technology meets each node once, in document order, with the
  semantics its renderer gives it; the node adds no tab stop of its own.
- **FR8 — Rendering matches core.** A node renders through
  `MarkdownPluginNodeRenderer`, exported from core's client-only
  `@astryxdesign/core/Markdown/plugin-renderer` subpath, which renders one
  parsed extension node with the given plugins with exactly the DOM,
  accessibility, theme targets, fallback, and failure reporting that
  `Markdown` presents for that same node — its plugin's renderer for its node
  name inside core's error boundary and suspense fallback — and adds no
  element or theme target of its own. `RichTextEditor` and `RichTextView`
  import it; the server-safe entry never does. A renderer that returns nothing
  renders nothing. If the renderer
  throws when called or while rendering, the node shows its readable text in
  place — its source, or the renderer's `toText` for a node with no source —
  and shows the same text while the renderer suspends. A surface without the
  node's plugin shows its source. A failure never breaks the rest of the
  surface.
- **FR9 — Diagnostics match core.** RichText reports a plugin's failures
  through core's plugin failure reporting, as `Markdown` does: once per plugin
  and phase, `plugin "<name>" failed in <phase>; rendered readable fallback.`
  It adds no diagnostics channel of its own.
- **FR10 — The authored source is authoritative.** An extension node exports
  exactly its source bytes wherever it is, so documents with plugin syntax
  keep `spec:AST-062` FR1–FR5: an unchanged document round-trips byte for
  byte; editing around a node never rewrites it; moving it moves its bytes. A
  document imported without the plugin keeps the syntax as literal text and
  exports it unchanged.
- **FR11 — Stored state is re-derived from source.** Stored editor state
  keeps each extension node's exact source, its plugin's name and protocol
  version (`apiVersion`), and the data derived for rendering. When a surface
  loads stored state, it derives each node again from its source with the
  adopted plugin and never renders stored data on its own. A node whose
  source the adopted plugin no longer recognizes as that node — the plugin's
  syntax or protocol version changed without a migration, or the plugin is
  absent — loads as its source, literal text that exports unchanged.
- **FR12 — Headless use is server-safe.** Recognition, import, export, and
  `createRichTextExtension`, imported from `@astryxdesign/richtext/markdown`,
  run in Node and in server code with no DOM. RichText's surfaces are client
  components: they are not rendered as Server Components, and extensions are
  not serializable props (FR3). `RichTextView` keeps its client boundary — its
  content fills in the browser — and a server-rendered page that contains it
  hydrates without mismatches when extensions are adopted.

### Platform support

- Supported feature/engine floor: wherever RichText renders; recognition,
  import, and export also run headless in Node through
  `@astryxdesign/richtext/markdown`.
- Unsupported behavior: none beyond the non-goals.
- Browser evidence: required for FR7 and FR8 (keyboard, selection,
  clipboard, history, rendering, and assistive-technology order in the
  editor) and for FR12's hydration.

## Current-state impact

RichText does not adopt Markdown plugins: plugin syntax imports as literal
text and exports as authored (`spec:AST-062` FR5), and `RichTextEditor`,
`RichTextView`, and `markdownToEditorStateJSON` take no Markdown plugins.
Their `nodes`, `plugins`, and `transformers` props and options, which take
editor-engine nodes, React plugins, and editor-engine Markdown transformers,
keep working beside `markdownExtensions`. The package has one entry point, a
client module, and the Markdown serializers are reachable only through it;
`@astryxdesign/richtext/markdown` adds the server-safe one. Core's
server-safe `@astryxdesign/core/Markdown/plugins` subpath exports plugin
construction, the first-party helpers (text transforms, semantic fences,
source decoration, frontmatter, soft breaks, heading links), and the protocol
types (`component:Markdown` lists them); none of them reports a plugin's
capabilities or renders one node, and entries stay opaque. Core renders
extension nodes only inside `Markdown`. `getMarkdownPluginCapabilities` and
the client-only `@astryxdesign/core/Markdown/plugin-renderer` subpath with
`MarkdownPluginNodeRenderer` are additive.

## Verification

| Contract | Verification                                                                                                                                          | Representative states                                                                                                                                                                                                                                                            | Mutation or failure expectation                                                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | The same plugin entry passed to `Markdown` and to `createRichTextExtension`                                                                           | A plugin with inline and block contributions and data                                                                                                                                                                                                                            | A RichText-only definition, or a second tokenizer or renderer, fails                                                                                                                                                      |
| FR2      | Two surfaces on one page, one with the extension and one without; import with and without                                                             | Editor and view; `markdownToEditorStateJSON` with and without `extensions`                                                                                                                                                                                                       | One surface's extension changing the other, or recognition without an explicit extension, fails                                                                                                                           |
| FR3      | The packages' built exports, types, and import graphs, loaded in Node, in a server module, and in a client module                                     | `@astryxdesign/richtext/markdown` and `@astryxdesign/core/Markdown/plugins` with no DOM; `@astryxdesign/core/Markdown/plugin-renderer` as a client module; the RichText main entry re-exporting the server-safe one; a production bundle that imports only the server-safe entry | A server-safe entry importing React components, the DOM, a client module, or the plugin renderer; a renderer subpath without its client boundary; a missing export or type; or client code in a server-only bundle, fails |
| FR4      | `getMarkdownPluginCapabilities` and `createRichTextExtension` over the capability matrix                                                              | Syntax with renderers; a transform; a transform with syntax; a match whose node name has no renderer; a refused plugin's syntax in a document                                                                                                                                    | Accepting a transform; a refusal that does not name the plugin and capability; a capability report that exposes more than syntax and transform; a rendererless match becoming a node; or dropped syntax fails             |
| FR5      | A corpus parsed by core and imported by RichText with the same plugins, node by node                                                                  | Inline and block matches; a deferred and a failed match; syntax inside inline code and fenced code; an escaped start; plugin syntax that base Markdown would also read (an emphasis-like delimiter); inline syntax in lists, quotes, and table cells; nested block syntax        | A span, display, node name, or data that differs from core, base Markdown read inside a plugin span, or nested block syntax recognized fails                                                                              |
| FR6      | Surface and serializer configuration, and documents opened under it                                                                                   | A transformer that imports or exports an extension's node type; two extensions for one plugin; a note plugin whose source holds a link, a list marker, and emphasis, opened with the default transformers; an unrelated custom transformer                                       | A conflicting configuration that does not throw, an error that omits the plugin, the transformer or extension, or the capability, or a document that fails to open because base syntax sits inside plugin source, fails   |
| FR7      | Real-browser editing of inline and block nodes                                                                                                        | Arrow keys across, Shift-selection, Backspace and Delete, cut, copy, paste into another editor with and without the extension, undo, redo, typing beside a node                                                                                                                  | A caret inside a node, a partial deletion, or a node split by an edit fails                                                                                                                                               |
| FR8      | The exact same node rendered by `Markdown`, by `MarkdownPluginNodeRenderer`, and in both RichText surfaces, compared below `Markdown`'s block wrapper | A renderer that returns content; one that returns nothing; one that throws when called; one whose component throws; one that suspends; a node with no source; a surface without the extension                                                                                    | Any difference in the node's DOM, accessibility tree, theme targets, fallback, or failure report; or an element or theme target the renderer adds, fails                                                                  |
| FR9      | Failure reporting from both surfaces                                                                                                                  | A syntax failure; a render failure, repeated                                                                                                                                                                                                                                     | A report that differs from core's message or frequency, or a RichText-only diagnostic, fails                                                                                                                              |
| FR10     | `spec:AST-062`'s conformance corpus with plugin syntax added                                                                                          | Unchanged documents; an edit beside a node; a node moved; import without the plugin                                                                                                                                                                                              | Any byte of a node's source changing, or source lost without the plugin, fails                                                                                                                                            |
| FR11     | Stored state loaded under changed plugins                                                                                                             | The same plugin; a changed protocol version; changed syntax that no longer matches; stored data edited to disagree with the source; no plugin                                                                                                                                    | Rendering stale stored data, or a lost or changed source byte, fails                                                                                                                                                      |
| FR12     | Headless runs and hydration                                                                                                                           | Node import and export with extensions from the subpath; `createRichTextExtension` without a DOM; a server-rendered page hydrating a `RichTextView` with inline and block nodes                                                                                                  | Browser-only work during creation, import, or export, or a hydration mismatch, fails                                                                                                                                      |

## Decision log

### DEC-1 — A plugin is written once, in core's protocol

**Reference:** `spec:AST-064/DEC-1`
**Decider:** cixzhang, 2026-10-06

Core's plugin protocol already bounds syntax, shields built-in constructs,
validates nodes, and renders with fallbacks. RichText adopts those entries
as they are, recognizing syntax through core's parser and drawing nodes with
the plugin's renderers, so a plugin cannot mean one thing when read and
another when edited. Rejected: a RichText plugin format, which would copy
each plugin's parsing and rendering and let them drift.

### DEC-2 — Each surface adopts plugins explicitly

**Reference:** `spec:AST-064/DEC-2`
**Decider:** cixzhang, 2026-10-06

A surface's extensions are the ones its caller passes, as `Markdown`'s
`plugins` are. Rejected: a global registry, which lets one product's plugin
change another surface's documents and makes behavior depend on import
order.

### DEC-3 — Default-deny: adopt only what RichText honors exactly

**Reference:** `spec:AST-064/DEC-3`
**Decider:** cixzhang, 2026-10-06

An editor that silently skipped part of a plugin — its transform, say —
would show a different document than `Markdown` shows for the same source.
RichText adopts a plugin only when it honors every capability, and refuses
it loudly otherwise, leaving its syntax as text. Rejected: partial adoption
with a warning.

### DEC-4 — Core recognizes plugin syntax; RichText imports the rest

**Reference:** `spec:AST-064/DEC-4`
**Decider:** cixzhang, 2026-10-06

Plugin syntax means what core's parser says it means, so core finds it
first and its range is closed to RichText's import; base Markdown stays with
RichText's transformers. Base syntax inside plugin source is the plugin's,
and only a transformer that owns an extension's node type conflicts with it,
which is refused when the surface is configured, never when a document
opens. Rejected: moving all of RichText's import onto core's parser in this
record; last-one-wins between an extension and a transformer; and failing a
document because base syntax appears inside plugin source.

### DEC-5 — Extension nodes are atomic, and their source is the truth

**Reference:** `spec:AST-064/DEC-5`
**Decider:** cixzhang, 2026-10-06

Core's protocol reads syntax into nodes and renders them; it has no way to
write a changed node back to Markdown. An atomic node keeps its authored
source, exports exactly that, and is derived again from it whenever it
loads, so stored data can never drift from the document. Stored state names
the plugin only by what its entry exposes, its name and protocol version:
re-derivation, not a stored identity, decides what a node is. Rejected:
editable extension content, which would need a serializer per plugin, and
trusting stored data across plugin versions.

### DEC-6 — Core exposes only the facts RichText needs

**Reference:** `spec:AST-064/DEC-6`
**Decider:** cixzhang, 2026-10-06

Plugin entries are opaque so that every consumer goes through core's
validation, shields, and fallbacks. RichText needs two things from core: to
know whether a plugin declares a transform, and to render one node the way
`Markdown` does. Core exposes exactly those: a read-only capability report in
the server-safe plugin subpath, and a single-node renderer in a client-only
subpath that presents a node exactly as `Markdown` does, with no element of
its own; sharing one rendering path inside core keeps the two from
drifting.
Rejected: putting the renderer in the server-safe plugin subpath, which would
pull client code into server imports; exposing plugin definitions, which
would invite copies of parsing and rendering; and rendering each node as a
whole `Markdown` document, which adds a document element and `Markdown`'s
theme target inside the editor.

## Open questions

- None.
