---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-036
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-03
phase: accepted
owners: [cixzhang]
affects_architecture:
  [
    architecture:public-component-api,
    architecture:react-component-runtime,
    architecture:component-test-sufficiency,
  ]
affects_families: [family:navigation-destinations]
affects_contributing: []
affects_consumer_docs: [Markdown, Outline]
---

# General Markdown plugin system spec

## Contract at a glance

| Area                 | Contract                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract      | One additive `plugins` prop and `createMarkdownPlugin()`. A plugin exposes only `syntax`, immutable `transform`, and `renderers`. Text matching, semantic fences, and source decoration are helper-authored transforms, not separate protocol phases.                                                                                                |
| Behavior             | Parsing, transformation, Markdown rendering, and Outline observe one stable, strictly typed, MDAST-aligned tree. Ordered transforms return validated replacement trees while Core retains built-in semantics and readable fallback.                                                                                                                  |
| Remark compatibility | A separate adapter may run synchronous transform-only Remark plugins over the documented supported MDAST subset. Parser extensions, async plugins, compiler plugins, arbitrary `VFile` state, and unsupported node kinds are rejected rather than approximated.                                                                                      |
| End-user impact      | Readers may receive additional syntax and transformed document structure while ordinary Markdown, copyable fallback, heading and Outline identity, accessibility, navigation, images, lists, and tables retain canonical ownership.                                                                                                                  |
| Builder impact       | Existing builders do nothing. Opt-in builders pass one stable plugin list. Simple text, fence, and decoration use cases use helpers that return transforms.                                                                                                                                                                                          |
| Compatibility        | Omitted plugins and `plugins={[]}` are semantically the same empty pipeline. Core may skip empty preparation and allocation, but no separate behavior model exists. Existing `components`, `inlinePlugins`, math, citations, autolinks, and parser signatures retain their meaning.                                                                  |
| Review checks        | Reject a second plugin prop, public lifecycle-specific phases, mutable shared AST, raw-markup nodes, plugin override of Core semantics, unbounded parser hooks, silent Remark incompatibility, transform-driven reparsing, or work proportional to every plugin at every source character.                                                           |
| Governing rules      | [`architecture:public-component-api`](../../architecture/public-component-api.md); [`family:navigation-destinations`](../../families/navigation-destinations.md); [AST-002 FR4](../AST-002/spec.md); [AST-002 FR15](../AST-002/spec.md); [AST-002 FR17](../AST-002/spec.md); [AST-002 FR18](../AST-002/spec.md); [AST-002 FR20](../AST-002/spec.md). |

This section is a review projection; the body below is authoritative.

## Intent

Application authors should be able to add reusable Markdown behavior without rewriting source text, forking the parser, or replacing the whole renderer. One understandable model must cover new source syntax, document-level semantic transformation, and typed rendering.

The public concepts should remain fewer than the use cases. Prose replacement, semantic code fences, source decoration, callouts, frontmatter, TOCs, footnotes, and compatible Remark transforms all use the same immutable transform boundary rather than becoming independent protocol phases.

## Ownership boundary

AST-036 owns shared plugin admission, syntax and transform ordering, compatibility, validation, failure behavior, parse identity, Remark-adapter limits, and observable resource constraints. Markdown owns its concrete AST declarations, parser integration, aggregate rendering, and helpers. Outline owns its projection of Markdown heading identity. A first-party plugin owns its specific semantics and evidence in its own module record.

## Non-goals

- Adopt Unified, mutable MDAST, `VFile`, or Remark as Core runtime dependencies.
- Break the released `parseMarkdown` result shape before a separately approved
  migration.
- Promise compatibility with arbitrary Remark parser, transform, compiler, async, or raw-HTML plugins.
- Expose mutable shared AST, unrestricted visitors, DOM access, package discovery, or a registry.
- Replace generic CodeBlock highlighting or Core-owned document, heading, navigation, image, list, or table semantics.
- Make a zero-plugin document a separate semantic mode.

## Platform support

- **Feature and engine floor:** unchanged from current Markdown/Core package support; the protocol adds no browser, React, Node, or TypeScript floor.
- **Unsupported behavior:** unsupported syntax/transform/Remark behavior fails closed to the last valid readable document and cannot silently approximate output.
- **Browser evidence:** interactive stories verify rendered output, keyboard/focus order, copyable fallback, navigation ownership, and unchanged no-plugin behavior in real Chromium; server-render fixtures cover non-browser use.

## Current-state impact

| Current seam              | Preserved behavior                                                                     | New role                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `components`              | Replaces supported built-in renderers, including the all-fence code renderer.          | Wins before plugin rendering, except that a semantic-fence proposal claims its fence first (FR17).            |
| `inlinePlugins`           | Replaces matched prose with released traversal, overlap, callback, and error behavior. | Remains compatible; a later migration may adapt it through a helper-backed transform only after exact parity. |
| Parser and streaming APIs | Produce the released AST and reuse settled incremental output.                         | Accept syntax plugins and apply live transforms without making transforms part of parse identity.             |
| Markdown and Outline      | Share built-in heading text and slug behavior.                                         | Also share transformed heading projection and collision allocation.                                           |

## Semantic model

A plugin entry is an opaque value created by Markdown's public `createMarkdownPlugin()` factory and accepted only through the ordered `plugins` array. Its public shape is `{name, apiVersion: 1, syntax?, transform?, renderers?}` subject to these rules: `syntax` contains ordered bounded inline/block tokenizer declarations and requires `parseKey`; `transform` is one synchronous immutable root-to-root function; `renderers` is a node-name-keyed map whose entries provide one pure render callback and one deterministic `toText` projection. A plugin exposes no other lifecycle phase. A plain object cannot masquerade as an entry, and heterogeneous lists preserve the union of their extension-node kinds under strict TypeScript.

