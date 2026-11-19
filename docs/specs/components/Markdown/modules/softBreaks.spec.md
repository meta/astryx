---
schema_version: 3
template_version: 2
kind: module
id: module:Markdown/softBreaks
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-22
owners: [cixzhang]
review_triggers: [public-api, behavior]
verified_by:
  [
    packages/core/src/Markdown/plugins/softBreaks.test.tsx,
    apps/storybook/.storybook/Markdown.remarkPlugins.test.ts,
    apps/sandbox/src/app/(fullscreen)/pages/markdown-perf/benchmarkProfiles.test.ts,
  ]
parent_component: component:Markdown
references: [spec:AST-036/DEC-1, spec:AST-036/DEC-11]
---

# Markdown soft-breaks module contract

## Contract at a glance

| Area            | Contract                                                                                                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract | `markdownSoftBreaksPlugin` is one durable first-party plugin value exported from `@astryxdesign/core/Markdown/plugins`.                                                                                                            |
| Behavior        | Each soft LF, CRLF, or lone CR line ending in eligible phrasing becomes a canonical Markdown `break` node, matching the real plugin through Astryx's adapter.                                                                      |
| End-user impact | Readers see author-intended line wrapping without requiring two trailing spaces, while protected content remains literal and copyable.                                                                                             |
| Builder impact  | Builders opt in by adding one value to `plugins`; there are no settings or renderer slots.                                                                                                                                         |
| Compatibility   | Additive and opt-in; omitted and empty plugin lists preserve the released parser, DOM, accessibility, and streaming behavior.                                                                                                      |
| Review checks   | Reject missing link-label parity with `remark-breaks`, matching inside code, images, citations, math, or extension nodes; source preprocessing; a custom renderer; or behavior that diverges between complete and streaming input. |
| Governing rules | [`spec:AST-036` FR1–FR17, FR21–FR24, FR36, FR38, FR40](../../../AST-036/spec.md); [`component:Markdown` FR12–FR16, FR21](../Markdown.spec.md).                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

Builders who receive prose with meaningful single line endings should be able to
render those endings as breaks without rewriting source or changing Markdown's
parser. The plugin is deliberately fixed: one stable behavior makes it easy to
recognize, benchmark, and replace with an adapted `remark-breaks` transform.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: additive and opt-in
- Migration decision: `spec:AST-036/DEC-11`

## Ownership boundary

**Owns**

- The exported plugin value and its stable plugin name.
- Converting eligible soft line endings to built-in `break` nodes.
- Complete, streaming, SSR, Storybook parity, and browser-performance evidence.

**Does not own / non-goals**

- Parsing or rendering a new extension node.
- Opaque line endings inside inline/fenced code, images, citations, math, or extension nodes.
- CSS white-space behavior or source preprocessing.
- Hard breaks already authored with Markdown's two-space or backslash syntax.

## Public API and concepts

| Concept                    | Closed values or states                                          | Meaning                                                               | Default             | Owner                        | Stability |
| -------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------- | ---------------------------- | --------- |
| `markdownSoftBreaksPlugin` | one `MarkdownPluginEntry<never>`                                 | Converts eligible soft endings through the public transform protocol. | absent              | `module:Markdown/softBreaks` | stable    |
| Eligible ending            | LF, CRLF, or lone CR inside phrasing text, including link labels | Replaced by one built-in `break` node.                                | literal soft ending | `module:Markdown/softBreaks` | stable    |
| Opaque context             | code, image, citation, math, or extension content                | Remains byte-for-byte content rather than becoming a break.           | protected           | `component:Markdown`         | stable    |

## Behavioral contract

| ID  | Invariant                                                                                                                                   | Basis                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| FR1 | Every eligible LF, CRLF, or lone CR ending becomes exactly one canonical `break` node.                                                      | `spec:AST-036` FR1, FR9   |
| FR2 | The plugin uses only `createMarkdownPlugin()` and the public immutable transform contract and introduces no extension node or renderer.     | `spec:AST-036` FR1, FR40  |
| FR3 | Link-label prose transforms for `remark-breaks` parity; inline and fenced code, images, citations, math, and extension nodes remain opaque. | `spec:AST-036` FR7, FR15  |
| FR4 | Omitted or empty plugin lists preserve the released soft-ending behavior.                                                                   | `spec:AST-036` FR2, FR3   |
| FR5 | Every streamed prefix is deterministic and the final streamed tree equals complete parsing of the same source.                              | `spec:AST-036` FR13, FR36 |
| FR6 | Source with no newline returns the original tree without allocating replacement nodes.                                                      | `spec:AST-036` FR21, FR23 |
| FR7 | Native output matches an adapted `remark-breaks` transform for the supported Astryx subset.                                                 | `spec:AST-036` FR20, FR40 |

## Accessibility contract

- **AR1 — reading order stays source order.** A break adds no focus target and
  does not move text between semantic containers.
- **AR2 — link meaning stays intact.** Link destinations and accessible names
  retain their source text while visual line breaks match `remark-breaks`.

## Design relationships

Soft breaks add no anatomy or styling. Existing Markdown paragraph and break
rendering remains authoritative.

## Parent and system relationships

- `component:Markdown` owns parsing, protected contexts, rendering, and fallback.
- `spec:AST-036` owns the plugin protocol and first-party parity requirement.
- `module:Markdown/remark` owns the adapted `remark-breaks` comparison path.

## Content boundary

This module recognizes only LF, CRLF, and lone CR characters already present in
eligible canonical phrasing text. It does not inspect or persist document content
outside the transform invocation.

## Verification map

| Contract    | Verification                                                               | Representative states                                                                                  | Failure expectation                                                                                    |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| FR1–FR4     | `softBreaks.test.tsx` AST and SSR fixtures                                 | LF, CRLF, lone CR, prose, emphasis, multiline link, inline code, fence, authored hard break, no plugin | Extra, missing, opaque-context, doubled-hard-break, or default-path break fails.                       |
| FR5         | `softBreaks.test.tsx` prefix sequence                                      | before, at, and after a streamed line ending                                                           | Oscillation or final mismatch fails.                                                                   |
| FR6         | `softBreaks.test.tsx` identity coverage and Markdown Perf no-claim profile | no newline                                                                                             | Allocating a changed tree for absent source fails.                                                     |
| FR7         | Storybook native/adapted parity story                                      | prose, emphasis, multiline link, protected code                                                        | DOM divergence fails.                                                                                  |
| Performance | Markdown Performance paired empty/plugin runs for the soft-break workload  | no, sparse, and dense claims; complete and streaming modes                                             | Different source between a pair, missing baseline delta, or missing density control blocks acceptance. |

## Decision log

### DEC-1 — Ship one fixed plugin value

**Reference:** `module:Markdown/softBreaks/DEC-1`
**Decider:** `cixzhang`, `2026-09-22`

Soft breaks have one established meaning and need no product-specific data or
presentation. A fixed value keeps the API smaller than a factory whose options
would not change behavior.

Rejected: source preprocessing; a boolean on Markdown; a renderer callback; a
factory with no meaningful configuration.

## Open questions

None.
