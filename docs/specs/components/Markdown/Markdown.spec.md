---
schema_version: 3
template_version: 3
kind: component
id: component:Markdown
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-03
owners: [cixzhang]
review_triggers: [api, theming, behavior, layout, accessibility]
verified_by:
  [
    packages/core/src/Markdown/Markdown.test.tsx,
    packages/core/src/Markdown/Markdown.renderBoundary.test.tsx,
    packages/core/src/Markdown/Markdown.public.test.ts,
    packages/core/src/Markdown/MarkdownTable.a11y.chromium.spec.ts,
    packages/core/src/Markdown/parser.test.ts,
    packages/core/src/Markdown/incremental.test.ts,
    packages/core/src/Markdown/remark.test.tsx,
    packages/core/src/Markdown/plugins/softBreaks.test.tsx,
    packages/core/src/Outline/parseOutlineFromMarkdown.test.ts,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules:
  [
    module:Markdown/headingLinks,
    module:Markdown/remark,
    module:Markdown/softBreaks,
    module:Markdown/sourceLines,
  ]
families: [family:navigation-destinations]
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs:
  [
    spec:AST-002/DEC-1,
    spec:AST-002/DEC-5,
    spec:AST-005/DEC-1,
    spec:AST-005/DEC-2,
    spec:AST-025/DEC-1,
    spec:AST-025/DEC-4,
    spec:AST-036/DEC-1,
    spec:AST-036/DEC-2,
    spec:AST-036/DEC-3,
    spec:AST-036/DEC-4,
    spec:AST-061/DEC-5,
    spec:AST-061/DEC-6,
    spec:AST-061/DEC-9,
    spec:AST-064/DEC-6,
    spec:AST-036/DEC-12,
  ]
---

# Markdown component contract

## Intent

Markdown renders parsed content in a Document with stable default block parts and
constrained renderer seams. Callers may opt into the canonical plugin protocol for
bounded source syntax, immutable document transformation, typed extension
rendering, and native typed document-start frontmatter. They may separately opt into dollar-delimited math by supplying one typed
renderer for both inline and display expressions. The parser accepts matching
explicit options. They may also list CodeBlock language values in
`codeLanguages` so fences in those languages paint with them (FR30). Plugins,
math, and `codeLanguages` change nothing when absent; the default Code
block path renders `diff` and `diff-<language>` fences as CodeBlock's diff layer
(FR29), wraps every fence's long lines (`spec:AST-061` FR5, DEC-9), and lays
out a fence with no header the way CodeBlock does (`component:CodeBlock` FR11),
and every other parsing, rendering, styling, and streaming behavior is the
released one.

## Compatibility and migration

- Released default preserved: `yes`, except the default Code block path for `diff` fences (FR29, below), its long-line wrap (below), and its headerless layout (below)
- Compatibility class: additive, opt-in public API, with three visible
  default-path rendering changes (the FR29 diff layer, the fenced-code wrap, and
  the headerless layout, below); existing parser nodes, DOM, styling, targets,
  dollar-delimited text, `components`, and `inlinePlugins` remain unchanged unless
  the caller supplies `plugins`, supplies `components.math`, supplies
  `codeLanguages`, or passes the matching explicit parser option.
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none
- Additive opt-in prop (FR30): `codeLanguages` lets fences in less common languages paint with `component:CodeBlock` language modules; without it nothing changes.
- Default-path rendering change for diff fences (FR29), a visible default change
  and not a breaking one: a `diff` fence that rendered as plain text renders as CodeBlock's diff
  layer over plaintext with a `diff` label, and a `diff-<language>` fence —
  which rendered as plain text with a `diff` label and viewport name, its
  leading word being all Markdown read — as the layer over that language with
  a `<language> diff` label; the header, copy, disclosure, and viewport name
  stay as for any other fence, and a supplied `code` renderer's contract is unchanged. The way back to
  plain text is a `text` fence or a custom `code` renderer. Every other fence
  is unchanged apart from the wrap and the headerless layout below.
- Default-path wrap change (`spec:AST-061` FR5, DEC-9), visual and not breaking:
  the default Code block wraps long lines instead of scrolling them sideways, so
  a fence whose lines no longer overflow also no longer takes the conditional
  scroll-region tab stop. Text, line numbers, syntax colours, copy output, and a
  supplied `code` renderer's contract are unchanged. The way back to sideways
  scrolling is a custom `code` renderer.
- Default-path headerless layout (`component:CodeBlock` FR11), visual and not
  breaking: a fence with no language label shows Copy in its own column beside
  the code, so long lines wrap before it. A fence that names a language other than
  `plaintext` keeps its header at every line count. Text, copy output, syntax colours, the
  viewport name, and a supplied `code` renderer's contract are unchanged.
- Default-path layout change (FR26–FR28): a default table's columns may become
  wider than the released fixed buckets, never narrower; header labels wrap
  instead of truncating; a table that squashed its columns may now scroll.
  Public API, options, and theming targets are unchanged, and Table's released
  wrap mode for data-driven callers is unchanged. The DOM does change on this
  path: Markdown's `markdown-table` block gives up the horizontal overflow,
  `role`, accessible name, and tab stop it duplicated, leaving the nested
  Table's Scroll region as the sole scroll viewport, accessible name, and
  conditional keyboard stop. A table therefore exposes one named region and
  one conditional tab stop where it previously exposed two, and the block
  keeps its target and its spacing, sizing, and alignment ownership.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The Document and its current `markdown` target in block and inline display.
- Default Heading, Paragraph, List, Code block, Blockquote, Table, Divider, and
  Image block presentation and the eight current block targets documented below.
- Applying block spacing and reflected density (plus Heading level) to those
  targets on the default render path.
- Opt-in recognition of `$…$` inline math and `$$…$$` display math, including
  delimiter boundaries, escape behavior, parser nodes, and streaming parity.
- Passing each recognized expression as inert text to the caller's one math
  renderer with an `inline` or `block` display value.
- Applying the canonical `plugins` protocol in the fixed syntax → immutable
  transform → render order while preserving built-in lexical shields, Core-owned
  semantics, and local readable fallback.
- Validating and freezing replacement document roots before later transforms or
  rendering observe them.
- Sharing plugin-enabled parse configuration, transformed heading projection, and
  collision-safe heading IDs with Markdown-derived Outline utilities.
- Decoding an optional document-start frontmatter block into caller-defined typed
  metadata, withholding unfinished frontmatter while streaming, and excluding
  completed frontmatter syntax from rendered content.

**Does not own / non-goals**

- Output supplied by custom renderers; each custom component owns its replacement's
  structure, styling, and accessibility semantics.
- Inline emphasis, link, inline-code, citation, plugin, or math-renderer output as
  additional default block anatomy.
- Nested anatomy or targets owned by CodeBlock, Blockquote, List, CheckboxList,
  or Table.
- Executing or sanitizing a renderer's math or plugin output, raw HTML parsing,
  mutable or unrestricted AST plugins, package discovery, or new
  list/table/inline-style override slots.

## Public concepts

`plugins` is one optional ordered list of opaque entries created by
`createMarkdownPlugin()`. A plugin declares only the `syntax`, `transform`, and
`renderers` capabilities it uses. Syntax-bearing entries supply stable parse
identity. Parsing, transforms, rendering, and Outline use one stable, strictly typed,
MDAST-aligned canonical tree; `parseMarkdownAst()` and `parseInlineAst()` expose
that tree from the server-safe `@astryxdesign/core/Markdown/parser` subpath while
`@astryxdesign/core/Markdown/plugins` remains server-safe for constructing and
running plugins in server or RSC code. The rendered `Markdown` component remains a
client entry: function-bearing plugin entries are not serializable props and cannot
cross an RSC boundary. `MarkdownAstNodeMap` and `visitMarkdownNodes` provide
node-kind narrowing. Released parser functions preserve their existing result shape
through a compatibility projection. Transforms return validated replacement roots
without entering parse identity. Every extension node introduced
by syntax or transformation has complete renderer ownership and a deterministic
text projection. Text matching, semantic fences, source decoration, and native
frontmatter are helpers that compile to transforms rather than separate protocol
phases. Frontmatter is document metadata: it has no renderer, uses a bounded
first-party key/value grammar rather than Remark compatibility, and exposes typed
metadata through the helper that created it. `spec:AST-036`
owns the shared protocol and limited Remark compatibility profile,
`module:Markdown/remark` owns that profile's adapter,
`module:Markdown/headingLinks` owns its opt-in identity projection and permalink
composition, and this component owns aggregate application and fallback.

`decodeMarkdownCharacterReferences(text)` is the character reference decoder
`Markdown` renders with, exported from the server-safe
`@astryxdesign/core/Markdown/parser` subpath and from
`@astryxdesign/core/Markdown` so the RichText surfaces decode references
exactly as `Markdown` does. It decodes valid named and numeric references in
plain text and leaves everything else as written; the named reference table
stays private. `spec:AST-061/DEC-5` owns its contract.

`module:Markdown/sourceLines` owns the opt-in source-line stamps on rendered
blocks and the optional `sourceLines` prop that `components` block renderers
receive while its plugin is installed; without it no renderer receives the prop.

`getMarkdownPluginCapabilities(plugin)`, exported from the server-safe
`@astryxdesign/core/Markdown/plugins` subpath, reports only whether an entry
declares syntax and whether it declares a transform; the entry stays opaque.
`MarkdownPluginNodeRenderer`, exported from the client-only
`@astryxdesign/core/Markdown/plugin-renderer` subpath, renders one parsed
extension node with the given plugins with exactly the DOM, accessibility,
theme targets, fallback, and failure reporting that `Markdown` presents for
that same node — its plugin's renderer inside Markdown's error boundary and
suspense fallback — and adds no element or theme target of its own.
`spec:AST-064/DEC-6` owns both, so the RichText surfaces adopt plugins
without reading their definitions or copying their rendering.

### Acceptance and implementation state

The plugin clauses below are the accepted target contract for the AST-036 rollout,
not a claim that the APIs already ship. Until every clause's implementation and
verification land, the currently released no-plugin, parser, `components`, and
`inlinePlugins` behavior remains the only available contract. Each implementation PR
must identify the clauses it completes without weakening the zero-breaking baseline.

`MarkdownComponents.math` is one optional renderer with the signature
`({value: string, display: 'inline' | 'block'}) => ReactNode`. Supplying it opts
the component into math parsing because the caller owns both whether dollar
syntax means math and how formulas are rendered. Direct parser callers make the
same choice with `MathParseOptions` (`{math: true}`); incremental callers pair
that option with `createIncrementalState<true>()`, which returns the exported
`IncrementalParseState<true>`. Default calls and values
annotated as `ParseOptions` keep the released `InlineNode` and `BlockNode`
unions. Enabled calls return the explicit `InlineNodeWithMath` and
`BlockNodeWithMath` supersets, whose added leaves are `MathInlineNode` and
`MathBlockNode`. Exact syntax and examples remain in `Markdown.doc.mjs`.

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1  | Block and inline displays render one Document root carrying the current `markdown` target. Inline display renders no block anatomy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| FR2  | On the default block render path, Heading, Paragraph, List, Code block, Blockquote, Table, Divider, and Image carry the eight current local block targets documented below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FR3  | A supplied `heading`, `paragraph`, `code`, `blockquote`, `hr`, or safe-URL `image` renderer replaces the corresponding default part, so Markdown does not impose that part's local target on the replacement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR4  | The released Code block target remains `markdown-codeblock`; this compatibility anomaly is not renamed or aliased.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| FR5  | Density and Heading level remain reflected capabilities on their owning targets. Display mode, streaming state, and renderer selection do not become separate anatomy entries.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FR6  | Without `components.math`, Markdown does not recognize math syntax. Default, legacy-set, `math: false`, and `ParseOptions`-annotated parser calls retain the released `InlineNode` / `BlockNode` result unions; only `MathParseOptions` returns the explicit math-enabled unions.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| FR7  | With math enabled, `$…$` produces an inline `math` node and `$$…$$` produces a block `math` node. The renderer receives the delimiter-free source as `value` and its placement as `display`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FR8  | Inline math stays on one line, cannot have whitespace touching either delimiter, and cannot open immediately after a digit or close immediately before one. `$$` is reserved for display math. These boundaries keep paired currency amounts literal.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR9  | A backslash-escaped dollar is literal outside math and does not close math inside it. An unmatched inline or display delimiter remains literal in non-streaming output.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| FR10 | Code spans and fenced code blocks are opaque to math parsing. Link destinations are opaque; link labels may contain inline math. Inline plugins run only on prose text and never inside math.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR11 | Streaming converges to the same nodes as a full parse at every chunk boundary, including display math nested in ordinary lists, task lists, blockquotes, and their supported combinations, with LF or CRLF and with or without source ranges. Incomplete math is withheld only while its exact owning container remains open; a list/quote exit or quote-depth change restores literal parsing. Math-enabled incremental calls require `IncrementalParseState<true>`, so the cache and returned union share one contract.                                                                                                                                                                           |
| FR12 | Omitting `plugins` and passing an empty list are one semantic empty pipeline with identical parser unions, AST, DOM, styling, targets, IDs, and streaming behavior. Core may skip empty preparation and allocation without creating a separate behavior model. `components`, `inlinePlugins`, citations, autolinking, sources, and math retain their released meaning.                                                                                                                                                                                                                                                                                                                              |
| FR13 | Plugin-enabled parsing follows built-in lexical shields and ordered syntax claims, then uses one stable, strictly typed, MDAST-aligned canonical tree for transforms, rendering, and Outline. `MarkdownAstNodeMap` and `visitMarkdownNodes` narrow callbacks by node kind. Released parser functions preserve their existing result shape through a compatibility projection. Every returned root is finite, acyclic, representable, validated, and frozen before later plugins or rendering observe it.                                                                                                                                                                                            |
| FR14 | Plugin failures preserve the last valid document and readable authored source. Core retains heading, navigation, image, list, table, and document semantics and exposes no raw-markup parser channel, registry, package discovery, mutable shared AST, or unrestricted DOM hook. URL-like plugin data remains untrusted; Astryx-owned sinks follow `family:navigation-destinations`.                                                                                                                                                                                                                                                                                                                |
| FR15 | Incremental parse identity contains every parse-affecting Markdown option and only ordered syntax-bearing plugin name, protocol version, and `parseKey`. Transform or renderer changes reuse settled parse output, rerun transformation, and do not remount unaffected extension output.                                                                                                                                                                                                                                                                                                                                                                                                            |
| FR16 | Plugin-enabled Markdown and Markdown-derived Outline use the same parse options, ordered transforms, extension text projection, and installed heading projection so every Outline target agrees with rendered identity. A first-party module may compose a different heading projection only under its own current module contract; Markdown owns only this shared invocation seam. A limited Remark adapter may run only synchronous transform plugins whose input and output round-trip through the documented supported MDAST subset.                                                                                                                                                            |
| FR17 | An extension node declares `content` as `'none'`, `'phrasing'`, `'flow'`, or an explicit `{allow, min?, max?}` allowlist that narrows the category its `display` implies. Markdown parses every container's inner source span under the same grammar and shields, validates children at each transform boundary, renders children through the same built-in renderers and `components` seams, counts nesting toward the built-in depth bound, uses the FR16 projection, and renders children in place when a container renderer fails.                                                                                                                                                              |
| FR18 | A transform may read and remove another plugin's extension nodes, including a subtree containing them, and may insert or remove headings; it may not create, edit, internally reorder, or duplicate another plugin's nodes, change a source heading's depth, or forge or duplicate heading identity. `dependsOn` is validated at preparation; an unmet or misordered dependency skips only that plugin's transform. Every rejection names the rule and owning plugin.                                                                                                                                                                                                                               |
| FR19 | `onPluginDiagnostic` is available on the component and parser options and receives one source-free event — plugin, phase, stable code, severity — per failure, advisory, or silent degradation, in development and production, rate-limited with a suppression code. Admission, duplicate-name, and protocol-version failures behave identically through the component and every parser entrypoint: the call succeeds with the last valid configuration and never throws into the caller.                                                                                                                                                                                                           |
| FR20 | `parseMarkdownAst()` and `parseInlineAst()` return the canonical tree and accept the same options and plugin list as the component; `@astryxdesign/core/Markdown/parser` exposes parsing, canonical AST types, and plugin admission with no client boundary. `createMarkdownPlugin()` infers the extension-node union, so no callsite needs explicit type arguments, and a declaration that yields no usable extension type is a type error rather than a silent `never`.                                                                                                                                                                                                                           |
| FR21 | A transform runs again for every streamed update and must be idempotent and convergent; transforms whose effect requires complete input use the final-input signal. Semantically equal plugin lists reuse prepared work whether or not the array reference is stable, and development reports one diagnostic when a recreated list prevents reuse.                                                                                                                                                                                                                                                                                                                                                  |
| FR22 | An extension renderer may opt into the Markdown-owned extension theme target so themes reach plugin output. Opting out leaves output untargeted. The target adds no default styling or anatomy beyond the block spacing and content width Core already applies.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| FR23 | Markdown owns an explicit supported dialect rather than claiming full CommonMark or GFM conformance. Adjacent compatible ordered or unordered items remain one list regardless of task-marker presence; each item independently preserves its checked state or ordinary list-item semantics, including at nested levels. The default grammar keeps its released task-list and table support, while `autolink: 'gfm'` adds only the documented autolink behavior and does not toggle any other syntax.                                                                                                                                                                                               |
| FR24 | `createMarkdownFrontmatter()` recognizes only a leading `---` block of unique `key: value` lines, decodes it through the caller's typed parser, stores finite JSON-like metadata on the canonical document, and removes the syntax from rendered content. An unfinished leading block yields no visible Markdown while streaming; malformed or unfinished final input remains ordinary Markdown. Frontmatter has no renderer and requires no Remark compatibility.                                                                                                                                                                                                                                  |
| FR25 | The canonical parser and plugin-construction subpaths remain server-safe and can run function-bearing plugins entirely within server or RSC code. The client-owned `Markdown` component supports traditional and streaming SSR, but plugin entries containing functions cannot be serialized from a Server Component into that client boundary; direct RSC rendering requires a future additive server renderer rather than weakening the plugin protocol.                                                                                                                                                                                                                                          |
| FR26 | On the default table path each column has a content-derived width floor: the larger of its own longest unbreakable token and a readable minimum derived from that column's content, bounded so a table of short columns still fits its container. The floor applies to the cell's text, not to its padded box, so it means the same amount of content at every density. A header label contributes its own readable minimum to that comparison. A table whose floors exceed the container grows and scrolls rather than dividing the container equally.                                                                                                                                             |
| FR27 | Default table header cells never truncate: no ellipsis and no width clamp. A header reads in full, on one line up to a bounded width and wrapping past it. Inline code inside a default table cell keeps its token whole rather than breaking mid-token; a supplied `inlineCode` renderer owns its own wrapping.                                                                                                                                                                                                                                                                                                                                                                                    |
| FR28 | Markdown's Table block owns spacing, sizing, and alignment. The nested Table's own Scroll region remains the sole owner of the table's horizontal overflow, its accessible name, and its conditional keyboard focusability; Markdown adds no second scroll container, name, or tab stop of its own.                                                                                                                                                                                                                                                                                                                                                                                                 |
| FR29 | On the default Code block path the fence's full first word selects CodeBlock's diff layer (`component:CodeBlock` FR9): `diff` renders the layer over plaintext, `diff-<language>` the layer over `<language>` (the language read by the same leading-word rule as any other fence); every other fence takes no diff layer. A supplied `code` renderer's contract is unchanged: it keeps receiving the leading word characters as `language` — `diff` for both `diff` and `diff-<language>` fences — and nothing new.                                                                                                                                                                                |
| FR30 | `codeLanguages` lists `component:CodeBlock` language values (FR13): Astryx modules or custom languages. On the default Code block path, a fence whose language word — the same leading-word read as any other fence (FR29) — is one of a listed module's identifiers renders with that value as its `language`, ahead of a built-in with the same identifier, and a `diff-<identifier>` fence takes the diff layer over that value; every other fence resolves as before. A later entry wins when two list the same identifier. Without `codeLanguages`, fences render as they do today. A supplied `code` renderer's contract is unchanged: it keeps receiving the language word, and nothing new. |

FR23 includes CommonMark-compatible lazy paragraph continuation inside blockquotes
and ordered, unordered, or task-list items. Omitting a repeated quote marker or
item indentation does not close the deepest open paragraph; a blank line or an
interrupting block start does. The owning top-level block's source range includes
the lazy lines.

FR23 also includes table-level escaping inside inline-code spans: `\|` keeps the pipe
inside its authored cell, contributes only `|` to the code value and rendered
text, and produces the same result in full and incremental parsing. A completed
inline-code span excludes its delimiting backticks from the parsed value and
renders only that value inside `<code>`; an unmatched backtick remains literal
text. Outside a table cell, inline code retains its authored backslashes.

### Allowed variation

- **AV1 — Parsed content.** The number and ordering of block parts may vary with
  the Markdown source without changing their ownership.
- **AV2 — Lists.** Ordered, unordered, and task lists share the List anatomy and
  current `markdown-list` target. Each level's marker style is fixed by its
  depth, as `spec:AST-061/DEC-6` defines, not a variation.
- **AV3 — Custom renderers.** Supported custom block renderers may replace their
  default part and own its styling without receiving a Markdown block target.
- **AV4 — Nested primitives.** Astryx primitives used inside default blocks may
  change internal element shape while preserving their own public contracts and
  Markdown's outer block targets.
- **AV5 — Math renderer.** The caller may use any renderer that accepts the raw
  expression and display value. Its DOM, styles, typesetting engine, error UI,
  and accessibility representation are outside Markdown's ownership.
- **AV6 — Installed plugins.** A host may supply any ordered set of compatible
  opaque plugin entries. Syntax, immutable transform behavior, renderer-owned
  output, and helper implementation may vary while validation, readable fallback,
  Core semantics, and heading identity stay fixed.

### Representative states

| State                  | Required invariant                                                                                                                                      | Allowed variation                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Default block content  | Every parsed block uses its corresponding current Markdown target.                                                                                      | Block count, order, density, content width, and alignment.                                      |
| Custom block renderers | The replaced Heading, Paragraph, Code block, Blockquote, Divider, or Image lacks the corresponding Markdown target.                                     | Replacement structure and styling.                                                              |
| Ordered/unordered list | List carries `markdown-list`; each level's marker style follows its depth (`spec:AST-061/DEC-6`).                                                       | Start value, item count, and nested content.                                                    |
| Task list              | Each task-marked item carries its own checked state; mixed task/plain items stay in one compatible list and preserve document order and nesting.        | Checked values, item content, and adjacent plain items.                                         |
| Safe block image       | Default Image carries `markdown-image`, or a custom image renderer replaces it.                                                                         | Source and alternative text.                                                                    |
| Unsafe block image URL | Markdown renders its fallback Image part with `markdown-image`; no custom image renderer receives the rejected URL.                                     | Alternative text shown by the fallback.                                                         |
| Inline display         | Document carries `markdown`; no block target renders.                                                                                                   | Inline text, links, code, citations, plugins, and opt-in inline math.                           |
| Math renderer absent   | Dollar-delimited source follows the released Markdown grammar and no `math` node or renderer output exists.                                             | Currency, unmatched delimiters, and ordinary prose.                                             |
| Math renderer present  | Complete supported delimiters are opaque to Markdown formatting and are passed to the renderer as inert text.                                           | Inline or block display and any renderer-owned output.                                          |
| Streaming math         | Incomplete math is withheld; once complete, the streamed nodes equal the full-parse nodes at top level and inside list/blockquote containers.           | Delimiters and expression text may arrive in separate chunks; source ranges remain optional.    |
| Plugins omitted        | Released parser unions, AST, DOM, targets, heading IDs, and performance remain unchanged.                                                               | Omitted or empty list; both are one empty transform pipeline.                                   |
| Plugins enabled        | Fixed syntax → immutable transform → render order, validated roots, readable fallback, and matching Markdown/Outline heading identity remain invariant. | Syntax, transforms, renderers, helper execution plans, plugin order, and live post-parse state. |
| Native frontmatter     | A complete leading block is absent from rendered content and yields typed metadata; unfinished streaming input is withheld.                             | Metadata schema and values are caller-defined finite data.                                      |

### Transformation and precedence order

- Fenced and inline code claim their contents before math.
- Complete display math claims a block before headings, tables, lists, and
  paragraphs. Complete inline math claims its source before citations, links,
  emphasis, autolinks, and inline plugins.
- A custom renderer receives only the delimiter-free expression string and its
  display value. Markdown never turns it into HTML or executes it.
- Existing URL sanitization remains in force for links and images; math adds no
  navigation or raw-HTML sink.
- Built-in syntax and protected contexts claim first; extension syntax claims only
  eligible source; ordered transforms then receive deeply readonly document roots;
  Core validates each returned root before rendering.
- A configured native frontmatter helper claims only the document-start delimiter.
  It withholds an unfinished block during streaming, removes a completed block
  before later transforms render the document, and makes typed metadata available
  to those later transforms and to callers of that helper.
- A semantic-fence proposal renders before `components.code`. `components.code`
  renders every fence no proposal claims, and a claimed fence whose plugin
  renderer is absent, returns nothing, throws, or suspends falls back to
  `components.code` when supplied and to the default Code block otherwise
  (`spec:AST-036` FR17).
- Text matching, semantic fences, and source decorations use transform helpers. Core
  may compile those helpers into indexed internal plans without exposing additional
  public phases.

### Performance and resources

- Math scanning is disabled unless requested.
- Inline matching is a bounded forward scan of one line. Display matching scans
  only from a candidate `$$` opener to its closer.
- The incremental parser keeps completed blocks cached, treats an open display
  expression like an open code fence, and tracks exact list and blockquote
  container depth so an indented closer cannot become a new opener and a depth
  transition cannot swallow literal content. The factory-created state carries
  the same legacy or math-enabled node contract as the parser call.
- Stable and semantically equal plugin lists reuse prepared syntax and transform plans. Only syntax enters parse identity; transform and renderer changes reuse parsed output. Zero-work and representative transforms remain within `spec:AST-036` FR21–FR23 budgets, including the plugin-authored and streaming paths.
- Remark compatibility adapters, the conformance kit, and optional renderers stay outside Core bundles unless explicitly imported.

## Accessibility contract

The default document semantics, heading IDs, paragraph role, list semantics,
scrollable Table wrapper, and image alternative text remain unchanged. Math has
no Astryx-owned default output: the caller's renderer owns an accessible
representation appropriate to its typesetting engine (for example MathML or a
labelled `role="math"` element). Markdown adds no wrapper, ARIA attributes, or
HTML injection around renderer output. Plugin renderers likewise own their
complete documented semantic pattern, while Core preserves its own document,
heading, navigation, image, list, and table semantics. Transforms cannot erase
required accessible meaning or make meaning color-only.

## Design relationships

| Anatomy or state | Design requirement                                                                 | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Document         | Contains block or inline rendered Markdown content.                                | Current source and public docs | Supporting     | FR1, FR5           |
| Heading          | Presents one parsed heading with its resolved level and optional generated ID.     | Current source and public docs | Prominent      | FR2, FR3, FR5      |
| Paragraph        | Presents one prose block using the default composition-safe paragraph structure.   | Current source and public docs | Prominent      | FR2, FR3           |
| List             | Presents ordered, unordered, or task-list items as one block.                      | Current source and public docs | Prominent      | FR2, FR5           |
| Code block       | Presents fenced code and owns the outer spacing target on the default path.        | Current source and public docs | Prominent      | FR2, FR3, FR4      |
| Blockquote       | Presents quoted block content on the default path.                                 | Current source and public docs | Prominent      | FR2, FR3           |
| Table            | Presents parsed rows and columns in a keyboard-scrollable block wrapper.           | Current source and public docs | Prominent      | FR2                |
| Divider          | Presents a horizontal separation between blocks.                                   | Current source and public docs | Supporting     | FR2, FR3           |
| Image            | Presents a safe block image or the fallback for a rejected image URL.              | Current source and public docs | Prominent      | FR2, FR3           |
| Math             | Delegates an explicitly enabled expression to the caller's renderer as inert text. | Component contract             | Supporting     | FR6–FR11           |

Custom renderers replace the existing default parts rather than becoming nested
Markdown anatomy. The opt-in math renderer is also not default anatomy and gets no
Markdown theme target or wrapper. Lists and Tables have no corresponding custom
block renderer. The Document remains Markdown-owned in every display mode.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Document": {"target": "markdown"},
  "Heading": {"target": "markdown-heading"},
  "Paragraph": {"target": "markdown-paragraph"},
  "List": {"target": "markdown-list"},
  "Code block": {"target": "markdown-codeblock"},
  "Blockquote": {"target": "markdown-blockquote"},
  "Table": {"target": "markdown-table"},
  "Divider": {"target": "markdown-hr"},
  "Image": {"target": "markdown-image"}
}
```

The map records all nine current targets on Markdown's default render paths. For
Heading, Paragraph, Code block, Blockquote, Divider, and safe Image, a custom
renderer replaces the default part and therefore replaces its local target. The
`markdown-codeblock` spelling is a released compatibility anomaly: the current
naming rule would produce `markdown-code-block`, but shipped targets are frozen
and this change preserves the existing spelling exactly.

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, target
  mapping, target-capability state, composition boundaries, and compatibility for
  frozen targets.
- `architecture:public-component-api` and `spec:AST-002/DEC-1` own API
  admission. The caller knows whether dollar syntax is math and must choose the
  renderer; Markdown cannot derive either from the source without changing the
  meaning of existing documents.
- `spec:AST-002/DEC-5` requires this accepted component-local contract to be
  current with the implementation.
- `family:navigation-destinations` owns the shared accept/block result for parsed
  links and every Astryx-owned navigation sink. `spec:AST-005/DEC-1` requires
  Markdown parsing and link rendering to preserve the same normalized navigation
  decision as other Core links. Rejected links remain inert and do not reach a
  custom link renderer; accepted links retain their ordinary behavior.
- `spec:AST-005/DEC-2` keeps embedded-resource policy separate. Markdown may
  reject a broader set of image/resource URLs without narrowing the shared
  navigation contract.
- `module:Markdown/headingLinks` owns its opt-in public factory, heading projection,
  built-in sibling renderer, i18n, styles, accessibility behavior, and evidence.
  Markdown supplies only the generic plugin and built-in-heading composition seams.
- `spec:AST-036` owns the opaque syntax/transform/renderer protocol, immutable AST
  validation, limited Remark compatibility, performance, and resource boundaries.
  This record owns aggregate Markdown behavior in FR12–FR22;
  `module:Markdown/remark` owns the separately imported Remark adapter's
  supported subset, rejections, and diagnostics; and
  `module:Outline/parseOutlineFromMarkdown` owns the corresponding Outline
  projection.
- `component:Table/DEC-1` and `spec:AST-025/DEC-1` own the nested Scroll
  region's behavior: Table adopts the shared scrollable-area composition on its
  own viewport, and that composition — not Markdown — decides how the region
  scrolls, names itself, and contains its overflow. `spec:AST-025/DEC-4` owns
  the keyboard ownership that makes the region a tab stop only while it
  actually scrolls. FR28 projects those claims onto Markdown's table block: it
  requires Markdown to add no competing scroll container, name, or tab stop,
  and it neither restates nor narrows what Table and the shared behavior own.
- `spec:AST-064` owns how the RichText surfaces adopt Markdown plugins. Its
  DEC-6 limits what this component exposes for them to the capability report
  and the single-node renderer above.
- Nested Astryx primitives retain ownership of their own anatomy and targets;
  Markdown owns the outer block targets listed here.

## Verification map

| Contract               | Verification                                                                                                                                                                                                                                                                                                                          | Representative states                                                                                                                                | Failure signal                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR5                | `Markdown.test.tsx`, theme-target tests, and `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                            | Default block/inline output and all current targets                                                                                                  | Existing DOM, target, spacing, or renderer behavior changes.                                                                                                                                               |
| FR6–FR10               | `parser.test.ts` and `Markdown.test.tsx`                                                                                                                                                                                                                                                                                              | Opt-out, inline/display math, escapes, currency, code, links, plugins                                                                                | A delimiter is claimed without opt-in, TeX is formatted as Markdown, or opaque contexts leak.                                                                                                              |
| FR11                   | `incremental.test.ts` and `Markdown.test.tsx`                                                                                                                                                                                                                                                                                         | Every-character top-level/list/task-list/blockquote splits, CRLF, source ranges                                                                      | Streaming diverges from a full parse, shows partial syntax, mistakes a nested closer for an opener, or crosses a closed container.                                                                         |
| FR12–FR16              | plugin, transform, adapter, performance, and Outline parser tests                                                                                                                                                                                                                                                                     | omitted/empty lists, immutable transforms, invalid outputs, live updates, one compatible Remark plugin, duplicate headings                           | Empty behavior forks, input mutates, invalid structure escapes, transforms reparse, adapter loses content, budgets fail, or heading targets diverge.                                                       |
| FR17–FR18              | container parse/validation, ownership, and dependency tests                                                                                                                                                                                                                                                                           | leaf/container declarations, nested containers, foreign read/remove/mint/edit, unmet/misordered dependencies                                         | Plugin-built parsed children, invalid content, lost fallback children, foreign mint/edit, or generic ownership codes.                                                                                      |
| FR19                   | diagnostic-channel tests in development and production                                                                                                                                                                                                                                                                                | every phase, advisory reports, rate suppression, no handler, malformed list, duplicate Core, version skew                                            | A silent production failure, document content in a diagnostic, or one entrypoint throwing where another recovers.                                                                                          |
| FR20–FR22              | canonical/server imports, inference, streaming, preparation, theming tests                                                                                                                                                                                                                                                            | server imports, no explicit type args, chunk boundaries, recreated lists, themed/unthemed extensions                                                 | Client references, explicit-type workarounds, oscillation, per-render re-preparation, or unreachable opted-in output.                                                                                      |
| FR23                   | parser, incremental, renderer, nesting, and public option tests                                                                                                                                                                                                                                                                       | mixed lists; escaped prose/code table cells, nested inline code, full/streaming parity; autolink omitted/enabled                                     | A mixed list splits or loses state, an escaped table pipe changes cells or exposes its backslash, or autolink changes other syntax.                                                                        |
| FR24                   | `plugins/frontmatter.test.tsx`, Storybook, and server rendering                                                                                                                                                                                                                                                                       | complete, malformed, non-leading, LF/CRLF, unfinished streaming, full plugin stack                                                                   | Metadata syntax renders after completion, unfinished syntax leaks while streaming, typing is lost, or later plugins stop composing.                                                                        |
| FR25                   | `parser.public.test.ts`, plugin SSR tests, and package export checks                                                                                                                                                                                                                                                                  | server/RSC parsing with plugins, synchronous SSR, suspending renderer streaming boundary                                                             | A server import gains `use client`, plugin execution needs serialization, SSR loses fallback, or direct RSC rendering is misrepresented as supported.                                                      |
| FR26–FR28              | `Markdown.test.tsx` and a real-browser layer over checked-in narrow-width stories                                                                                                                                                                                                                                                     | short, prose, and token-heavy tables; header-only rows and empty cells; long headers over short bodies; reading columns from phone to document width | A column collapses below its content floor, cell padding eats the floor, a header truncates, an inline-code token breaks mid-token, or a second scroll viewport, name, or tab stop appears around a table. |
| FR29                   | `Markdown.test.tsx` (a `diff` fence → plaintext + layer, a `diff-tsx` fence → tsx + layer, a plain fence unchanged, a custom `code` renderer receives `language="diff"` for both diff fences and nothing new)                                                                                                                         | default path and custom renderer, `diff` and `diff-<language>` fences                                                                                | a fence word other than `diff`/`diff-<language>` reaching the layer, or a custom renderer receiving a new prop or a different `language`                                                                   |
| FR30                   | `Markdown.test.tsx` (a fence naming a listed module paints with it and labels with its name; the same fence without `codeLanguages` stays plain; a later entry wins a shared identifier; a `diff-<identifier>` fence takes the diff layer over the listed value; a custom `code` renderer receives the language word and nothing new) | listed and unlisted modules, a shared identifier, a `diff-<identifier>` fence, a custom `code` renderer                                              | a listed module's fence rendering plain, an unlisted identifier resolving to a module, or a custom renderer receiving a module or a new prop                                                               |
| Public syntax/types    | `Markdown.public.test.ts`, core typecheck, and `Markdown.doc.mjs`                                                                                                                                                                                                                                                                     | Legacy exhaustive switches, math opt-ins, inferred extension-node unions                                                                             | A released union widens, an enabled union loses nodes, or docs drift from declarations.                                                                                                                    |
| Navigation contract    | `parser.test.ts`, `Markdown.test.tsx`, and `Markdown.renderBoundary.test.tsx`                                                                                                                                                                                                                                                         | Parsed and rendered links, including transformed built-in links; accepted ordinary schemes; rejected destinations; links versus images               | A blocked destination reaches navigation or a custom link renderer, or resource policy narrows accepted navigation.                                                                                        |
| Security/accessibility | `parser.test.ts`, `Markdown.test.tsx`, and renderer guidance                                                                                                                                                                                                                                                                          | Inert expression strings and renderer-owned semantics                                                                                                | Astryx executes math as HTML or silently claims renderer-owned accessibility.                                                                                                                              |