The public construction surface is `createMarkdownPlugin()`, `createMarkdownTextTransform()`, `createMarkdownFenceTransform()`, and `createMarkdownSourceDecoration()`. Limited Remark compatibility is a separate tree-shakeable `createMarkdownRemarkTransform()` export from `@astryxdesign/core/Markdown/remark`. These helpers return or annotate the one `transform` capability; they never accept React render callbacks and are not additional lifecycle phases. In particular, `createMarkdownFenceTransform()` maps eligible built-in code nodes to an owning plugin's typed extension data, while that plugin's standard `renderers` map owns presentation and `toText`. Detailed TypeScript signatures and examples live in the Markdown consumer docs, while these names and responsibilities are part of this contract.

The canonical document is an immutable, discriminated, Unist-shaped tree aligned with the supported MDAST subset below. **MDAST is a public community specification maintained by the syntax-tree/unified ecosystem, not a browser or standards-body API.** Astryx's public contract is its own exported, versioned TypeScript node union: it uses the listed MDAST node names and field meanings where they align, documents every deviation, and does not promise nominal or structural interchangeability with arbitrary `mdast`, Unified, or third-party plugin versions. `parseMarkdownAst()` and `parseInlineAst()` expose that tree additively from the server-safe `@astryxdesign/core/Markdown/parser` subpath; the component barrel also re-exports them for client code. Parsing, transforms, Markdown rendering, and Outline projection observe the same node meanings. Released parser entrypoints retain their current result types and values through a compatibility boundary; adopting plugins requires no migration.

The Markdown owner exposes stable node unions and node-kind-narrowed traversal. Plugin-defined extension kinds augment the generic union without widening unrelated built-in callbacks. A transform receives readonly input and returns the original root or a replacement root. Equivalent validation and immutability implementations are permitted.

A syntax contribution declares non-empty literal prefixes, a finite pending bound, and a synchronous deterministic tokenizer. It may emit only its owning typed extension nodes. Syntax-bearing plugins declare stable parse identity; only ordered syntax identity participates in incremental parse identity.

A transform is synchronous and deterministic. It may replace, insert, remove, or annotate representable nodes within the permitted-edit matrix. It cannot mutate input, author source provenance, introduce raw markup or React values, or bypass Core-owned semantics. Transform changes refresh transformed output without changing syntax parse identity.

Renderers receive typed extension-node data only. Every extension node introduced through syntax or transform has a renderer and deterministic perceivable-text projection. A source-backed leaf falls back to exact authored source; a synthetic leaf falls back to its required text projection; a container keeps and renders its validated children. Sibling content continues after failure.

Each extension kind declares `content: 'none' | 'phrasing' | 'flow'` or a finite allowlist that narrows the category implied by `display`. Core validates children at every transform boundary. Syntax-created containers declare an inner source span that Core parses; plugins never turn raw source into child nodes. A plugin may read or remove another plugin's nodes, but it may create, edit, or duplicate only its own. Cross-plugin reads are declared through `dependsOn` and validated against list order.

Plugin admission and every failure phase use one source-free, rate-limited `onPluginDiagnostic` channel in development and production. Malformed entries and protocol-version mismatches fail locally rather than throwing into the caller. Plugin-authored reports use stable codes, never document-derived text.

Text matching, semantic fences, and source decoration are optional transform helpers, not additional public phases. Equivalent optimized execution is allowed when it preserves ordered transform semantics and observable results.

## Canonical MDAST compatibility matrix

| Node or field                               | Supported contract                                                                                                                                                                               | Rejected or constrained behavior                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `root`, `children`                          | One root; ordered typed children.                                                                                                                                                                | Removing/retyping the root; cycles; shared mutable children.                                                                        |
| `text`, `value`                             | Text replacement, splitting, insertion, and removal.                                                                                                                                             | Functions, React values, or non-string `value`.                                                                                     |
| `paragraph`, `strong`, `emphasis`, `delete` | Ordered phrasing children.                                                                                                                                                                       | Block children inside phrasing containers.                                                                                          |
| `heading`, `depth`                          | Phrasing children may transform; transformed text participates in shared Markdown/Outline identity.                                                                                              | Changing a source-backed heading's depth; renderer-defined IDs.                                                                     |
| `inlineCode`, `break`                       | Standard MDAST meaning.                                                                                                                                                                          | Transforming protected inline-code contents through text helpers.                                                                   |
| `link`, `url`, `children`                   | Phrasing children; every Astryx-owned destination is revalidated by the navigation owner.                                                                                                        | Nested links; bypassing destination policy; non-string URLs.                                                                        |
| `image`, `url`, `alt`                       | Revalidated resource URL and text alternative.                                                                                                                                                   | Bypassing resource policy or removing required alternative text.                                                                    |
| `blockquote`                                | Ordered block children.                                                                                                                                                                          | Invalid child kinds.                                                                                                                |
| `list`, `listItem`                          | `ordered`, optional `start`, `spread`, optional `checked`, and block children. Astryx also preserves the authored ordered-list `delimiter` for exact released projection.                        | Invalid task/list structure or non-finite starts.                                                                                   |
| `code`, `lang`, `meta`, `value`             | MDAST semantics: `lang` is `null` when absent and `meta` is optional. Ordinary code remains copyable; fence helpers annotate the original node.                                                  | Replacing/removing source through the fence helper; bypassing `components.code` for a fence no proposal claims.                     |
| Astryx flow image                           | Preserves released standalone-image block behavior with `url` and `alt`; phrasing images retain normal MDAST placement.                                                                          | Treating the flow extension as portable MDAST without adapter evidence.                                                             |
| `table`, `tableRow`, `tableCell`, `align`   | Rectangular rows, phrasing cells, normalized alignment.                                                                                                                                          | Replacing Core table semantics or producing ragged/invalid structure.                                                               |
| `thematicBreak`                             | Standard MDAST meaning.                                                                                                                                                                          | Children or renderer slots.                                                                                                         |
| `math`, `inlineMath`                        | Present only when the released math opt-in is enabled.                                                                                                                                           | Enabling math through transformation alone.                                                                                         |
| `position`                                  | Core-authored optional start/end UTF-16 offsets on source-backed nodes; line and column remain optional until available without changing released range behavior. Synthetic nodes omit position. | Authoring, shifting, or forging source positions.                                                                                   |
| `data`                                      | Finite JSON-like plugin data under the owning plugin key; Core bookkeeping uses one reserved `astryx` namespace with no rendering effect by itself.                                              | `hName`, `hProperties`, `hChildren`, functions, DOM/React values, raw-markup channels, or plugin-authored Core-reserved data.       |
| Astryx extension node                       | Stable plugin/name/display/data discriminants; declared `none`, `phrasing`, `flow`, or narrowed allowlist content; renderer and text projection.                                                 | Foreign minting/editing/duplication, undeclared children, missing projection/renderer, or changing another plugin's discriminants.  |
| Astryx citation node                        | Preserved as an owned typed extension to the MDAST subset.                                                                                                                                       | Rewriting it as a link to bypass citation ownership.                                                                                |
| Other MDAST nodes                           | Unsupported unless a later current contract adds them.                                                                                                                                           | `html`, definitions/references, footnotes, frontmatter, directives, MDX, and other unknown nodes fail closed in the Remark adapter. |

