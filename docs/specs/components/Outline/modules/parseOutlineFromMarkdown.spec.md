---
schema_version: 3
template_version: 1
kind: module
id: module:Outline/parseOutlineFromMarkdown
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-03
owners: [cixzhang]
review_triggers: [public-api, behavior]
verified_by: [packages/core/src/Outline/parseOutlineFromMarkdown.test.ts]
parent_component: component:Outline
references:
  [
    architecture:public-component-api,
    component:Markdown,
    module:Markdown/headingLinks,
    spec:AST-036,
  ]
---

# parseOutlineFromMarkdown module contract

## Intent

`parseOutlineFromMarkdown` and `useOutlineFromMarkdown` derive same-document
heading navigation from the same Markdown parse configuration, ordered immutable
transforms, text projection, and collision allocator used by the rendered document.
This focused module owns that utility behavior without deciding the Outline
component's anatomy or theming.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: additive parser options; calls without plugins preserve
  released labels, levels, IDs, and return types
- Migration decision: `spec:AST-036`

## Ownership boundary

**Owns**

- Deriving ordered `OutlineItem` values from Markdown headings.
- Accepting the same parser-affecting options and ordered plugin list as Markdown.
- Applying the same validated immutable transforms before selecting headings.
- Using the same extension text projection and collision-safe slug allocation as
  Markdown heading rendering.

**Does not own / non-goals**

- Outline component structure, active state, targets, layout, or theming.
- Plugin rendering, block-extension navigation entries, or renderer-derived text.
- A second parser, plugin registry, or independent heading-ID policy.

## Public API and concepts

`parseOutlineFromMarkdown(source, options?)` performs direct derivation.
`useOutlineFromMarkdown(source, options?)` memoizes the same derivation for React
callers. `options.plugins` uses the canonical opaque Markdown plugin entries. The
same ordered transforms run before heading selection; inline extension-node `toText`
projections then contribute to heading labels and IDs. When the same first-party
entry is installed on both surfaces, this module consumes the projection owned by
`module:Markdown/headingLinks`; it does not copy that module's options or behavior.

## Behavioral contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                             | Basis                           | Acceptance and implementation state |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------- |
| FR1 | Both utilities accept the same Markdown parser options and ordered plugin list as the rendered Markdown document.                                                                                                                                                                                                                                                                     | `spec:AST-036` FR13, FR16       | current implementation              |
| FR2 | Both utilities apply the same validated immutable transforms before selecting headings, without allowing renderer output to affect identity.                                                                                                                                                                                                                                          | `spec:AST-036` FR13, FR16       | current implementation              |
| FR3 | Plugin-enabled labels and IDs use the same extension `toText` projection, slugger, and cross-base collision allocator as Markdown, producing unique matching targets.                                                                                                                                                                                                                 | `spec:AST-036` FR16             | current implementation              |
| FR4 | An extension node never creates an Outline entry of its own. Outline selection stays root-only; when `module:Markdown/headingLinks` is installed, this module consumes its separately owned identity projection without restating or modifying that contract. A container never restarts or independently scopes the selected projection. It never emits nested Outline entries here. | `module:Markdown/headingLinks`  | current implementation              |
| FR5 | Omitting plugins and passing an empty list preserve released heading selection, labels, levels, IDs, return type, and memoization behavior.                                                                                                                                                                                                                                           | `spec:AST-036` FR2              | current implementation              |
| FR6 | The hook memoizes against source and every parse-affecting or transform-affecting option so changed configuration cannot return stale headings.                                                                                                                                                                                                                                       | `component:Markdown` FR15–FR16  | current implementation              |
| FR7 | A transform that removes a heading removes its Outline entry, and a transform that inserts a synthetic heading adds one, in both surfaces identically. Source-backed heading depth cannot change, so an entry's level always matches the rendered heading.                                                                                                                            | `spec:AST-036` FR26             | current implementation              |
| FR8 | When a plugin fails, derivation uses the same last valid root the rendered document uses, so labels, levels, and IDs still agree. Failures are reported through the shared diagnostic channel; this module adds no failure mode, fallback, or throw of its own.                                                                                                                       | `spec:AST-036` FR12, FR29       | current implementation              |
| FR9 | Derivation runs on the canonical tree through the shared parse path and requires no DOM, renderer, client boundary, or second parser. Because transforms are idempotent under streaming, an outline derived from a growing source prefix converges rather than oscillates.                                                                                                            | `spec:AST-036` FR32, FR33, FR36 | current implementation              |

### Transformation and precedence order

Markdown parse configuration → ordered immutable transforms → heading nodes →
shared perceivable-text projection → selected heading projection → root-heading
selection → Outline items.

### Performance and resources

- The hook recomputes only when source or parser/transform configuration changes.
- Renderer output does not enter heading identity.
- No DOM, renderer mount, registry, Remark runtime, or optional plugin resource is
  required.

## Accessibility contract

Each derived label is the same perceivable heading text used for Markdown identity,
and each derived ID targets the matching rendered heading. This module adds no
interaction or ARIA behavior; the Outline component owns navigation presentation.

## Design relationships

No visual representation is owned by this parser utility.

## Parent and system relationships

- `component:Markdown` owns aggregate parsing, heading rendering, and the generic
  shared-projection invocation seam.
- `module:Markdown/headingLinks` owns its optional projection; this module consumes
  it while retaining root-only Outline selection.
- `spec:AST-036` owns the canonical plugin protocol and cross-surface parity.
- `component:Outline` owns presentation, anatomy, and theming.

## Verification map

| Contract | Verification                                                                                        | Representative states                                                                                                              | Mutation or failure expectation                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR6  | Outline parser tests, plugin transform parity tests, heading-links module tests, and Core typecheck | omitted/empty/installed plugin lists; selected projection changes; transformed and formatted root headings; root/nested containers | A transform is skipped, a root label/ID diverges from Markdown, nested headings enter Outline, selected projection goes stale, or default output changes. |
| FR7–FR9  | Heading insert/remove parity, failure parity, and streaming derivation                              | headings removed with/without sections; inserted synthetic headings; failing transform; growing source prefix; server derivation   | Outline/document disagreement, divergent fallback, a throw, stale IDs, or streamed oscillation.                                                           |

## Decision log

### DEC-1 — Markdown owns heading identity; Outline projects it

**Reference:** `module:Outline/parseOutlineFromMarkdown/DEC-1`
**Decider:** cixzhang, 2026-09-15

Outline utilities consume Markdown's parse configuration, ordered transforms, text
projection, and collision allocator rather than defining a second heading-identity
system. This keeps labels and link targets aligned without coupling plugin renderer
output to navigation identity.

### DEC-2 — One traversal survives containers and heading edits

**Reference:** `module:Outline/parseOutlineFromMarkdown/DEC-2`
**Decider:** cixzhang, 2026-09-16

Extension containers hold ordinary Markdown but do not select a second identity system. Markdown and this module consume the same projection chosen by the installed plugin list, so Outline never links to a root heading Markdown did not identify. The Outline result remains root-only, and an extension node is never an Outline entry.

Transforms may remove and insert headings, so Outline follows the rendered document rather than source: a dropped root heading disappears, an inserted root heading appears, and immutable source-backed depth keeps levels aligned. Both surfaces run the same pipeline rather than independent rules.

Rejected: a container-only traversal exception; extension nodes as Outline entries; source-only derivation; module-local plugin failure fallback.

## Open questions

None.

## Content boundary

This file does not duplicate plugin protocol details, Markdown parser mechanics,
consumer examples, or the Outline component's anatomy and theming contract.