Focused tests continue to pin all nine current target names and default block
placement. Math intentionally adds no target and no default anatomy.

## Decision log

### DEC-1 — Math is an opt-in renderer contract

**Reference:** `component:Markdown/DEC-1`
**Decider:** `cixzhang`, `2026-09-13`

A caller that supplies `components.math` opts the component into the constrained
dollar-math grammar and receives every complete expression through one renderer
with its source value and inline/block placement. Direct parser callers use
`MathParseOptions`; incremental callers also create
`IncrementalParseState<true>` via `createIncrementalState<true>()` so the cache
and result expose the same math-enabled node union.

This passes API admission because otherwise identical dollar-delimited source may
be prose or math, only the document host knows which meaning applies, and Astryx
cannot choose a typesetting or accessibility implementation for the host. Tying
the opt-in to the required renderer prevents an enabled-but-unrenderable state.
The default remains exactly the released Markdown grammar.

Rejected: a generic AST/plugin escape hatch, raw HTML rendering, new list/table
slots without consumer evidence, or a separate boolean on the component that
could enable math without a renderer.

### DEC-2 — Immutable transformation is the canonical Markdown extension seam

**Reference:** `component:Markdown/DEC-2`
**Decider:** `cixzhang`, `2026-09-15`

Markdown accepts one ordered `plugins` list whose opaque entries are created by
`createMarkdownPlugin()`. The public protocol exposes only bounded `syntax`,
immutable `transform`, and typed `renderers`. Core owns deep-readonly input,
validation and freezing of replacement roots, readable fallback, syntax-only parse
identity, preparation reuse, shared heading identity, containers, diagnostics, canonical/server parsing, and theming in FR12–FR22. Existing
`components`, `inlinePlugins`, math, citations, autolinking, and parser calls remain
compatible.