## Permitted transform edits

| Surface                         | Permitted                                                                                                   | Rejected                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Document root                   | Return the same root or a structurally valid replacement root.                                              | Removing/retyping the root or adding an independently rendered document shell.                               |
| Source-backed text and phrasing | Replace, split, insert, remove, or annotate while preserving protected contexts.                            | Text-helper matches inside protected code, links, images, citations, math, or accepted opaque syntax.        |
| Headings                        | Transform phrasing children; remove or reorder headings; shared identity updates from transformed text.     | Changing a source-backed depth, forging/duplicating provenance or identity, or supplying a renderer-only ID. |
| Links and images                | Insert or update values that pass their current navigation/resource owners.                                 | Bypassing destination, protocol, alternative-text, or trusted-resource policy.                               |
| Lists and tables                | Insert, remove, or transform valid descendants while retaining Core-owned semantics.                        | Changing roles, ownership, or producing invalid structure.                                                   |
| Code fences                     | A semantic-fence helper may attach owned typed extension data to the original code node.                    | Replacing source through the helper, rendering inside the helper, or claiming a fence it does not annotate.  |
| Source decoration               | Attach non-semantic, non-interactive presentation metadata to source-backed ranges.                         | Changing AST meaning, focus order, accessible name, navigation, selection, or copyable text.                 |
| Plugin extension nodes          | Insert/edit the transform owner's node; read or remove foreign nodes/subtrees; preserve validated children. | Minting, editing, duplicating, or internally reordering another plugin's node; undeclared child content.     |
| Inline entrypoints              | Return exactly one paragraph-equivalent root containing phrasing nodes.                                     | Block nodes, multiple top-level blocks, or a changed container shape.                                        |

## Limited Remark compatibility profile

A Remark adapter accepts a synchronous transform-only plugin confined to the matrix above. Each invocation receives a fresh mutable tree copy and an isolated constrained file object. The file exposes readonly source text, per-invocation finite JSON data, and diagnostic reporting; it exposes no processor registration, cross-run state, compiler, I/O, or async completion.

The adapter's input type is structurally compatible with conventional Unified/Remark `Plugin` values, including their broad declared transformer return union, so a compatible package does not need a type wrapper. Runtime acceptance remains narrower: an invocation that actually returns a promise or uses an unsupported capability fails closed. Astryx exports its own supported-subset tree and file types rather than re-exporting or pinning the complete `mdast`/Unified type surface, so upstream type evolution cannot silently widen Astryx's contract.

Remark compatibility is content-only, not presentation compatibility. Adapted plugins may return only the supported structural nodes and fields; Astryx still renders those nodes through its own components, tokens, navigation/resource policies, and accessibility semantics. `html`, `hName`, `hProperties`, `hChildren`, custom compiler output, CSS assumptions, and third-party renderer conventions are rejected rather than approximated. A plugin that needs new presentation must use an Astryx-owned typed extension node and renderer outside the Remark adapter.

The adapter validates the plugin's returned or mutated tree against the matrix before it becomes observable. Unsupported nodes, raw HTML, promises, shared processor state, invalid structure, forged positions, and unrepresentable metadata preserve the last valid tree and report a source-free diagnostic.

Compatibility is explicit per plugin and tested version. “Remark-compatible” means equivalent supported-subset fixtures pass the adapter matrix; package shape or ecosystem membership alone is not evidence. Plugins using processor data, micromark extensions, async work, unrestricted `VFile` behavior, unsupported nodes, renderer metadata, or compiler hooks are outside the profile.

## Requirements

### Admission and compatibility

- **FR1 — One public plugin model.** `plugins` and `createMarkdownPlugin()` are the canonical extension seam. The only protocol capabilities are `syntax`, `transform`, and `renderers`; helper APIs may compile common use cases into transforms.
- **FR2 — One empty-pipeline behavior.** Omitted plugins and an empty list have identical AST, DOM, styling, targets, IDs, errors, and streaming behavior. Core may avoid empty normalization and allocation, but no behavior may depend on whether the empty list was explicit.
- **FR3 — Zero breaking changes.** Existing `components`, `inlinePlugins`, citations, opt-in GFM autolinking, math, sources, parser signatures, fields, optionality, mutability, no-plugin result types, DOM, accessibility, heading/Outline identity, streaming reuse, and renderer precedence retain their released meaning and behavior. Opting into plugins adds behavior only for that callsite.
- **FR4 — `inlinePlugins` migrates only after parity.** No deprecation occurs until a helper-backed transform preserves every released traversal context, overlap rule, callback result, `null`, throw, migration-doc, and codemod requirement.
- **FR5 — Entries are durable package values.** First-party plugins are colocated under Markdown and exported normally; third-party plugins are explicit package imports with a compatible Core peer range. No registry or discovery mechanism exists.

### Parsing and immutable transformation

