---
schema_version: 3
template_version: 7
kind: component
id: component:Blockquote
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    .github/visual-baseline/manifest.json,
    packages/core/src/Blockquote/Blockquote.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/Blockquote.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: [design:bidirectionality]
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-009]
---

# Blockquote component contract

## Contract at a glance

| Area                    | Contract                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A semantic `blockquote` holding `children`, with an optional `cite` attribution.                                                  |
| Behavior                | The quote has an inline-start rule and secondary text; a renderable `cite` follows the content in a bare `cite` element.          |
| End-user impact         | Readers see quoted text set apart; screen-reader users get a native blockquote and no stray landmark from the attribution.        |
| Builder impact          | None; the record describes shipped behavior.                                                                                      |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes.                                                        |
| Review checks           | Reject a physical left rule, a `footer` around the attribution, or a non-`blockquote` root.                                       |
| Governing rules         | `design:bidirectionality/DR3`; `architecture:public-component-api/INV5,INV6,INV8`; `architecture:component-theming-surface/INV2`. |

This table is a review projection; the body below is authoritative.

## Intent

Blockquote sets quoted content apart from surrounding text with native quote
semantics. It owns the rule, inset, and color of the quote and the placement of
its optional attribution.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The `blockquote` root, its rule, inset, color, and zeroed margins.
- The Attribution element and its placement after the quotation.

**Does not own / non-goals**

- The quoted content and attribution text — owned by the caller.
- Quotation marks, if wanted — owned by the caller's content.
- Markdown block quotes — owned by `component:Markdown`.

## Public concepts

| Concept     | Closed values or states | Meaning                                   | Availability by variant/orientation/state | Default | Owner                  | Stability | Invalid-value behavior                                         |
| ----------- | ----------------------- | ----------------------------------------- | ----------------------------------------- | ------- | ---------------------- | --------- | -------------------------------------------------------------- |
| Attribution | present; absent         | Renders the source of the quote after it. | Always                                    | absent  | `component:Blockquote` | Stable    | `false`, `true`, `null`, `undefined`, and `''` render nothing. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                             | Basis                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | The root is a `blockquote` carrying the `blockquote` target, with a solid `--spacing-0-5` rule in `--color-border-emphasized` on its inline-start edge, `--spacing-4` inline-start padding, secondary text color, word breaking for long words, and all margins zero. | Current source and tests |
| FR2 | `children` render first inside the root. A renderable `cite` renders after them in a bare `cite` element — never wrapped in `footer` — displayed as a block with `--spacing-2` top margin, supporting type, and normal font style.                                    | Current source and tests |
| FR3 | In a right-to-left region the rule and its padding sit on the right edge: the root uses logical inline-start border and padding, never physical left ones.                                                                                                            | Current source and docs  |
| FR4 | `ref` reaches the `blockquote`. Supported DOM, ARIA, data, and event props reach it; `xstyle`, `className`, and `style` merge in that order after component styles. Blockquote renders on the server.                                                                 | Current source and tests |

### Allowed variation

- **AV1 — Theme paint.** A theme may restyle `blockquote`, including the rule,
  without changing semantics or attribution placement.

### Representative states

| State            | Required invariant                                    | Allowed variation |
| ---------------- | ----------------------------------------------------- | ----------------- |
| Quote only       | `blockquote` with rule and secondary text; no `cite`. | Content.          |
| With attribution | `cite` follows the content; no `footer` or landmark.  | Attribution.      |
| Right-to-left    | Rule and padding on the right edge.                   | —                 |

### Transformation and precedence order

- **ORD1 — Styling inputs.** Component class → component styles → `xstyle` →
  `className` → `style` → remaining caller props.

### Performance and resources

- **PR1 — Static render.** Blockquote holds no state and uses no hooks.

## Accessibility contract

- **AR1 — Native quote.** The root is a native `blockquote`.
- **AR2 — No stray landmark.** The attribution is a bare `cite`; it is never
  wrapped in a `footer`, which inside a sectioning root would surface as a
  content-information landmark.

## Design relationships

| Anatomy or state | Design requirement                                   | Representation authority | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Rule             | An emphasized line on the inline-start edge.         | Current source and docs  | Supporting     | FR1, FR3           |
| Quotation        | The quoted content in secondary text.                | Current source and docs  | Prominent      | FR1, FR2           |
| Attribution      | The source, in supporting type, below the quotation. | Current source and docs  | Supporting     | FR2, AR2           |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Rule": {"target": "blockquote"},
  "Quotation": {"inherits": "blockquote"},
  "Attribution": {"inherits": "blockquote"}
}
```

The rule is a border of the root, so it shares the root's `blockquote` target.

## Family and system relationships

- `design:bidirectionality` DR3 owns inline-start and inline-end placement;
  FR3 applies it to the rule.
- `architecture:public-component-api` owns ref, passthrough, and styling-input
  rules; FR4 applies them to the root.

## Verification map

| Contract            | Verification                                                            | Representative states               | Mutation or failure expectation                                                                                                                                                                                                                                                                                                      | Audit section               |
| ------------------- | ----------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| FR1, FR4            | `Blockquote.test.tsx` render, class, ref, passthrough, and server tests | Quote only                          | A non-`blockquote` root, a lost target, ref, or caller prop, or a failed server render fails. The stable visual baseline `core-blockquote--default` (neutral, light and dark) returns a changed rule, padding, color, or margin for review. Gap: no unit test asserts those styles, word breaking, or the styling-input merge order. | `audit:Blockquote/behavior` |
| FR2, AR2            | `Blockquote.test.tsx` cite tests                                        | With and without attribution        | A missing `cite` or a landmark wrapper fails. Gap: no test asserts that the attribution follows the content, and its block display, margin, type, and font style have no automated check, and the visual baseline renders no attribution.                                                                                            | `audit:Blockquote/a11y`     |
| FR3                 | `@astryx/no-physical-properties` lint rule; `Blockquote.stories.tsx`    | Right-to-left                       | A physical left border or padding in Blockquote's styles fails lint. Gap: no rendered right-to-left check confirms the rule sits on the right edge.                                                                                                                                                                                  | `audit:Blockquote/i18n-rtl` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                           | Consumer anatomy and current target | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                                                        | `audit:Blockquote/theming`  |
| AR1                 | `Blockquote.test.tsx` render test                                       | Quote only                          | A non-`blockquote` root fails.                                                                                                                                                                                                                                                                                                       | `audit:Blockquote/a11y`     |
| PR1                 | `Blockquote.test.tsx` server-render test                                | Quote only                          | A failed server render fails. Gap: no test fails if Blockquote adds state or hooks.                                                                                                                                                                                                                                                  | `audit:Blockquote/behavior` |
| AR1, AR2            | Accessibility-tree evidence (`spec:AST-009` FR3)                        | Quote with attribution              | Gap: no accessibility-tree check proves the blockquote role or the absence of a landmark; the unit tests query the DOM.                                                                                                                                                                                                              | `audit:Blockquote/a11y`     |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
