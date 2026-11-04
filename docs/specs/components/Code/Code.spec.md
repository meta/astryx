---
schema_version: 3
template_version: 7
kind: component
id: component:Code
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility, visual]
verified_by:
  [
    .github/visual-baseline/manifest.json,
    packages/core/src/Code/Code.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    .github/scripts/story-play-guard.js,
    apps/storybook/stories/Code.stories.tsx,
    apps/storybook/rtl-audit/verified-not-applicable.json,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:component-test-sufficiency,
  ]
contributing: []
system_specs: [spec:AST-009]
---

# Code component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Code` is exported from `@astryxdesign/core/Code`; it requires `children`, defaults `color` to `primary`, optionally accepts `secondary` or `inherit`, and accepts `size="inherit"`.                                                                    |
| Behavior                | Code renders one semantic `<code>` element, uses the code type scale by default, and may inherit surrounding color or typography through explicit props.                                                                                                |
| End-user impact         | Readers receive recognizable inline code that wraps instead of forcing its prose container wider.                                                                                                                                                       |
| Builder impact          | None; the record describes shipped behavior. Short inline references use Code; standalone or multi-line snippets use CodeBlock.                                                                                                                         |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes.                                                                                                                                                                              |
| Review checks           | Reject a non-`code` root, dropped content or root props, a ref that misses the root, a visual prop not reflected on the `code` target, undocumented released props/defaults, or a change that turns the inline component into a block-code replacement. |
| Governing rules         | `architecture:public-component-api/INV1,INV5,INV6,INV8–INV9`; `architecture:component-theming-surface/INV3–INV7`; `architecture:component-test-sufficiency/INV1–INV7,INV10–INV11`.                                                                      |

This table is a review projection; the body below is authoritative.

## Intent

Present short technical references inside prose with native code semantics and a compact, themeable inline treatment.

## Compatibility and migration

- Released default preserved: yes
- Compatibility class: records shipped behavior; no runtime, type, default, style, target, or export change
- Controlled/uncontrolled behavior: not applicable; Code owns no state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The semantic inline-code root, code typography and wrapping, primary/secondary/inherited text color, optional inherited size, supported root props and ref, and the `code` theme target.

**Does not own / non-goals**

- Syntax highlighting, line numbers, copy behavior, titles, fenced or multi-line presentation — owned by `component:CodeBlock`.
- The meaning, localization, or bidirectional ordering of caller-supplied code content — owned by the product callsite and platform text engine.
- An interactive action or navigation contract — builders compose the appropriate Button or Link outside Code.

## Public concepts

| Concept      | Closed values or states           | Meaning                                                                         | Availability | Default    | Owner            | Stability | Invalid-value behavior      |
| ------------ | --------------------------------- | ------------------------------------------------------------------------------- | ------------ | ---------- | ---------------- | --------- | --------------------------- |
| color        | `primary`, `secondary`, `inherit` | Selects the inline code text color source.                                      | Every render | `primary`  | `component:Code` | stable    | rejected by the public type |
| size         | code scale, inherited             | Uses the code type scale when omitted or surrounding typography when inherited. | Every render | code scale | `component:Code` | stable    | rejected by the public type |
| code content | caller-supplied React content     | Supplies the content inside the semantic code element.                          | Every render | required   | product callsite | stable    | ordinary React rendering    |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                      | Basis                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| FR1 | Code renders one semantic `<code>` root containing the caller content.                                                                                                                                                                                         | Shipped source, tests, docs, and HTML semantics                                 |
| FR2 | The root uses the code font family and, when `size` is omitted, `--text-code-size` with the surrounding line height; `size="inherit"` also inherits the surrounding font size. `color` selects primary text (default), secondary text, or the inherited color. | Shipped public types, source, tests, and stories                                |
| FR3 | The root paints `--color-background-muted` with `--radius-inner` corners and logical `--spacing-1` inline and `--spacing-0` block padding, and long inline content breaks to wrap rather than widening its prose container.                                    | Shipped source and representative prose stories                                 |
| FR4 | Supported DOM props, `className`, `style`, and `xstyle` compose on the root, and the public ref reaches that root. The `code` target and `data-color` reflection apply after caller DOM props; `xstyle`, `className`, and `style` compose as ORD1 orders them. | `architecture:public-component-api/INV5,INV6,INV8`; shipped source and tests    |
| FR5 | The painted root carries the public `code` target and reflects the `color` visual axis. No internal target or separate state target is part of the shipped surface.                                                                                            | `architecture:component-theming-surface/INV3–INV7`; source and target inventory |

### Allowed variation

- **AV1 — Theme paint.** The `code` target may vary supported typography, color, background, padding, radius, and other accepted paint without changing semantic content or inline ownership.
- **AV2 — Caller content.** Code content may contain any React content accepted by the released `children` type; its meaning remains caller-owned.
- **AV3 — Surrounding typography.** Builders may explicitly inherit surrounding color or size; omission preserves the component defaults.