Text matching, semantic fences, and source decoration are transform helpers rather
than separate protocol phases. A tree-shakeable adapter may run only synchronous
transform-only Remark plugins over the documented MDAST subset; unsupported behavior
fails closed rather than being approximated.

This projects `spec:AST-036/DEC-1` through `DEC-4` into the component owner. It rejects a registry, package discovery, mutable shared AST, raw markup, a second plugin prop, or an unrestricted Unified runtime.

### DEC-3 — Containers, diagnostics, and canonical APIs are Markdown-owned

**Reference:** `component:Markdown/DEC-3`
**Decider:** `cixzhang`, `2026-09-16`

Markdown parses every extension container's inner span itself and validates children against the plugin's declared content shape, so a callout holds real Markdown while heading identity, protected contexts, navigation policy, and Outline scope stay Core-owned. Containers change what a document can express, not which projection owns heading identity: the released top-level traversal remains the default, and any opt-in widening belongs to a separate current module contract. A failed container renderer shows its children rather than literal source. Ownership rejections name the rule and owner; removal of another plugin's nodes is permitted and only minting, editing, internal reordering, duplication, and identity forgery are not.

Markdown also owns the protocol's observability and entry surface: `onPluginDiagnostic` makes every failure visible in production without carrying document content, admission failures degrade instead of throwing at any entrypoint, canonical parse entrypoints and a server-safe parser entry exist beside the released projection, extension types are inferred, and extension output may opt into one theme target without becoming default anatomy.