- **FR6 — Fixed order.** Built-in and extension syntax parse first; transforms then run in plugin-array order; rendering runs last. A transform observes the validated result of every earlier transform.
- **FR7 — Built-in lexical shields win during syntax.** Escapes, inline and fenced code, links, images, citations, math, and accepted opaque syntax remain protected according to their current owners. Block extension syntax remains top-level unless a current owner explicitly broadens it.
- **FR8 — Ordered syntax claims.** Duplicate plugin names fail validation. Syntax contributions resolve in plugin and declaration order; first match wins, defer reserves the bounded candidate, and terminal parsing resolves all pending source.
- **FR9 — Canonical AST is MDAST-aligned, strictly typed, and reachable.** Parsing, transforms, rendering, and Outline projection use one stable Unist-shaped subset with complete available source positions. `parseMarkdownAst()` and `parseInlineAst()` return that canonical tree from the server-safe `@astryxdesign/core/Markdown/parser` subpath and the Markdown component barrel. Public node-kind traversal narrows callbacks by discriminant, including generic plugin extensions. Released parser functions retain their existing result types and values until a separately approved migration.
- **FR10 — Transform input is immutable.** A transform returns the same root or a replacement root. Attempted mutation cannot change any observed input node, array, data object, source position, prior snapshot, or later plugin input.
- **FR11 — Transform output is representable and validated.** Output is finite, acyclic, typed data that satisfies both matrices above. Core rejects raw HTML, React values, DOM nodes, functions in node data, invalid built-in structure, foreign extension ownership, authored/shifted provenance, and block-shaped output from inline entrypoints.
- **FR12 — Transform failure is local to the plugin.** A throw, promise, rejected thenable, invalid result, or unsupported adapter output reports one source-free diagnostic and passes the last valid root to later plugins and rendering. Core attaches a rejection sink before refusing an asynchronous tokenizer or transform so a rejected promise cannot escape through the host's unhandled-rejection channel. Source-backed nodes preserve authored-source fallback; synthetic extension leaves use their required perceivable-text projection; extension containers preserve their validated children.
- **FR13 — Live transforms do not reparse or mutate retained output.** Adding, removing, reordering, or updating transforms refreshes transformed output without rerunning syntax tokenization. Only current parser options and ordered syntax identity invalidate syntax parse identity. Prior snapshots stay unchanged; unchanged settled legacy output retains its released reuse and remount behavior.

### Rendering and cross-surface identity

- **FR14 — Extension rendering is complete and local.** Every extension kind a plugin may introduce has an owning renderer and perceivable-text projection. Missing or failed rendering preserves exact authored source for source-backed leaves, the required projection for synthetic leaves, or validated Markdown children for containers; siblings continue running.
- **FR15 — Core semantics remain authoritative.** Plugins cannot replace the document root or override Core-owned heading level/ID, navigation, image policy, list semantics, table semantics, or built-in accessibility behavior. Trusted renderer-created links and resources remain renderer-owned.
- **FR16 — One selected heading projection.** Markdown and Markdown-derived Outline use the same syntax list, transform list, text projection, and installed heading projection. The released projection remains top-level; `module:Markdown/headingLinks` may opt into its separately owned projection through the same opaque plugin list without changing Outline selection. Renderer output cannot change identity.
- **FR17 — A semantic fence claims its fence before the code override.** A semantic-fence helper may annotate an eligible original code node but cannot replace its source. Rendering resolves the helper proposal first: when the owning plugin's renderer renders it, that output replaces the fence. `components.code` renders every fence no proposal claims, and is the local fallback for a claimed fence whose renderer is absent, returns nothing, throws, or suspends. Without `components.code`, ordinary copyable code is that fallback.

### Remark compatibility

- **FR18 — Adapter scope is explicit.** The adapter supports only synchronous transform-only plugins over the documented MDAST subset. It does not emulate Unified parser/compiler registration, async execution, processor state, or unrestricted `VFile` behavior.
- **FR19 — Translation is lossless or rejected.** Each adapted node and metadata field has a documented round trip. Unsupported input or output fails closed with readable source; the adapter never silently drops or approximates content.
- **FR20 — Compatibility is tested per plugin.** A package is called compatible only after fixtures prove equivalent supported-subset output, protected-context behavior, diagnostics, source preservation, and server rendering.

### Resources

- **FR21 — Unclaimed work is bounded.** A helper callback runs only for an actual claim; unmatched source cannot invoke it. Stable and recreated semantically equivalent plugin lists must both satisfy FR23, without requiring any particular preparation or dispatch implementation.
- **FR22 — Existing parser budgets remain the floor.** The canonical [parser performance fixture](../../../packages/core/src/Markdown/parser.perf.test.ts) remains green: full parse stays below 20/50/100/400/1000 ms at 10/50/200/500/2000 sections; full and incremental 50-character streaming stay below 5000 ms at 50 sections and 30000 ms at 500; incremental time stays at most 1.1× full reparse; and its exact settled-tail work, object-reuse, source-range, median/worst-block, and tracked whole-prefix assertions remain unchanged.
- **FR23 — Focused overhead budgets cover both transform paths.** Under the evidence protocol below, each budget names the path it measures. First-party helper transforms: five zero-work helpers add at most 15 percent and the representative three-helper set adds at most 25 percent, at both fixture sizes. Plugin-authored transforms, which pay full immutability and validation guards: five zero-work transforms add at most 30 percent and the representative three-transform set adds at most 50 percent, at both fixture sizes. Streaming the representative plugin-authored set stays within FR22's streaming budgets and at most 1.25× the same stream with an empty pipeline. Per-transform guard work is bounded by one traversal of that transform's output; whole-document invariant collection happens once per pipeline run, not once per transform. Core may skip a guard for a helper-authored transform only where the helper's own construction already guarantees the property, and the published budget must say which path a number describes.
- **FR24 — Optional work stays optional.** The server-safe `@astryxdesign/core/Markdown/parser` subpath contains no client directive or component dependency. Remark adapters, the conformance kit, and heavy renderers are tree-shakeable and absent from parser-only/server bundles unless imported.

### Extension containers, ownership, and node data

