---
schema_version: 3
template_version: 4
kind: module
id: module:Markdown/sourceLines
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-09
owners: [cixzhang]
review_triggers: [public-api, behavior]
verified_by: [packages/core/src/Markdown/plugins/sourceLines.test.tsx]
parent_component: component:Markdown
references: [spec:AST-036/DEC-1, spec:AST-036/DEC-11, component:Markdown/DEC-2]
---

# Markdown source-lines module contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `markdownSourceLinesPlugin` is one fixed first-party plugin value exported from `@astryxdesign/core/Markdown/plugins`. With it installed, `components` block renderers receive an optional `sourceLines` prop.             |
| Behavior                | Each block Markdown renders, nested blocks included, carries `data-source-line` and `data-source-line-end`: the 1-based, inclusive source lines it was parsed from. Inline elements carry none.                            |
| End-user impact         | Readers of a host's line-addressed features (find, highlights, review comments) get results that point at the exact Markdown lines, including inside lists and quotes. Without the plugin nothing changes.                 |
| Builder impact          | Builders opt in by adding one value to `plugins`. A builder with a custom block renderer places the received `sourceLines` on its own element; a plugin block renderer reads lines from its node's `position`.             |
| Compatibility/readiness | Additive and opt-in. Omitted or empty plugin lists keep the released AST, DOM, parse cost, and streaming reuse.                                                                                                            |
| Review checks           | Reject a Markdown prop, stamps on inline elements, line work without the plugin, a wrapper element Markdown adds around custom or plugin output, lines that disagree between full and streaming parses, or offsets in DOM. |
| Governing rules         | [`spec:AST-036` FR3, FR9, FR15, FR40](../../../AST-036/spec.md); [`component:Markdown` FR3, FR12, FR15](../Markdown.spec.md).                                                                                              |

This table is a review projection; the body below is authoritative.

## Intent

A host that maps something in the rendered document back to its Markdown source
(a selection, a search hit, a diff hunk, a comment anchor) needs to know which
source lines each rendered block came from. Lines are the unit because diffs,
blame, and edits address lines, and because a block nested in a list item or a
quote has lines but no contiguous character range. The module gives every block
Markdown renders its lines, so a host builds those features as plugins and host
code instead of forking the renderer.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: additive and opt-in
- Migration decision: `module:Markdown/sourceLines/DEC-1`

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The exported plugin value and its stable plugin name.
- The `data-source-line` and `data-source-line-end` attributes on blocks
  Markdown renders, and the `sourceLines` prop given to `components` block
  renderers, while the plugin is installed.
- Line numbers on the canonical `position` of source-backed block nodes,
  nested blocks included, while the plugin is installed.
- Complete, streaming, and server-render evidence for those lines.

**Does not own / non-goals**

- Aggregate plugin protocol, ordering, and composition — owned by
  `component:Markdown` and `spec:AST-036`.
- Mapping a DOM selection or search hit to lines, highlighting, or any other
  host feature built on the stamps — owned by the product callsite.
- Line or column positions on inline nodes, table rows, or table cells.
- Character offsets in the DOM, and the released `range` projection —
  `parseMarkdown(source, {sourceRanges: true})` keeps its released behavior.
- Elements a custom renderer or plugin renderer owns; Markdown adds no wrapper
  to place stamps on them.

## Public API and concepts

| Concept                     | Closed values or states                                                                                                       | Meaning                                                                                  | Default | Owner                         | Stability |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------- | ----------------------------- | --------- |
| `markdownSourceLinesPlugin` | one `MarkdownPluginEntry<never>`                                                                                              | Turns on source lines for the Markdown, parser, or Outline call it is passed to.         | absent  | `module:Markdown/sourceLines` | stable    |
| Source lines                | `{start, end}`: 1-based, inclusive line numbers into the string the parser received                                           | The lines a block's own source occupies, from its first line to its last non-blank line. | none    | `module:Markdown/sourceLines` | stable    |
| Stamped block               | Heading, Paragraph, List item, Code block, Blockquote, Table, Divider, and block Image on the default path                    | Carries `data-source-line="<start>"` and `data-source-line-end="<end>"`.                 | none    | `module:Markdown/sourceLines` | stable    |
| `sourceLines` prop          | `{start: number, end: number}` on the `heading`, `paragraph`, `code`, `blockquote`, `hr`, `image`, and block `math` renderers | The replaced block's source lines, for the renderer to place on its own element.         | absent  | `module:Markdown/sourceLines` | stable    |

