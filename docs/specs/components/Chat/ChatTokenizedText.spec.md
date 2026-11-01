---
schema_version: 3
template_version: 6
kind: component
id: component:ChatTokenizedText
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility, testing]
verified_by:
  [
    packages/core/src/Chat/ChatTokenizedText.test.tsx,
    packages/core/src/Chat/__tests__/ChatTokenizedText.a11y.chromium.spec.ts,
    apps/storybook/stories/ChatTokenizedText.stories.tsx,
    apps/storybook/rtl-audit/verified-not-applicable.json,
    packages/core/src/theme/themingTargets.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:component-test-sufficiency,
    architecture:react-component-runtime,
    architecture:theme-tokens,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs: [spec:AST-002, spec:AST-020, spec:AST-029]
---

# ChatTokenizedText component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | The exported component accepts required plain-text children, optional composer token definitions, and supported root span props and ref. No prop, export, or theme target is added or removed. |
| Behavior                | Unmatched text is preserved. Non-empty token values match literally from left to right. Structured tokens delegate to Badge and custom tokens to callers.                                      |
| End-user impact         | Tokenized messages finish rendering when a caller-supplied token definition has an empty serialized value.                                                                                     |
| Builder impact          | Existing token arrays keep working, and empty serialized values are safely ignored instead of creating a non-advancing match.                                                                  |
| Compatibility/readiness | Patch-compatible correctness repair and observational documentation. The pending inline-alignment change remains owned by its separate pull request.                                           |
| Review checks           | Reject zero-width matching, lost unmatched text, execution of custom renderers without a match, dropped root inputs, or claims about caller-owned content.                                     |
| Governing rules         | `architecture:public-component-api/INV1, INV5–INV6, INV8–INV9`; `architecture:component-test-sufficiency/INV1–INV7`; `spec:AST-029/FR3–FR7`; ECMAScript RegExp progress semantics.             |

This table is a review projection. The draft body records verified current or
remediated behavior and creates no new token grammar or visual policy.

## Intent

ChatTokenizedText projects serialized token values embedded in a plain chat message
into inline structured Badge content or caller-rendered content while preserving the
surrounding text.

## Compatibility and migration

- Released default preserved: yes; messages without matching non-empty tokens remain plain text.
- Compatibility class: patch-compatible correctness repair for invalid zero-width matches.
- Controlled/uncontrolled behavior: not applicable; the component owns no state.
- Migration decision: none. No public type, prop, export, default, or theme target changes.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Literal matching of serialized token values against the supplied message text.
- Preserving unmatched text and source order.
- Choosing the existing structured Badge or custom-render branch for each match.
- The root span, its `chat-tokenized-text` target, accepted BaseProps composition, and ref.

**Does not own / non-goals**

- Token value grammar, identity, validation, or product semantics.
- Badge color, iconography, sizing, or accessibility semantics.
- Semantics and interaction inside caller-provided custom token content.
- Composer insertion, serialization, deletion, selection, or token-element alignment.
- The inline-alignment change proposed independently in pull request #6418.

## Public concepts

| Concept      | Closed values or states                         | Meaning                                                                   | Availability by variant/orientation/state | Default  | Owner                               | Stability                 | Invalid-value behavior               |
| ------------ | ----------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- | -------- | ----------------------------------- | ------------------------- | ------------------------------------ |
| Message text | any string                                      | Plain text whose literal token values may be projected inline.            | Every render                              | required | `component:ChatTokenizedText`       | released observed surface | Empty text renders an empty span.    |
| Token set    | omitted; empty; non-empty                       | Candidate serialized values and their structured or custom presentations. | Every render                              | omitted  | caller and component                | released observed surface | Empty token values are ignored.      |
| Token form   | structured Badge config; custom render function | Selects delegated Badge content or caller-rendered content.               | Matching non-empty values                 | none     | caller and delegated component      | released observed surface | Type-invalid forms are rejected.     |
| Root surface | ref; supported DOM/data/ARIA/class/style/xstyle | Extends the inline root without replacing its owned target.               | Every render                              | omitted  | `architecture:public-component-api` | released observed surface | Unsupported inputs stay unsupported. |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                             | Basis                                                                          | Draft review state      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------- |
| FR1 | The component MUST preserve unmatched text exactly and replace each matched non-empty serialized value at its original reading-order position.                  | Released consumer docs and implementation                                      | verified                |
| FR2 | Empty token values MUST be ignored so the renderer always makes progress and never enters a zero-width global-match loop.                                       | Objective ECMAScript RegExp progress semantics and responsive rendering        | remediated and verified |
| FR3 | Structured matches MUST delegate label, variant, and icon rendering to Badge; custom matches MUST invoke the caller renderer only for an actual match.          | Released token type, source, docs, and tests                                   | verified                |
| FR4 | Supported ref, DOM/data/ARIA, className, style, and xstyle inputs MUST reach or compose on the root span while the `chat-tokenized-text` target remains intact. | `architecture:public-component-api/INV5–INV6, INV8`                            | verified                |
| FR5 | The component MUST remain render-only, with no state, Effect, listener, observer, timer, or owned asynchronous resource.                                        | Current source and `architecture:component-test-sufficiency` evidence boundary | verified                |

### Allowed variation

- **AV1 — Caller tokens.** Labels, variants, icons, custom content, and serialized values remain caller supplied.
- **AV2 — Caller styling.** Supported root styling inputs may extend the component without replacing its public target.
- **AV3 — Unmatched input.** Text with no matching non-empty value remains unchanged.

### Representative states

| State                | Required invariant                                                      | Allowed variation                     |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------- |
| Plain text           | Exact text remains visible.                                             | Any string content.                   |
| Structured match     | Matching text is replaced by delegated Badge content.                   | Label, variant, and icon.             |
| Custom match         | Matching text is replaced by caller-rendered content.                   | Any caller-owned React node.          |
| Repeated match       | Every occurrence is replaced in reading order.                          | Number and position of occurrences.   |
| Empty token value    | The value is ignored and rendering terminates with text preserved.      | Presence beside valid tokens.         |
| Narrow / RTL context | Inline content remains readable and follows surrounding text direction. | Theme, direction, and message length. |

### Transformation and precedence order

- **ORD1 — Normalize candidates.** Remove empty serialized values while preserving caller order.
- **ORD2 — Match literally.** Escape values for RegExp syntax and scan the message from left to right.
- **ORD3 — Render.** Preserve unmatched slices and delegate each matched token to Badge or the caller renderer.
- **ORD4 — Compose root.** Apply the component target and styles, then combine accepted consumer styling and root props.

### Performance and resources

- **PR1 — Finite progress.** Every successful match consumes at least one UTF-16 code unit; empty values cannot enter the matcher.
- **PR2 — Render-only projection.** Matching allocates one candidate list, lookup map, and result list per render and owns no persistent resource.

## Accessibility contract

- **AR1 — Reading order.** Unmatched text and token content remain in source reading order inside one inline text wrapper.
- **AR2 — Delegated content.** Structured token semantics remain owned by Badge; custom token semantics remain caller owned.
- **AR3 — Noninteractive root.** The component introduces no role, focus target, keyboard command, pointer action, or live-region behavior.

## Design relationships

| Anatomy or state | Design requirement                           | Representation authority         | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------- | -------------------------------- | -------------- | ------------------ |
| Tokenized text   | Inline root preserves surrounding text flow. | Current source and released docs | supporting     | FR1, FR5           |
| Rendered token   | Delegates paint to Badge or caller content.  | `component:Badge` or caller      | supporting     | FR4, AR2           |

This observational draft does not choose new spacing, alignment, token paint,
proportion, or state representation.

### Theme ownership

The Chat family document owns the shared anatomy and target inventory inherited by
this subcomponent. The existing `chat-tokenized-text` target remains on the inline
root. Structured token paint delegates to Badge, while custom rendered token content
remains caller owned. This observational draft does not redefine the family map.

## Family and system relationships

- `component:Badge` owns structured token paint, variants, iconography, and label semantics.
- `component:ChatComposerInput` owns token insertion, serialization, deletion, and composer selection behavior.
- `architecture:public-component-api` owns released exports, BaseProps reachability, styling composition, and refs.
- `architecture:component-theming-surface` owns the target/anatomy mapping.
- `architecture:component-test-sufficiency` owns bounded, mutation-sensitive evidence.
- `spec:AST-029` owns this observational audit backfill and closed evidence receipt.

## Verification map

| Contract       | Verification                                                   | Representative states                            | Mutation or failure expectation                                                           | Audit section                         |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------- |
| FR1–FR3, PR1   | `ChatTokenizedText.test.tsx`                                   | plain, structured, custom, repeated, empty       | Lost text, zero-width nontermination, or the wrong render branch fails.                   | `audit:ChatTokenizedText/behavior`    |
| FR4            | focused root passthrough/ref checks, theming target guard      | plain and tokenized roots                        | A supported root input or public target is dropped or replaced.                           | `audit:ChatTokenizedText/public-api`  |
| FR5            | source inspection and strict lint                              | every render                                     | Hidden state or an owned external resource triggers runtime review.                       | `audit:ChatTokenizedText/code-health` |
| RTL relation   | source-hashed verified-N/A record                              | all existing stories                             | Component-owned directional behavior invalidates the record.                              | `audit:ChatTokenizedText/i18n-rtl`    |
| Browser matrix | Storybook stories, exact-head visual gate, and scoped a11y     | plain, multiple, mixed, edge, custom, narrow     | Missing text/token content, overflow, visual regression, or an a11y violation fails.      | `audit:ChatTokenizedText/rendered`    |
| Docs / surface | docs, declarations, exports, `check:knowledge`, docs typecheck | public props, Chat subpath, target, draft record | Missing or stale docs, export, target map, or knowledge shape fails validation or review. | `audit:ChatTokenizedText/docs`        |

## Decision log

No component-local product decision is created by this observational draft. The
matching repair follows the component's released promise to replace supplied literal
token values while preserving surrounding text.

## Open questions

None.

## Content boundary

This file does not duplicate consumer examples, audit scores, screenshots, Badge
policy, token grammar, or composer editing behavior.