- **FR25 — Extension nodes declare their content.** Every extension kind declares `'none'`, `'phrasing'`, `'flow'`, or an explicit allowlist with optional finite cardinality bounds. An allowlist narrows the category its `display` already implies and never widens it, and an extension kind's name may not collide with a supported built-in node name. Core validates the declaration at admission and the actual children at every transform boundary. A container produced by syntax declares an inner source span that Core parses; no plugin supplies children built from raw source. Containers count toward the built-in container-depth bound, neither restart nor independently scope the heading projection selected under FR16, and keep their children when their renderer fails.
- **FR26 — Ownership is minting and editing, not existence.** A transform may read another plugin's extension nodes and may remove them, including removing a subtree that contains them. It may not create, edit, reorder the internals of, or duplicate a node owned by another plugin. A source heading may be removed or inserted but its depth may not change and its identity may not be forged or duplicated. Every rejection under this rule reports a diagnostic that names the ownership rule and the owning plugin rather than a generic invalid-document code.
- **FR27 — Plugins declare the plugins they read.** `dependsOn` lists plugin names whose extension nodes a plugin reads. Preparation validates that each named plugin is present and ordered earlier. An unmet or misordered dependency is a failure local to the declaring plugin: its transform does not run, its syntax and renderers remain active, and one diagnostic distinguishes missing from misordered. Declaring no dependency keeps array-order-only behavior.
- **FR28 — Core-internal per-node state lives in one reserved data namespace.** Core's own per-node bookkeeping is a documented reserved key of node `data`, not a hidden, non-enumerable, or signature-matched channel. Plugin data lives under the owning plugin's key. Plugins may read reserved data; authoring, editing, forging, or removing it is rejected with a diagnostic.

### Diagnostics and failure visibility

- **FR29 — One diagnostic channel, including in production.** `onPluginDiagnostic` is available on the component and in parser options and receives one event per failure or advisory: the plugin name, phase (admission, syntax, transform, render, or adapter), stable enumerated code, and severity. Events are source-free by construction — no document text, node values, destinations, or positions — and are delivered in development and production. Delivery is rate-limited per document and plugin/phase/code, and a suppression code reports when the bound is reached. With no handler, development surfaces each unique code once and production stays silent. `context.report()` accepts a plugin-authored stable code rather than document-derived text and is delivered as an advisory, never as a failure. Any condition that silently degrades a document to reduced plugin behavior, including exceeding a validation size bound, emits a diagnostic.
- **FR30 — Admission and version failures are uniform and soft.** A malformed entry, duplicate name, unsupported protocol version, or otherwise unadmissible list behaves identically through the component and every public parser entrypoint: the call succeeds with the last valid configuration — an empty pipeline when nothing is admissible — reports one diagnostic, and never throws into the caller. A protocol-version mismatch is never an import-time or module-scope throw. Plugin identity created by a compatible duplicate Core copy remains valid through a stable cross-package brand whose frozen shape and version are verified.

### Authoring, canonical APIs, and packaging

- **FR31 — Extension types are inferred.** `createMarkdownPlugin()` infers the plugin's extension-node union from its declaration. No callsite requires explicit type arguments or a hand-written node alias to obtain correct narrowing in `renderers`, `transform`, traversal, and the aggregated list union. A declaration that produces extension nodes without a matching renderer, or that resolves to an empty extension union while extension kinds are used, is a type error rather than a silently permissive `never`.
- **FR32 — The canonical AST has public parse entrypoints.** `parseMarkdownAst()` and `parseInlineAst()` return the canonical tree these types describe, accept the same options and ordered plugin list as the component, and sit beside the released `parseMarkdown` family, which keeps its projected result shape.
- **FR33 — A server-safe parser entry exists.** `@astryxdesign/core/Markdown/parser` exports parsing, canonical AST types, and plugin admission with no client-boundary directive, so a server importer does not pull a client reference. It is registered in the generated export map and covered by an import fixture, exactly as the adapter entry is.
- **FR34 — A conformance kit produces per-plugin evidence.** `@astryxdesign/core/Markdown/testing` exports fixtures a plugin author runs to produce the evidence FR20 requires: protected contexts, immutability, validation rejection, failure fallback and diagnostics, container content validation, streaming idempotence, and server rendering. It is tree-shakeable and absent from runtime bundles.
- **FR35 — Compatibility and limits are consumer-documented.** Consumer documentation publishes the supported and rejected categories with the Astryx answer for each: transform-only content rewriters are supported; anything that extends the grammar, emits markup or hast, depends on processor or file state, or only reports messages is not. It states plainly that no raw-markup stage exists, names the native capabilities that make specific plugin categories unnecessary, and documents that a renderer is arbitrary application code, so the trust boundary is the plugin package rather than the document.

### Streaming, theming, and stability

- **FR36 — Transforms are idempotent under streaming.** A transform runs again for every streamed update. Given the same source prefix it must return the same result, and its output must converge rather than oscillate as the prefix grows. Transforms whose effect is valid only on complete input use the final-input signal. Evidence includes a no-oscillation fixture across chunk boundaries.
- **FR37 — Extension output has an opt-in theme target.** An extension renderer may opt into one Markdown-owned extension theme target so themes can reach plugin output. Opting out leaves output untargeted. The target carries no default styling or anatomy beyond block spacing and content width Core already applies, and it does not make plugin output part of Markdown's default anatomy.
- **FR38 — Prepared work is reused for equal lists.** Semantically equal plugin lists reuse prepared syntax and transform work across renders whether or not the array reference is stable, so preparation cost is not proportional to render count. Where reuse cannot be established, development reports one diagnostic identifying the recreated list, and consumer documentation states the hoisting guidance.
- **FR39 — Protocol stability is published.** The first public release publishes what `apiVersion` covers — entry shape, capability names, extension-node discriminants, declared content shapes, diagnostic codes and phases, and canonical node union — and what it does not — helper internals, unlisted AST fields, Core-reserved node data, and diagnostic text. A change that invalidates an existing conforming plugin bumps `apiVersion`; purely additive capability does not. The policy states which Core versions accept a given `apiVersion` and how skew fails, consistent with FR30.

### Planned first-party scope

