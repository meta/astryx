---
schema_version: 3
template_version: 7
kind: component
id: component:ChatTokenizedText
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
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

| Area                    | Contract                                                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `ChatTokenizedText` with required string `children`, optional `tokens` (the `ChatComposerToken` shapes), `ref`, `xstyle`, `className`, `style`, and root span props; target `chat-tokenized-text`. |
| Behavior                | Unmatched text is preserved. Non-empty token values match literally from left to right. Structured tokens delegate to Badge and custom tokens to callers.                                          |
| End-user impact         | Readers see mentions and other tokens in a sent message as the same chips they saw in the composer, in place, with the rest of the text unchanged.                                                 |
| Builder impact          | None.                                                                                                                                                                                              |
| Compatibility/readiness | Records shipped behavior; no public change. Evidence still pending for the claims listed as read from source.                                                                                      |
| Review checks           | Reject zero-width matching, lost unmatched text, execution of custom renderers without a match, dropped root inputs, or claims about caller-owned content.                                         |
| Governing rules         | `architecture:public-component-api/INV1, INV5–INV6, INV8–INV9`; `architecture:component-test-sufficiency/INV1–INV7`; ECMAScript RegExp progress semantics.                                         |

This table is a review projection; the body below is authoritative.

## Intent

ChatTokenizedText projects serialized token values embedded in a plain chat message
into inline structured Badge content or caller-rendered content while preserving the
surrounding text.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable; the component owns no state
- Migration decision: none

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

## Public concepts

| Concept      | Closed values or states                         | Meaning                                                                   | Availability by variant/orientation/state | Default  | Owner                               | Stability | Invalid-value behavior               |
| ------------ | ----------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- | -------- | ----------------------------------- | --------- | ------------------------------------ |
| Message text | any string                                      | Plain text whose literal token values may be projected inline.            | Every render                              | required | `component:ChatTokenizedText`       | Stable    | Empty text renders an empty span.    |
| Token set    | omitted; empty; non-empty                       | Candidate serialized values and their structured or custom presentations. | Every render                              | omitted  | caller and component                | Stable    | Empty token values are ignored.      |
| Token form   | structured Badge config; custom render function | Selects delegated Badge content or caller-rendered content.               | Matching non-empty values                 | none     | caller and delegated component      | Stable    | Type-invalid forms are rejected.     |
| Root surface | ref; supported DOM/data/ARIA/class/style/xstyle | Extends the inline root without replacing its owned target.               | Every render                              | omitted  | `architecture:public-component-api` | Stable    | Unsupported inputs stay unsupported. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                    | Basis                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| FR1 | The component MUST preserve unmatched text exactly and replace each matched non-empty serialized value at its original reading-order position. Where values overlap at a position, the token listed first in `tokens` matches; where two tokens share a value, the later definition renders. | Current source, tests, and docs                     |
| FR2 | Empty token values MUST be ignored so the renderer always makes progress and never enters a zero-width global-match loop.                                                                                                                                                                    | Current source and tests                            |
| FR3 | Structured matches MUST delegate label, variant, and icon rendering to Badge; custom matches MUST invoke the caller renderer only for an actual match.                                                                                                                                       | Current source, tests, and docs                     |
| FR4 | Supported ref, DOM/data/ARIA, className, style, and xstyle inputs MUST reach or compose on the root span while the `chat-tokenized-text` target remains intact.                                                                                                                              | `architecture:public-component-api/INV5–INV6, INV8` |
| FR5 | The component MUST remain render-only, with no state, Effect, listener, observer, timer, or owned asynchronous resource.                                                                                                                                                                     | Current source                                      |

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

No component-local design decision is recorded.

### Theme ownership

The Chat family document owns the shared anatomy and target inventory inherited by
this subcomponent. The existing `chat-tokenized-text` target remains on the inline
root. Structured token paint delegates to Badge, while custom rendered token content
remains caller owned. No anatomy-theming map is recorded yet; the block is
optional during migration, so the map is deferred.

## Family and system relationships

- `component:Badge` owns structured token paint, variants, iconography, and label semantics.
- `component:ChatComposerInput` owns token insertion, serialization, deletion, and composer selection behavior.
- `architecture:public-component-api` owns released exports, BaseProps reachability, styling composition, and refs.
- `architecture:component-theming-surface` owns the target/anatomy mapping.
- `architecture:component-test-sufficiency` owns bounded, mutation-sensitive evidence.
- `spec:AST-029` owns the audit evidence inventory this record's verification
  map follows.

## Verification map

| Contract     | Verification                                                                                                                             | Representative states                      | Mutation or failure expectation                                  | Audit section                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------ |
| FR1–FR3, PR1 | `ChatTokenizedText.test.tsx` plain, single, multiple, repeated, special-character, surrounding-text, empty-value, and custom-match tests | plain, structured, custom, repeated, empty | Lost text, zero-width nontermination, or the wrong branch fails. | `audit:ChatTokenizedText/behavior`   |
| FR4          | `ChatTokenizedText.test.tsx` ref and rest-prop tests                                                                                     | plain and tokenized roots                  | A dropped ref or prop fails.                                     | `audit:ChatTokenizedText/public-api` |
| RTL relation | `apps/storybook/rtl-audit/verified-not-applicable.json`                                                                                  | all stories                                | —                                                                | `audit:ChatTokenizedText/i18n-rtl`   |

Read from source, with no focused test yet:

- FR1: the first-listed token winning an overlap, and the later definition
  rendering for a shared value.
- FR3: `variant` and `icon` reaching the Badge.
- FR4: `className`, `style`, and `xstyle` composition, and the target.
- FR5, AR3: no state, Effect, or interaction of the component's own.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer examples, Badge policy, token grammar, or composer editing behavior.
