---
schema_version: 3
template_version: 7
kind: component
id: component:SyntaxTheme
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, behavior, theming]
verified_by:
  [
    packages/core/src/theme/syntax/useSyntaxTheme.diff.test.tsx,
    packages/core/src/theme/syntax/defineSyntaxTheme.diff.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture: [architecture:theme-authoring-contract]
contributing: []
system_specs: []
---

# SyntaxTheme component contract

## Contract at a glance

| Area                    | Contract                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `SyntaxTheme` with a required `theme` (a syntax preset or a `defineSyntaxTheme()` result) and `children`.                      |
| Behavior                | Applies one syntax highlighting theme to the code components inside it through CSS variables on a wrapper and through context. |
| End-user impact         | Code blocks inside share one set of syntax colors.                                                                             |
| Builder impact          | None.                                                                                                                          |
| Compatibility/readiness | Records shipped behavior; no public change.                                                                                    |
| Review checks           | Reject a lost syntax variable, a wrapper without the theme name, or a context that disagrees with the variables.               |
| Governing rules         | `architecture:theme-authoring-contract`.                                                                                       |

This table is a review projection; the body below is authoritative.

## Intent

SyntaxTheme applies one syntax highlighting theme to the code components in
its subtree. How syntax themes are authored is owned by
`architecture:theme-authoring-contract`; this record owns what the component
renders. Consumer usage lives in `SyntaxTheme.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: `theme` is caller-owned
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The wrapper, its syntax variables, and its theme-name attribute (FR1).
- Providing the syntax theme to descendants (FR2).

**Does not own / non-goals**

- Authoring syntax themes and their presets — owned by
  `architecture:theme-authoring-contract`.
- How a code component paints tokens with these variables — owned by that
  component.

## Public concepts

No component-local concept beyond the consumer props.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                             | Basis                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | SyntaxTheme renders one block `div` wrapper carrying `data-astryx-syntax-theme` with the theme's name and, as inline custom properties, every syntax token the theme sets; an unset diff slot is left to its default. | Current source and tests |
| FR2 | Descendants read the syntax theme through context, so the syntax theme hook resolves the same tokens, with unset diff slots derived from the page theme.                                                              | Current source and tests |

### Allowed variation

- **AV1 — Theme.** Any preset or defined syntax theme.

### Representative states

| State           | Required invariant                               | Allowed variation |
| --------------- | ------------------------------------------------ | ----------------- |
| Preset theme    | Wrapper carries the preset's variables and name. | Preset.           |
| Unset diff slot | No variable written; the hook derives it.        | Theme.            |

### Transformation and precedence order

- **ORD1 — Nearest provider.** The nearest SyntaxTheme supplies the theme.

### Performance and resources

- **PR1 — Memoized values.** The wrapper style and context value recompute only
  when `theme` changes.

## Accessibility contract

- **AR1 — No semantics.** The wrapper adds no role, name, or focus target.

## Design relationships

| Anatomy or state | Design requirement                           | Representation authority | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Wrapper          | Carries syntax variables and the theme name. | Current source           | Supporting     | FR1                |

SyntaxTheme renders no themable part of its own, so no anatomy-theming map
applies.

## Family and system relationships

- `architecture:theme-authoring-contract` owns syntax theme construction and
  presets.

## Verification map

| Contract | Verification                                                                                                     | Representative states    | Mutation or failure expectation                                    | Audit section                |
| -------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------ | ---------------------------- |
| FR1      | `defineSyntaxTheme.diff.test.ts` "skips unset diff slots in the CSS and style output of a hand-built definition" | set and unset diff slots | A style value written for an unset slot, or a set one lost, fails. | `audit:SyntaxTheme/behavior` |
| FR2      | `useSyntaxTheme.diff.test.tsx` "resolves unset marker slots to the theme's own punctuation colour"               | unset marker slots       | A wrong derived slot fails.                                        | `audit:SyntaxTheme/behavior` |

Read from source, with no focused test yet:

- FR1: the block wrapper, its `data-astryx-syntax-theme` attribute, and the
  wrapper applying the theme's style values.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables or examples, theme
authoring, token definitions, or compiler output. It links to their owners.
