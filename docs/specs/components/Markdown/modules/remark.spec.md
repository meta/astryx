---
schema_version: 3
template_version: 2
kind: module
id: module:Markdown/remark
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-15
owners: [cixzhang]
review_triggers: [public-api, behavior]
verified_by: [packages/core/src/Markdown/remark.test.tsx]
parent_component: component:Markdown
references: [architecture:public-component-api, spec:AST-036/DEC-3]
---

# remark module contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `createMarkdownRemarkTransform(plugin, ...settings)` in the separate `@astryxdesign/core/Markdown/remark` entry point returns one Markdown transform for `createMarkdownPlugin()`. It accepts a conventional Unified/Remark plugin type as well as an Astryx-authored one.                                                                               |
| Behavior                | Each invocation runs one synchronous transform-only Remark plugin over a fresh mutable copy of the canonical tree with an isolated constrained file, then accepts a lossless round trip or rejects it.                                                                                                                                                   |
| End-user impact         | Readers see either the plugin's supported transformation or the last valid readable document; unsupported behavior can never silently drop, approximate, or forge document content.                                                                                                                                                                      |
| Builder impact          | Builders who import nothing are unaffected. An opt-in builder imports the adapter, proves one plugin compatible with fixtures, and reads one diagnostic when a plugin leaves the profile.                                                                                                                                                                |
| Compatibility/readiness | Additive and opt-in; absent from Markdown's entry point and from parser-only or server bundles unless imported. Compatibility is per plugin evidence, never package identity.                                                                                                                                                                            |
| Review checks           | Reject silent approximation, dropped fields, restored or rebuilt provenance, authored or shifted positions, edited Astryx owned nodes, raw-markup channels, async or processor-state plugins, plugin-authored diagnostic text, a refusal a plugin can catch and continue past, an unhandled rejection, or adapter imports inside Markdown or the parser. |
| Governing rules         | [`spec:AST-036` FR18–FR20, FR24](../../../AST-036/spec.md); [`component:Markdown` FR12–FR16](../Markdown.spec.md); [`architecture:public-component-api`](../../../../architecture/public-component-api.md).                                                                                                                                              |

This table is a review projection; the body below is authoritative.

## Intent

Teams with existing Remark transforms should be able to reuse a compatible one
inside Astryx Markdown without adopting Unified as a Core runtime, mutating the
canonical tree, or weakening Core-owned semantics. This module owns that narrow
compatibility boundary: what the profile accepts, what it refuses, and how a
refusal stays readable.

Everything outside the profile fails closed. "Remark-compatible" is a claim a
plugin earns from fixtures in this module's tests, never from a package name.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: additive, opt-in, separately imported; no released
  Markdown, parser, Outline, or bundle behavior changes when the adapter is not
  imported
- Migration decision: `spec:AST-036/DEC-3`

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The adapter's public factory, its mutable Remark tree types, and its
  constrained file type.
- The supported-subset round trip and the exact rejection conditions below.
- The isolated per-invocation copy, file data, and diagnostics.
- Its own evidence that one real plugin is compatible.

**Does not own / non-goals**

- Plugin admission, transform ordering, validation, and failure recovery —
  owned by `component:Markdown` and `spec:AST-036`.
- Unified processors, parser or compiler registration, micromark extensions,
  async pipelines, and `VFile` behavior beyond the constrained file.
- Heading identity, navigation, resource policy, list, table, and document
  semantics — owned by Core.

## Public API and concepts