### Representative states

| State               | Required invariant                                                 | Allowed variation                          |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| default             | Semantic code root, primary color, code type-scale size.           | Caller content and theme paint.            |
| secondary color     | Same root and layout with the secondary text-color source.         | Caller content and theme paint.            |
| inherited color     | Same root and layout with surrounding text color.                  | Surrounding color and caller content.      |
| inherited size      | Same root and paint with surrounding font size and line height.    | Surrounding typography and caller content. |
| long inline content | Content wraps without component-owned physical-direction geometry. | Break opportunities in caller content.     |

### Transformation and precedence order

- **ORD1 — Root props.** Supported caller DOM props → component target and visual-axis reflection → base/color/size/xstyle classes → consumer class and inline style composition.
- **ORD2 — Typography.** Omitted size → code type-scale size; explicit `inherit` → surrounding font size and line height.

### Performance and resources

- **PR1 — Pure render.** Code owns no state, Effect, listener, observer, timer, external resource, or asynchronous work.

## Accessibility contract

- **AR1 — Native semantics.** The root remains a semantic `<code>` element and adds no interactive role, focus target, or component-authored accessible name.
- **AR2 — Caller content.** The caller-supplied content remains the accessible content; Code does not translate, hide, or duplicate it.

## Design relationships

| Anatomy or state | Design requirement                                                                           | Representation authority        | Hierarchy role           | Component contract |
| ---------------- | -------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------ | ------------------ |
| Container        | Distinguishes short technical text through code typography and compact background treatment. | observed shipped representation | inline technical content | FR1–FR5, AR1–AR2   |

No current design record prescribes exact Code pixels; exact tuning stays in code and visual evidence.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Container": {"target": "code"}
}
```

## Family and system relationships

- `architecture:public-component-api` owns export reachability, accepted root props, styling composition, ref reachability, released defaults, and consumer documentation.
- `architecture:component-theming-surface` owns target qualification, target placement, visual-axis reflection, and metadata ownership.
- `architecture:component-test-sufficiency` owns the rational evidence set.

## Verification map

| Contract           | Verification                                                                                                 | Representative states                                                  | Mutation or failure expectation                                                                                                                                                                                                                                                         | Audit section           |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| FR1, AR1, AR2      | `Code.test.tsx` render test                                                                                  | Default                                                                | A non-`code` root or missing content fails. Gap: the render test still passes when a wrapper becomes the root, and no test fails if Code adds a role, tab stop, or name, and no accessibility-tree check proves the exposed content (`spec:AST-009` FR3).                               | `audit:Code/a11y`       |
| FR2, ORD2          | `Code.test.tsx` color tests; `Code.stories.tsx` `Colors` and `TextSizes` play checks in the story-play guard | Primary, secondary, inherited color; inherited size at four text sizes | A missing `data-color` reflection, secondary matching primary, inherited color or size not matching the parent, or every inherited size collapsing to one fails. Gap: the code font family and the default `--text-code-size` have no automated check beyond the visual baseline.       | `audit:Code/behavior`   |
| FR3                | `Code.stories.tsx` `LongInlineContent` play check; stable visual baseline `core-code--default`               | Constrained prose with an unbroken identifier; default                 | Code that stops wrapping or widens its container fails the play check; a changed background, radius, or padding comes back changed for review. Gap: no unit test asserts the paint or padding.                                                                                          | `audit:Code/responsive` |
| FR4, ORD1          | `Code.test.tsx` ref and passthrough tests                                                                    | Ref; `aria-label`, `className`, `style`, `xstyle`                      | A dropped ref, or a dropped caller prop, class, inline style, or `xstyle` class, fails. Gap: the ref test still passes when a wrapper receives the ref, and no test asserts that the target and `data-color` override caller DOM props or that caller `xstyle` follows the base styles. | `audit:Code/api`        |
| FR5                | `themingTargets.test.ts`; `Code.test.tsx` color tests                                                        | Every color value                                                      | A missing target or `data-color` reflection fails.                                                                                                                                                                                                                                      | `audit:Code/theming`    |
| RTL not applicable | `@astryx/no-physical-properties` lint rule; `apps/storybook/rtl-audit/verified-not-applicable.json` entry    | Every story                                                            | The lint rule fails a physical left/right property or value in Code's styles. Gap: no browser right-to-left check covers Code; the entry records the decision.                                                                                                                          | `audit:Code/rtl`        |
| PR1                | Source review                                                                                                | Every state                                                            | Gap: no automated check fails if Code adds state, an effect, or a listener.                                                                                                                                                                                                             | `audit:Code/behavior`   |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer examples, current audit scores, implementation steps, CodeBlock behavior, or draft typography policy. It links to their owners.