- **FR40 — First-party plugins use the public protocol.** Astryx ships a small first-party set — soft breaks, heading links, configurable entity references, and callout containers — through the public opaque plugin list, each owning its semantics and evidence in its own module record and serving as a canonical documentation example. No first-party plugin receives a public capability, validation exemption, ordering privilege, or type affordance unavailable to a third party; an internal composition seam or fast path is permitted only where its module record owns the behavior and the empty pipeline stays unchanged, per FR3.
- **FR41 — Footnotes, definitions, and references stay Core scope.** They are not a plugin surface: their identity is document-level ID allocation, collision handling, and back-reference navigation that Core owns under FR15 and FR16, and a plugin owning them would fork the identity system Markdown and Outline share. Until a separately approved contract adds them as Core syntax, they are unsupported, the adapter rejects them, and consumer documentation names the gap explicitly rather than implying a plugin workaround.

## Performance evidence protocol

- **Fixture:** a deterministic 200- and 500-section document; each section contains one heading, prose with an identifier and mention, a two-item list, a block quote, one table row, and an ordinary fenced code block.
- **Helper zero-work set:** five prepared first-party helper transforms with valid selectors that match no fixture node or source span.
- **Helper representative set:** three helpers that respectively match prose identifiers, annotate eligible code fences, and decorate a known source range.
- **Plugin-authored zero-work set:** five plugin-authored transforms that return their input root unchanged, taking the full immutability and validation path.
- **Plugin-authored representative set:** three plugin-authored transforms that respectively rewrite matched prose text, wrap a section in an extension container, and read a preceding plugin's nodes under a declared dependency.
- **Streaming set:** the plugin-authored representative set applied to the 200-section fixture streamed in 50-character chunks, compared against the same stream with an empty pipeline.
- **Comparison:** omitted/empty pipeline versus the same parse-and-transform call with the stable plugin list, in one isolated process and runner.
- **Sampling:** ten untimed warmups, then nine alternating paired rounds; each side averages 20 iterations per round. The reported ratio is the median of the nine paired ratios. Both 200- and 500-section ratios must satisfy FR23. An A/A control outside the measurement-validity bound invalidates that sample; the harness retries rather than certifying noisy output. After a first valid sample over a budget, the stable and recreated lists are each decided separately, per budget and fixture size: a list fails when five of up to nine fresh-process valid samples, the first included, are over the budget.
- **Cost-shape evidence:** guard traversal counts are asserted directly, so adding a transform may add at most one output traversal and may not repeat whole-document invariant collection.
- **Regression signal:** invoking a helper callback for unclaimed source, invoking a claimed helper more than once, regressing parse/result reuse, or publishing a number without naming its path must fail work-count or threshold evidence.

## Public parser integration

Block, inline, incremental, canonical-AST, Markdown, and Outline entrypoints accept the same ordered plugin configuration and infer the same extension-node union while retaining their released signatures and projected result shapes. The canonical entrypoints return the canonical tree directly; released entrypoints keep their projection. The server-safe parser entry exposes the same behavior without a client boundary, and the Markdown component barrel re-exports it for client code. Inline transforms must satisfy the one-paragraph phrasing constraint. Transform-only updates cannot increase syntax tokenizer calls, mutate prior snapshots, or remount unchanged settled output beyond current behavior.

### Public API admission evidence

| Caller-owned distinction       | Before / unchanged default                                                                                    | Opt-in callsite                                                                                                                                                                        | Why Core cannot derive it                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| No plugin behavior             | `<Markdown>{source}</Markdown>` and `parseMarkdown(source)` retain released output.                           | `<Markdown plugins={plugins}>{source}</Markdown>`                                                                                                                                      | Only the application knows which extension packages and ordering it trusts for this document.                                                    |
| Novel source grammar           | Preprocess source or fork parsing; `components` and `inlinePlugins` cannot claim new block/inline grammar.    | `createMarkdownPlugin({name, apiVersion: 1, parseKey, syntax, renderers})`                                                                                                             | The application owns the literal grammar, bounded tokenizer, parse-version key, and extension semantics.                                         |
| Semantic text/fence/range work | Existing `inlinePlugins` remains available; `components.code` remains the code override for unclaimed fences. | Put `createMarkdownTextTransform()`, `createMarkdownFenceTransform()`, or `createMarkdownSourceDecoration()` in the plugin's one `transform`; render typed output through `renderers`. | Only the plugin knows which prose, language, or source range has domain meaning; helpers cannot infer product semantics and never own rendering. |
| Rich extension container       | No custom container syntax or renderer is active.                                                             | Declare `content: 'phrasing'                                                                                                                                                           | 'flow'                                                                                                                                           | {allow, min?, max?}` and render the Core-parsed children through the owning renderer. | Core can validate and parse children but cannot infer whether a product concept is a callout, card, tab, or leaf. |
| Cross-plugin observation       | Array order alone has no declared dependency.                                                                 | Add `dependsOn: ['earlier-plugin']` before reading its nodes.                                                                                                                          | Only the later plugin knows that its transform requires another plugin's output; Core validates presence and order.                              |
| Diagnostics                    | With no handler, development reports unique failures and production stays silent.                             | Pass `onPluginDiagnostic={event => report(event)}` or the parser equivalent.                                                                                                           | The host owns telemetry destination and retention; Astryx owns a source-free bounded event shape, not the logging system.                        |
| Canonical/server parsing       | Released parser calls keep their projected unions.                                                            | Import `parseMarkdownAst` from `@astryxdesign/core/Markdown/parser` when a server or transform tool needs the canonical tree.                                                          | Core cannot infer whether a caller needs released compatibility data or canonical extension-aware structure.                                     |
| Markdown-derived Outline       | Existing calls omit options and retain released headings.                                                     | Pass the same `plugins` and finality to Markdown and `parseOutlineFromMarkdown`/`useOutlineFromMarkdown`.                                                                              | The caller owns which document/plugin configuration both surfaces represent; Core then owns shared text/slug identity.                           |
| Theme reachability             | Renderer output is untargeted by default.                                                                     | Set the renderer's opt-in Markdown extension theme target.                                                                                                                             | Only the renderer author knows whether its application-owned output should participate in design-system theming.                                 |