This projects `spec:AST-036/DEC-5` through `DEC-11` into the component owner in FR17–FR22. It rejects leaf-only extensions, plugin-authored parsed children, independent document shells, development-only or free-text diagnostics, parsers reachable only through a client barrel, required hand-written extension aliases, and default anatomy for plugin output.

### DEC-4 — Own an explicit Markdown dialect, not a profile switch

**Reference:** `component:Markdown/DEC-4`
**Decider:** `cixzhang`, `2026-09-19`

Markdown's released grammar is an explicit Astryx-owned subset. Task-list markers are item semantics inside the ordinary ordered or unordered list structure, so mixed task and plain items stay in one compatible list and each item retains its own state at every nesting level. Released table and task-list syntax remains enabled by default. A backslash-escaped pipe inside a table cell is structural source syntax: it keeps the pipe in that cell and contributes only the literal pipe to rendered prose or inline code, with the same result in full and incremental parsing. The optional `autolink: 'gfm'` value adds only the documented autolink behavior; it neither enables another syntax feature nor changes list structure.

This keeps documents stable as Astryx adds or declines individual ecosystem features. It rejects a blanket CommonMark or GFM conformance claim, aggregate all-task/all-plain classification, an implicit whole-grammar mode switch, and silently enabling future GFM features under the existing autolink option.