| Concept                         | Closed values or states                                            | Meaning                                                                                                                                                                                                               | Default        | Owner                    | Stability |
| ------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------ | --------- |
| `createMarkdownRemarkTransform` | `(plugin, ...settings) => MarkdownTransform`                       | Adapts one attacher-shaped Remark plugin; the attacher runs once, its transformer per run.                                                                                                                            | none           | `module:Markdown/remark` | stable    |
| Adapted tree                    | supported MDAST subset plus Astryx flow image, citation, extension | A fresh mutable copy the plugin may mutate or replace.                                                                                                                                                                | fresh per run  | `module:Markdown/remark` | stable    |
| Constrained file                | `value`, `data`, `messages`, `message()`, `fail()`, `toString()`   | Readonly source, per-run JSON-like data, and diagnostics.                                                                                                                                                             | empty `data`   | `module:Markdown/remark` | stable    |
| Accepted plugin type            | `MarkdownRemarkPlugin` or `MarkdownRemarkCompatiblePlugin`         | A new plugin may be authored against typed Astryx trees; a conventional Unified/Remark plugin type is accepted structurally, including a declared async or callback-style transformer that the run time then rejects. | structural     | `module:Markdown/remark` | stable    |
| Rejection                       | one diagnostic plus the last valid document                        | The fail-closed result for anything outside the profile.                                                                                                                                                              | not applicable | `module:Markdown/remark` | stable    |

## Behavioral contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1  | The adapter accepts only a plugin whose attacher synchronously returns one transformer of at most two parameters. A parser, compiler, async, callback-style, or registration-only plugin is rejected.                                                                                                                                                                                                                                                                                                                                                                   | `spec:AST-036` FR18             |
| FR2  | Every invocation receives a fresh mutable copy of the canonical tree and a new constrained file. No canonical node, array, data value, or position is mutable, and no state survives between runs.                                                                                                                                                                                                                                                                                                                                                                      | `spec:AST-036` FR10, FR18       |
| FR3  | The constrained file exposes exactly `value`, `data`, `messages`, `message()`, `fail()`, and `toString()`. Every other key — `path`, `cwd`, `history`, or any other — fails closed on read, write, define, and delete, rather than answering `undefined`; `in` and key enumeration answer truthfully so a plugin can feature-detect. Processor access fails closed the same way.                                                                                                                                                                                        | `spec:AST-036` FR18             |
| FR4  | A returned or mutated tree is accepted only when every node and metadata field round-trips losslessly through the supported subset, fenced-code `meta` included; otherwise the last valid document is preserved.                                                                                                                                                                                                                                                                                                                                                        | `spec:AST-036` FR19             |
| FR5  | A surviving source-backed node keeps Core's provenance exactly: every line, column, and offset on both points must come back unchanged. A rebuilt, retyped, duplicated, or shifted surviving node is rejected, never silently restored. Source-backed nodes, including headings, may be removed or reordered; a surviving source heading keeps its depth.                                                                                                                                                                                                               | `spec:AST-036` FR11, FR19, FR26 |
| FR6  | Astryx-owned citation and plugin extension nodes pass through only when every owned field — including `data` and authored `source` — is exactly equal. Authoring or editing one through the adapter is rejected.                                                                                                                                                                                                                                                                                                                                                        | `spec:AST-036` FR11, FR15       |
| FR7  | A failed run reports exactly one diagnostic, assembled only from the adapter's own vocabulary and read from adapter-owned state, never from the thrown value or any object the plugin can rewrite. Text a plugin authored — a thrown error, a `fail()` reason, a `message()` diagnostic — never becomes a diagnostic, because the plugin read the document and may quote it. Any refusal the plugin catches and continues past still fails the run, and the first recorded reason is the one reported. Later plugins and rendering continue on the last valid document. | `spec:AST-036` FR12             |
| FR8  | An unchanged document returns the identical canonical root, so an adapted no-op costs no tree allocation and no downstream invalidation.                                                                                                                                                                                                                                                                                                                                                                                                                                | `spec:AST-036` FR13, FR21       |
| FR9  | The adapter is a separate entry point that Markdown, the parser, and the plugin protocol never import, so parser-only and server bundles exclude it unless a caller imports it. It is registered in the exports generator, so the published subpath cannot drift from the source.                                                                                                                                                                                                                                                                                       | `spec:AST-036` FR24             |
| FR10 | A conventional Unified/Remark plugin type-checks at the callsite without being rewritten, including a transformer that declares Unified's callback parameter or an asynchronous return union. The run time still rejects an actual promise and a callback-style transformer.                                                                                                                                                                                                                                                                                            | `spec:AST-036` FR18             |
| FR11 | A promise the adapter refuses — from the attacher or the transformer — gets a rejection handler attached before any other verdict is applied, so a result that is both refused for another reason and rejected cannot surface as an unhandled rejection. That matters most on the server, where an unhandled rejection ends the process by default and would print a plugin-authored reason drawn from the document. `then` is read exactly once, because reading it can itself throw or trip a guard.                                                                  | `spec:AST-036` FR12, FR18       |
| FR12 | Sticky refusal is re-checked immediately before validated output becomes observable, so a guard that fires late — inside a hostile `then` accessor, or a getter read while the result is validated — still rejects rather than letting the plugin's output through.                                                                                                                                                                                                                                                                                                     | `spec:AST-036` FR12             |