The new decisions are additive and opt-in. `components` swaps supported built-in rendering but cannot add source grammar or document transforms. `inlinePlugins` performs released prose matching but cannot add block syntax, canonical whole-tree transforms, or typed extension ownership. Existing parser options cannot express application-defined grammar, renderer ownership, declared cross-plugin dependencies, or host diagnostics. These surviving distinctions therefore belong to the caller and cannot be derived safely by Core.

## Verification

| Contract             | Verification                                                                                                                                                  | Representative states                                                                                                                 | Mutation or failure expectation                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR5              | Public type/export fixtures, DOM/AST snapshots, duplicated-Core-copy fixture, and the callsite matrix above                                                   | Omitted, explicit empty, stable/recreated lists, every released prop and parser overload, two Core copies in one graph                | Removing empty parity, changing a released signature, or rejecting an entry created by a compatible second Core copy fails.      |
| FR6–FR13             | Syntax claim matrix; typed narrowing; transform replacement/insertion/removal/annotation; inline-shape, mutation, cycle, raw, async, and provenance rejection | Full, inline, terminal, incremental partial/final, syntax-only update, transform-only update, prior snapshots                         | Reordering transforms changes ordered evidence; adding tokenizer calls, mutating a prior snapshot, or leaking a rejection fails. |
| FR14–FR17            | Renderer/fallback matrix, semantic-owner matrix, heading/Outline identity, code override precedence, server rendering                                         | Source-backed and synthetic extensions, containers, duplicate headings, cross-base headings, custom code override present/absent      | Failed render preserves exact source, required projection, or children; `components.code` never pre-empts a claimed fence.       |
| FR18–FR20            | One real compatible transform plus rejected async, parser-extension, raw-HTML, unsupported-node, forged-position, processor-state, and metadata fixtures      | Every supported matrix row, constrained file messages/data, protected contexts, server rendering                                      | Silent field loss, unsupported-node acceptance, source loss, or an escaping rejection fails closed fixtures.                     |
| FR21–FR24            | Canonical linked parser budgets, callback work counts, guard-traversal counts, bundle inspection, and the exact paired protocol above                         | 200/500 sections, stable/recreated lists, helper and plugin-authored zero-work and representative sets, streaming set                 | Any unmatched callback, duplicate claim callback, repeated whole-document guard, parser-budget regression, or breach fails.      |
| FR25–FR28            | Content-declaration admission/tree validation, ownership matrix, dependency preparation, reserved-data rejection                                              | Leaf, phrasing, flow, allowlist; nested containers at depth bound; foreign read/remove/mint/edit; unmet/misordered dependencies       | Plugin-built raw-source children, invalid content, foreign mint/edit, or generic ownership diagnostics fail.                     |
| FR29–FR30            | Diagnostic fixtures in development/production and admission parity across entrypoints                                                                         | Every phase/code, advisories, rate suppression, no-handler default, malformed list, duplicate Core, version skew                      | Silent production failure, document content in diagnostics, module-scope throw, or entrypoint divergence fails.                  |
| FR31–FR35            | Inference fixtures without explicit type arguments, canonical/server imports, conformance-kit self-test, documentation checks                                 | Syntax-only, transform-only, renderer-only, heterogeneous lists, server import, third-party kit run                                   | Explicit-type workarounds, client references in server entry, or undocumented rejected categories fail.                          |
| FR36–FR39            | Streaming no-oscillation, theme reachability, prepared-reuse counts, stability-policy docs                                                                    | Chunk boundaries, final-only effects, themed/unthemed output, equal new-identity lists, version skew                                  | Oscillation, unreachable opted-in output, per-render re-preparation, or unpublished policy fails.                                |
| FR40–FR41            | First-party module records/evidence and unsupported-node fixtures                                                                                             | Soft breaks, heading links, configurable entity references, callouts; footnote/definition/reference source through parser and adapter | First-party public privilege, changed empty-pipeline behavior, or plugin-owned footnote/definition support fails.                |
| Repository integrity | Knowledge validation, public-content checks, typecheck, formatting, and changed-file review                                                                   | Specification and every implementation PR                                                                                             | Internal content, stale owner records, unrelated paths, or formatting/type failures block merge.                                 |

## Related owner prerequisites

Before implementation acceptance, current owner clauses must cover:

1. a stable canonical MDAST-aligned AST, typed node-map/visitor APIs, released-parser compatibility projection, public canonical parse entrypoints, and Core-owned semantic validation;
2. Markdown/Outline shared transformed heading identity and the unchanged top-level traversal both surfaces use;
3. observable invalidation identity that distinguishes syntax from live transforms;
4. navigation/resource conformance for transformed nodes;
5. exact `inlinePlugins` compatibility before any migration;
6. the diagnostic channel on the component and parser options;
7. the opt-in extension theme target in Markdown's theming anatomy;
8. server-safe parser and conformance-kit package entries;
9. first-party plugin module owners for soft breaks, heading links, configurable entity references, and callouts.

## Decision log

### DEC-1 — Expose syntax, transform, and renderers only

**Reference:** `spec:AST-036/DEC-1`
**Direction owner:** `cixzhang`, `2026-09-15`

The public protocol has three concepts. Text matching, semantic fences, and decorations are transform helpers, not parallel lifecycle APIs, and they never render — presentation always comes from the owning plugin's `renderers`. This keeps one mental model while permitting specialized internal execution.

Rejected: five independent public capability phases; a second transform prop; helpers that accept render callbacks; replacing simple local syntax with an unbounded document hook.

### DEC-2 — Make immutable AST transformation canonical

**Reference:** `spec:AST-036/DEC-2`
**Direction owner:** `cixzhang`, `2026-09-15`

Transforms receive the canonical MDAST-aligned tree observed by parsing, rendering,
and Outline. Public node-kind traversal preserves strict discriminated narrowing,
including plugin extension nodes. Inputs are immutable and transforms return
validated roots. Core owners retain provenance, structural validity, fallback, and
semantic authority. Released parser results remain unchanged until a separately
approved migration.

Rejected: a second transform tree, in-place mutation of canonical state,
transform-driven reparsing, raw markup, weakly typed string visitors, and
renderer-controlled heading identity.