### DEC-5 — Frontmatter is typed document metadata

**Reference:** `component:Markdown/DEC-5`
**Decider:** `cixzhang`, `2026-09-19`

Native frontmatter is a first-party helper in the ordered plugin pipeline. It
recognizes only a leading delimited block, parses a deliberately small key/value
grammar through a caller-provided typed decoder, and removes the syntax from the
rendered document. It does not create a visual extension node or require Remark's
frontmatter format. During streaming, incomplete frontmatter is withheld so raw
metadata never flashes as content; once closed, later plugins can consume the
metadata and the remaining document normally.

### DEC-6 — A Markdown table column is floored by its own content, on Markdown's own Table part

**Reference:** `component:Markdown/DEC-6`
**Decider:** `nynexman4464`, `2026-09-28`

A Markdown table's columns are sized from the column's own content rather than
from fixed width buckets, and the floor is expressed against the cell's text
rather than its padded box. Content-derived floors keep an identifier, a route,
or a status token readable at any reading width, and a floor on the text box
means the same amount of content at every density without Markdown restating
Table's own spacing.

Markdown applies this to its own default Table part, over Table's released
wrap-mode defaults, rather than changing those defaults. Table's wrap mode is a
released contract for data-driven tables, and Markdown already owns the styling
of the part it renders; narrowing the change to that part leaves every other
Table caller untouched.

The nested Table's Scroll region stays the single owner of the table's
horizontal overflow, name, and conditional keyboard focusability, so
Markdown's own block gives up the overflow, `role`, name, and tab stop it
duplicated. Two nested scroll containers around one table produce a focus stop
that never scrolls and a second region with the same name, and the column
floors are not observable while an outer container absorbs the overflow.

Rejected: changing Table's wrap-mode defaults instead, which would move a
released behavior for every data-driven caller to fix one part's layout;
widening columns by measuring rendered text, which adds an observer and a
reflow to a purely declarative path; and adding a prop or option for column
sizing, which would make a default-path defect into a caller's decision.

## Open questions

- **OQ1 — Which focused tests should pin target absence for the five remaining
  custom block replacement paths?** (`checkable`)

## Content boundary

This file does not duplicate consumer prop tables/examples, parser mechanics,
streaming implementation, nested primitive contracts, current audit results, or
system theming rules. It links to their owners.