### Supported round trip

| Input                                                         | Round trip                                                                                                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `root`, `paragraph`, `heading`, `blockquote`, `thematicBreak` | Structure and children; heading depth stays Core-owned.                                                                                                         |
| `text`, `strong`, `emphasis`, `delete`, `inlineCode`, `break` | Values and ordered phrasing children.                                                                                                                           |
| `link`, `image`                                               | `url` revalidated by the navigation and resource owners; `alt` required; `title` null.                                                                          |
| `list`, `listItem`                                            | `ordered`, `start`, `spread`, Astryx `delimiter`, and `checked`.                                                                                                |
| `code`                                                        | `lang` and `meta`, each `null` when absent, plus `value`. The authored info string survives both conversions and the released language projection is preserved. |
| `math`, `inlineMath`                                          | Present only when the caller enabled math.                                                                                                                      |
| `table`, `tableRow`, `tableCell`                              | Normalized `align` and cell children.                                                                                                                           |
| Astryx flow image, `citation`, `extension`                    | Preserved as owned nodes; readable by the plugin, not writable.                                                                                                 |
| `position`, `data`                                            | Core-authored positions and finite JSON-like data.                                                                                                              |

### Rejection matrix

| Rejected input                                                                                                                                              | Result                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Async, callback-style, registration-only, or processor-state plugin                                                                                         | Last valid document plus one diagnostic; FR1, FR3                 |
| `html` or any node outside the supported subset (definitions, references, footnotes, frontmatter, directives, MDX)                                          | Last valid document plus one diagnostic; FR4                      |
| An unsupported field, `hName`, `hProperties`, `hChildren`, or non-JSON node or file data                                                                    | Last valid document plus one diagnostic; FR3, FR4                 |
| Non-string fence `meta`, a link or image `title`, a loose list item, or a ragged transformed table                                                          | Last valid document plus one diagnostic; FR4                      |
| Reading, writing, defining, or deleting an unsupported file key — `path`, `cwd`, `history`, or any other                                                    | Last valid document plus one diagnostic; FR3                      |
| An authored, shifted, or removed position on a surviving source-backed node; a rebuilt, retyped, or duplicated source node; or a re-levelled source heading | Last valid document plus one diagnostic; FR5                      |
| A shifted line or column on an otherwise unchanged offset                                                                                                   | Last valid document plus one diagnostic; FR5                      |
| Provenance rebuilt from a copied position, or smuggled in from another document                                                                             | Last valid document plus one diagnostic; FR5                      |
| An authored or edited Astryx citation or extension node, `data` and `source` included                                                                       | Last valid document plus one diagnostic; FR6                      |
| A rejected link or image URL, invalid built-in structure, a nested link, or block output from an inline entry point                                         | Last valid document plus one diagnostic; FR4                      |
| A transformer that throws, or any refusal the plugin caught and continued past, `fail()` included                                                           | Last valid document plus one diagnostic; FR7                      |
| A rejected promise from the attacher or transformer, alone or on top of a caught refusal                                                                    | Last valid document, one diagnostic, no unhandled rejection; FR11 |
| A guard that fires late, inside a `then` accessor or a getter read during validation                                                                        | Last valid document plus one diagnostic; FR12                     |