## Behavioral contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                              | Basis                        | Draft review state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------------------ |
| FR1 | With the plugin installed, every stamped block, at any nesting depth, carries `data-source-line` and `data-source-line-end` with its source lines as base-10 integers. Inline elements, table rows, and table cells carry neither attribute.                                                                                                                                                           | host line-addressed features | settled            |
| FR2 | Line numbers count LF and CRLF line endings in the exact string the parser received, including lines a native frontmatter block occupies, so line 1 is the first line of that string.                                                                                                                                                                                                                  | `spec:AST-036` FR9           | settled            |
| FR3 | A block's lines span from its first source line to its last non-blank source line, including its own container markers (`>`, list markers), lazy continuation lines, and a code fence's opening and closing lines.                                                                                                                                                                                     | `component:Markdown` FR23    | settled            |
| FR4 | A supplied `components` block renderer receives `sourceLines` and owns whether and where its element carries the attributes. Markdown adds no wrapper element and does not impose the attributes on the replacement. `sourceLines` is absent for inline math (`display: 'inline'`) and for images in phrasing content, because neither is a block.                                                     | `component:Markdown` FR3     | settled            |
| FR5 | Source-backed block nodes in the canonical tree, extension blocks and a semantic-fence proposal's node included, carry `line` on `position.start` and `position.end`, so a plugin block renderer and a transform read lines from the node.                                                                                                                                                             | `spec:AST-036` FR9           | settled            |
| FR6 | Streaming converges to the lines a full parse of the same text yields at every chunk boundary, and a settled block keeps its lines and its rendered element as more text arrives.                                                                                                                                                                                                                      | `spec:AST-036` FR15, FR21    | settled            |
| FR7 | Without the plugin, the canonical tree carries no `line`, the DOM carries no source-line attribute, `components` renderers receive no `sourceLines`, and parsing does no line work. With it, source lines come from the positions of the single parse Markdown already runs: the plugin adds no parse pass and no per-block re-tokenizing, and no position or line work runs when it is not installed. | `spec:AST-036` FR2, FR3      | settled            |
| FR8 | The plugin introduces no extension node, renderer, element, theme target, or source change, and composes with every other plugin in any order.                                                                                                                                                                                                                                                         | `spec:AST-036` FR40, DEC-11  | settled            |

### Transformation and precedence order

- **ORD1 — Lines are parse output.** Core authors them while parsing;
  transforms observe the lines on source-backed nodes and cannot
  author, shift, or forge them (`spec:AST-036` FR11). A node a transform creates
  has no position and its rendered block carries no stamp.

### Performance and resources

- **PR1 — Bounded cost.** Line work is recorded during the existing parse and
  stays within `spec:AST-036` FR23's first-party helper budget for one helper, in
  complete and streaming modes. Streaming with the plugin reuses settled blocks
  exactly as streaming without it.

## Accessibility contract

- **AR1 — Data attributes only.** The stamps add no role, name, focus target, or
  text, and do not change reading order.

## Design relationships

The module adds no anatomy, styling, or theme target.

## Parent and system relationships

- `component:Markdown` owns parsing, rendering, `components` seams, and fallback.
- `spec:AST-036` owns the plugin protocol, canonical `position`, and first-party
  plugin rules; DEC-11 permits the internal seam this module uses because this
  record owns the result and the empty pipeline is unchanged.

## Verification map

| Contract    | Verification                                        | Representative states                                                                                                | Mutation or failure expectation                                                                                        |
| ----------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| FR1–FR3     | `sourceLines.test.tsx` DOM and AST fixtures         | every stamped block kind; nested list and quote blocks; lazy continuation; CRLF; frontmatter; inline emphasis; table | A missing, shifted, or inline stamp fails.                                                                             |
| FR4–FR5     | `sourceLines.test.tsx` renderer fixtures            | each `components` block renderer; a plugin block renderer; a claimed semantic fence                                  | A renderer without `sourceLines`, a Markdown-added wrapper, or a node without lines fails.                             |
| FR6         | `sourceLines.test.tsx` every-character streaming    | top-level, nested, and fenced blocks split at each character                                                         | A streamed line differing from the full parse, or a remounted settled block, fails.                                    |
| FR7–FR8     | `sourceLines.test.tsx` and existing Markdown suites | plugin omitted, empty list, plugin with heading links and soft breaks                                                | Any line, attribute, or prop without the plugin, a changed default DOM, or a second parse pass with the plugin, fails. |
| Performance | Markdown performance paired empty/plugin runs       | complete and streaming modes                                                                                         | Exceeding the one-helper budget or losing settled-block reuse blocks acceptance.                                       |

## Decision log

### DEC-1 — Source lines ship as one fixed plugin value

**Reference:** `module:Markdown/sourceLines/DEC-1`
**Decider:** `cixzhang`, `2026-10-09`

A host feature that needs source lines installs a plugin, as every other
Markdown feature does, and the plugin has one meaning with nothing to
configure. Markdown stamps the blocks it renders and hands the lines to the
renderers that replace its blocks, because those are the only elements it owns;
a host or plugin renderer places them on its own element. Lines rather than
offsets reach the DOM because nested blocks have no contiguous range.

Rejected: a boolean prop on Markdown; giving every renderer positions on the default path, which costs every caller; a plugin DOM hook, which `spec:AST-036` excludes.

## Open questions

None.

## Content boundary

This record does not duplicate consumer signatures or examples, parent parsing or
rendering mechanics, host features built on the stamps, or current audit results.
It links to their canonical owners.
