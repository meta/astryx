---
schema_version: 3
template_version: 7
kind: component
id: component:ChatComposerTokenElement
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, theming, testing]
verified_by:
  [
    packages/core/src/Chat/ChatComposerTokenElement.test.tsx,
    apps/storybook/stories/ChatComposerTokenElement.stories.tsx,
    apps/storybook/rtl-audit/verified-not-applicable.json,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-test-sufficiency,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs: [spec:AST-002, spec:AST-029]
---

# ChatComposerTokenElement component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `ChatComposerTokenElement` with a required `token`: structured, which is `value` plus Badge props, of which only `label`, `variant`, and `icon` render and the rest are accepted and ignored; or custom `{value, render}`, `ref`, `xstyle`, `className`, `style`, and neutral span props. |
| Behavior                | A structured token renders Badge content; a custom token renders caller content. Both retain the serialized value marker and stay non-editable when placed inside a contenteditable composer.                                                                                             |
| End-user impact         | Token labels and caller content remain visible without becoming editable text.                                                                                                                                                                                                            |
| Builder impact          | None.                                                                                                                                                                                                                                                                                     |
| Compatibility/readiness | Records shipped behavior; no public change. Evidence still pending for AR1 and parts of FR1, FR2, and FR4 (read from source; see the verification map).                                                                                                                                   |
| Review checks           | Reject a token wrapper that loses its serialized value, becomes editable, drops accepted span props, or changes the structured/custom rendering split.                                                                                                                                    |
| Governing rules         | `architecture:public-component-api/INV1, INV5–INV6, INV8–INV9, INV12`; `architecture:component-test-sufficiency/INV1–INV8, INV10–INV11`; `spec:AST-029/FR3–FR5, FR7`.                                                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

ChatComposerTokenElement renders one already-defined `ChatComposerToken` outside the
editor insertion machinery. It supplies the same serialization marker used by
ChatComposerInput while leaving structured Badge presentation or custom content to
their existing owners.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The span carrying `data-astryx-token` and the token's serialized value.
- Keeping that wrapper non-editable when composed inside a contenteditable region.
- Choosing the existing structured Badge or custom-render branch.
- Forwarding the wrapper ref and accepted neutral span props.

**Does not own / non-goals**

- Token value grammar or product semantics.
- Badge colors, iconography, or sizing.
- Accessibility semantics and interaction behavior inside caller custom content.
- Token insertion, deletion, expansion, or composer selection management.

## Public concepts

| Concept          | Closed values or states                          | Meaning                                                               | Default        | Owner                                | Stability |
| ---------------- | ------------------------------------------------ | --------------------------------------------------------------------- | -------------- | ------------------------------------ | --------- |
| token form       | structured Badge config; custom render function  | Selects caller content without changing serialization.                | none; required | `component:ChatComposerTokenElement` | stable    |
| serialized value | non-empty or empty string supplied by caller     | Value stored in `data-astryx-token-value` for composer serialization. | none; required | caller value through this component  | stable    |
| wrapper surface  | ref; DOM/data/ARIA props; className/style/xstyle | Extends the serialization span without replacing owned markers.       | omitted        | `architecture:public-component-api`  | stable    |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                  | Basis                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| FR1 | The root MUST expose `data-astryx-token` and the exact supplied `token.value`, and MUST remain `contentEditable={false}`.                                                  | Current source, docs, and tests                     |
| FR2 | Structured tokens MUST delegate label, variant, and icon rendering to Badge without changing the token value.                                                              | shipped implementation and public token type        |
| FR3 | Custom tokens MUST render the caller function result without adding component-owned semantics or interaction.                                                              | shipped implementation and public token type        |
| FR4 | Accepted ref, DOM/data/ARIA, className, style, and xstyle inputs MUST reach and compose on the root span while component-owned serialization attributes retain precedence. | `architecture:public-component-api/INV5–INV6, INV8` |

### Allowed variation

- Structured Badge labels, variants, and icons remain caller supplied.
- Custom rendered content and its semantics remain caller owned.
- The wrapper may be used inside or outside a contenteditable surface.

### Representative states

| State            | Required invariant                                                        | Allowed variation               |
| ---------------- | ------------------------------------------------------------------------- | ------------------------------- |
| structured token | Visible Badge content and exact serialized value.                         | Badge label, variant, and icon. |
| custom token     | Caller output and exact serialized value.                                 | Any caller-owned React node.    |
| extended wrapper | Neutral DOM props and ref reach the span without replacing owned markers. | Supported BaseProps values.     |

## Accessibility contract

- **AR1 — No owned semantics.** The wrapper owns no interactive role or
  accessible name beyond accepted caller props.
- **AR2 — Visible content.** Structured Badge text remains visible content;
  custom content semantics remain caller owned.
- **AR3 — Atomic token.** `contentEditable={false}` keeps the token atomically
  non-editable when nested in an editor.

## Design relationships

| Anatomy or state   | Design requirement        | Representation authority | Hierarchy role | Component contract |
| ------------------ | ------------------------- | ------------------------ | -------------- | ------------------ |
| token wrapper      | Inline alignment only     | Current source           | supporting     | FR1, FR4           |
| structured content | Badge presentation        | `component:Badge`        | supporting     | FR2                |
| custom content     | caller-owned presentation | caller                   | supporting     | FR3                |

The wrapper does not paint a component-owned visual surface or introduce a public theme
target. Badge theming remains owned by Badge, and custom content remains caller owned.

## Family and system relationships

- `component:ChatComposerInput` owns insertion, serialization traversal, deletion, and selection behavior.
- `architecture:public-component-api` owns the public props type, ref, and BaseProps composition.
- `architecture:component-test-sufficiency` owns direct evidence for the established public serialization seam.
- `spec:AST-029` owns the audit evidence inventory this record's verification map follows.

## Verification map

| Contract         | Verification                                                  | Representative states                        | Mutation or failure expectation                                                                 | Audit section                             |
| ---------------- | ------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| FR1–FR3, AR2–AR3 | `ChatComposerTokenElement.test.tsx`; direct Storybook stories | structured and custom tokens                 | A marker/value disappears, the wrapper becomes editable, or the wrong rendering branch appears. | `audit:ChatComposerTokenElement/behavior` |
| FR4              | focused ref and DOM-passthrough test; public typecheck        | ref, ARIA/data props, styling seams          | An accepted input is dropped or an owned serialization marker is replaced.                      | `audit:ChatComposerTokenElement/api`      |
| rendered states  | direct Storybook stories                                      | Badge and custom content in supported themes | An unreachable story fails the story checks.                                                    | `audit:ChatComposerTokenElement/rendered` |

Read from source, with no focused test yet:

- AR1: the wrapper adding no role or accessible name of its own.
- FR1: `contentEditable` staying `false` when a caller passes it.
- FR2: `variant` and `icon` reaching the Badge.
- FR4: `className`, `style`, and `xstyle` composing on the span.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer examples, current audit scores, Badge policy, or
ChatComposerInput selection mechanics.