### Transformation and precedence order

- **ORD1 — one run.** Canonical tree → fresh mutable copy → the plugin's single
  synchronous transformer → validated round trip → the document later plugins
  and rendering observe. Core validates the result again; the adapter never
  substitutes for Core's own validation.
- **ORD2 — one diagnostic, adapter-authored.** A successful run is silent;
  Core's only diagnostic channel reports plugin failure, so there is nothing
  truthful to say. A failed run reports exactly one line, built from this
  module's own vocabulary. Messages a plugin recorded stay on its file, which
  only the plugin sees.
- **ORD3 — defuse, then judge, then accept.** A returned value is inspected
  and defused before any verdict is applied, so the reason a run is refused
  never decides whether a promise is left dangling. Sticky refusal is checked
  again immediately before output is accepted, because a guard can fire at any
  point the adapter touches plugin-controlled values.

### Performance and resources

- **PR1 — one copy per invocation.** Work is proportional to document size once
  per run; an unchanged document returns the canonical root itself.
- **PR2 — no runtime dependency.** The adapter adds no Unified, Remark, mdast,
  or `VFile` dependency and no parse work; it runs inside the existing transform
  phase and cannot trigger reparsing.

## Accessibility contract

- **AR1 — required meaning survives.** An image must keep its text alternative
  and a source heading its level, so a rejection is preferred over an
  accessible-name or document-outline regression.
- **AR2 — no markup channel.** Raw HTML and hast property channels are rejected,
  so an adapted plugin cannot inject unlabeled or non-semantic output.

## Design relationships

No visual representation is owned by this compatibility adapter; adapted output
renders through Markdown's existing parts.

## Parent and system relationships

- `component:Markdown` owns aggregate plugin application, validation, fallback,
  and heading identity.
- `spec:AST-036` owns the protocol, the canonical MDAST compatibility matrix,
  and the limited Remark profile this record implements.
- `family:navigation-destinations` keeps ownership of every adapted link
  destination and image resource.

## Verification map

| Contract | Verification                                                                                              | Representative states                                                                                                                                                      | Mutation or failure expectation                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR3  | `remark.test.tsx` attachment, isolation, and constrained-file fixtures                                    | async, callback-style, processor-state, registration-only plugins; repeated invocations; every unsupported file key, read and written; caught guard refusals               | Accepting one of them, leaking file data between runs, or letting a caught refusal clear the verdict fails the fixtures.  |
| FR4–FR6  | `remark.test.tsx` round-trip and rejection matrix, including a parsed-fence identity fixture              | every supported node kind; fences with and without an info string; each rejected input above; owned citation and extension nodes                                           | A silently dropped field — `meta` included — an accepted unsupported node, or an edited owned node fails closed fixtures. |
| FR7      | `remark.test.tsx` diagnostics plus Markdown rendering after a rejection                                   | thrown transformer, swallowed `fail()`, forged rejection built from the adapter's own class, rewritten `message`, hand-marked fatal message, later plugin in the same list | A missing, duplicated, or plugin-authored diagnostic, a swallowed failure that succeeds, or a lost sibling plugin, fails. |
| FR8      | `remark.test.tsx` identity fixture over the full supported document                                       | untouched document with positions, math, citations, and extension nodes                                                                                                    | Returning a copy instead of the canonical root fails identity.                                                            |
| FR9      | `remark.test.tsx` import and manifest fixtures; `sync:exports:check`                                      | Markdown, parser, and plugin modules; the published entry point                                                                                                            | An adapter import inside Core's Markdown path, or an unregistered subpath, fails.                                         |
| FR10     | `remark.test.tsx` compile fixture over Unified-shaped declarations                                        | attacher bound to a processor; callback-parameter and async-union transformer; inline Astryx plugin                                                                        | Narrowing the accepted type so a conventional plugin stops compiling fails the fixture.                                   |
| FR11     | `remark.test.tsx` rejection fixtures observing `process` unhandled rejections, including server rendering | rejected attacher result; rejected transformer result; a rejected result on top of a caught guard or a caught `fail()`; a thenable whose `then` throws                     | Applying a verdict before defusing, or refusing without attaching a handler, fails the fixtures.                          |
| FR12     | `remark.test.tsx` late-guard fixtures                                                                     | a hostile `then` accessor; a getter that trips a guard while the result is validated                                                                                       | Dropping the final sticky re-check lets caught-guard output through and fails the fixtures.                               |