### DEC-3 — Support a limited Remark compatibility profile

**Reference:** `spec:AST-036/DEC-3`
**Direction owner:** `cixzhang`, `2026-09-15`

A tree-shakeable adapter may run synchronous transform-only Remark plugins over an explicit MDAST subset. Compatibility is per-plugin evidence, never inferred from package identity, and supported and rejected categories are published for consumers.

Rejected: adopting Unified/MDAST as Core's runtime, claiming arbitrary Remark compatibility, or silently approximating unsupported behavior.

### DEC-4 — Separate syntax identity from live transforms

**Reference:** `spec:AST-036/DEC-4`
**Direction owner:** `cixzhang`, `2026-09-15`

Only syntax and existing parser options determine parse identity. Transform and renderer updates reuse parsed output and rerun only their owning post-parse work.

Rejected: object identity as parse identity, transform-driven reparsing, a public render key, or repeated preparation for semantically equal inputs.

### DEC-5 — Extension nodes may contain validated Markdown

**Reference:** `spec:AST-036/DEC-5`
**Direction owner:** `cixzhang`, `2026-09-16`

Callouts, admonitions, details, tabs, cards, and columns require real Markdown children. An extension therefore declares leaf, phrasing, flow, or narrowed allowlist content, and Core validates children. Core parses syntax-container inner spans; plugins never build children from raw source, so provenance and protected contexts stay Core-owned. A container never selects or independently scopes heading identity; it participates only in the projection already selected under FR16. A failed container renderer still exposes its validated children.

Rejected: leaf-only extension nodes; independent nested document shells; plugin-authored parsed children; unbounded nesting.

### DEC-6 — Ownership means minting and editing, not existence

**Reference:** `spec:AST-036/DEC-6`
**Direction owner:** `cixzhang`, `2026-09-16`

A transform may read or remove another plugin's nodes, including a removed subtree, but may not create, edit, internally reorder, or duplicate them. Source headings may be inserted, removed, or reordered but never re-levelled or given forged/duplicated identity. `dependsOn` makes cross-plugin reads explicit and validates presence and order.

Rejected: foreign-node immortality; immortal headings; silent missing/misordered dependencies; generic ownership diagnostics.

### DEC-7 — Failure is visible in production

**Reference:** `spec:AST-036/DEC-7`
**Direction owner:** `cixzhang`, `2026-09-16`

Astryx owns one source-free, rate-limited `onPluginDiagnostic` channel covering admission, syntax, transform, render, and adapter phases in development and production. Plugin advisories carry stable codes, not document-derived text. Admission failures are uniform across component and parser entrypoints; version skew never throws at import time. Rejected tokenizer and transform thenables are defused before refusal.

Rejected: development-only reporting; free-text document-derived messages; silent bounded-validation fallback; one entrypoint throwing where another recovers.

### DEC-8 — The canonical AST, server parser, and conformance kit are public

**Reference:** `spec:AST-036/DEC-8`
**Direction owner:** `cixzhang`, `2026-09-16`

Exported canonical node types have public parse producers. A server-safe parser entry avoids a client reference. Shared conformance fixtures let third parties produce required evidence. Plugin declarations infer extension types without hand-written aliases or multiple explicit type arguments.

Rejected: canonical types with no public producer; parser APIs reachable only through a client barrel; evidence requirements with no shared kit; inference deferred to examples.

### DEC-9 — Publish the cost of the path plugins actually take

**Reference:** `spec:AST-036/DEC-9`
**Direction owner:** `cixzhang`, `2026-09-16`

First-party helpers may skip guards their construction proves, but their numbers do not describe third-party cost. Budgets therefore name helper and plugin-authored paths separately, include streaming, and constrain guard work to one traversal of each transform output with whole-document invariants collected once per pipeline run.

Rejected: publishing helper-path numbers as protocol overhead; unmeasured streaming; repeated whole-document invariant collection per transform.

### DEC-10 — Footnotes, definitions, and references stay Core scope

**Reference:** `spec:AST-036/DEC-10`
**Direction owner:** `cixzhang`, `2026-09-16`

These concepts require document-level ID allocation, collision handling, and back-reference navigation shared with Markdown identity. They remain unsupported and adapter-rejected until a separate Core syntax contract adds them; documentation names the gap.

Rejected: first- or third-party footnote plugins; adapter translation into ordinary links; leaving the limitation undocumented.

### DEC-11 — First-party plugins are ordinary plugins

**Reference:** `spec:AST-036/DEC-11`
**Direction owner:** `cixzhang`, `2026-09-22`

Soft breaks, heading links, configurable entity references, and callout examples use the public opaque plugin list, own their semantics and evidence in module records, and receive no public capability, exemption, ordering privilege, or type affordance unavailable to third parties. An internal composition seam or fast path is allowed only when its module record owns the result and the empty pipeline remains observationally unchanged.

Rejected: privileged first-party capabilities; demos that exercise private paths; a public protocol with no real first-party consumers.

### DEC-12 — A semantic fence outranks the host code renderer

**Reference:** `spec:AST-036/DEC-12`
**Direction owner:** `cixzhang`, `2026-10-09`

A host that supplies `components.code` usually does so to highlight ordinary code, and that host is the one most likely to also install fence plugins for diagrams, charts, or diffs. A fence proposal is the more specific claim: it names one language and the plugin that owns it, so it renders first and `components.code` renders every fence no plugin claims. A claimed fence whose renderer declines or fails falls back to the host's code renderer, so a reader still sees the code the way the host draws it. A product feature that gives a fence language meaning ships as a fence plugin, not as a branch inside a host's code renderer. Only a host that supplies both `components.code` and a fence plugin claiming the same language changes behavior: that language's fences render through the plugin. A host with only one of the two renders exactly as before.

Rejected: passing the proposal to `components.code` for each host to re-dispatch, which puts plugin rendering back inside a host component.

## Open questions

None. The contract is current; implementation and compatibility evidence remain pending.

## Content boundary

This record does not duplicate consumer signatures, examples, private dispatch/cache design, repository layout, first-party plugin behavior, or current audit results. Those belong to their canonical owners.