## Decision log

### DEC-1 — Lossless round trip or a readable rejection

**Reference:** `module:Markdown/remark/DEC-1`
**Decider:** `cixzhang`, `2026-09-15`

The adapter never approximates. Link titles, loose list items, raw markup,
unsupported nodes, and metadata Astryx cannot represent — including a
non-string fence `meta` — have no Astryx meaning, so accepting them would
silently change or drop what a reader sees. An authored fence info string does
have a meaning here and round-trips intact; it is rejected only when it is not
a string. Refusing the rest keeps the last valid document readable and makes
the gap visible to the builder in one diagnostic instead of to the reader as
missing content.

### DEC-2 — Provenance is carried, never inferred

**Reference:** `module:Markdown/remark/DEC-2`
**Decider:** `cixzhang`, `2026-09-15`

A transformed node belongs to a source node only when it carries the marker the
adapter put on the copy; matching on a position that merely looks right would
let a rebuilt node inherit provenance it never had. Equality is exact across
every line, column, and offset, because restoring Core's position over a
changed one is the silent approximation this profile exists to refuse.

### DEC-3 — Only the adapter speaks in diagnostics

**Reference:** `module:Markdown/remark/DEC-3`
**Decider:** `cixzhang`, `2026-09-15`

A plugin's own text reached it from the document and may quote any of it, so
forwarding it would turn a developer warning into a place private content
leaks. The single reported line is assembled from this module's vocabulary
instead; a plugin's messages remain on the file it was given.

Everything the plugin can reach, it can also rewrite: `message` is writable on
any Error, and catching one rejection hands it the rejection class itself. So
the reported reason is read from adapter-owned state keyed by the thrown
object, and every refusal — a prohibited file key, a processor access, the
plugin's own `fail()` — is recorded in adapter-owned run state rather than on
anything the plugin holds. A refusal the plugin catches and continues past
still fails the run, and the first reason recorded is the one reported.

### DEC-4 — Owned nodes stay Core's

**Reference:** `module:Markdown/remark/DEC-4`
**Decider:** `cixzhang`, `2026-09-15`

An adapted plugin may read an Astryx citation or extension node but cannot mint
or edit one, and cannot change a source heading. Owned nodes are how Markdown,
Outline, and fallback agree on one document; a compatibility shim is the wrong
place to let them drift.

### DEC-5 — Accept the plugin types Remark already has

**Reference:** `module:Markdown/remark/DEC-5`
**Decider:** `cixzhang`, `2026-09-15`

The whole point of the profile is reusing an existing plugin, so a plugin typed
against Unified must compile here unchanged — Unified declares one transformer
type carrying both the callback parameter and an async return, and refusing it
at the type level would refuse every real plugin. The adapter accepts that
shape structurally and rejects the unsupported behavior at run time, where it
can fail closed with a readable document. Authors writing a new plugin against
Astryx annotate it with `MarkdownRemarkPlugin` and keep a fully typed tree.

## Open questions

None.

## Content boundary

This record does not duplicate consumer signatures or examples, the canonical
plugin protocol, Markdown's aggregate application and fallback rules, the AST
compatibility matrix, or Remark's own documentation. It links to their owners.
