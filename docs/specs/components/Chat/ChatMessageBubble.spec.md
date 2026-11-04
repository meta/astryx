---
schema_version: 3
template_version: 7
kind: component
id: component:ChatMessageBubble
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility, testing]
verified_by:
  [
    packages/core/src/Chat/ChatMessageBubble.test.tsx,
    packages/core/src/Chat/__tests__/ChatMessageBubble.a11y.chromium.spec.ts,
    apps/storybook/stories/ChatMessageBubble.stories.tsx,
    apps/storybook/rtl-audit/targets.json,
    packages/core/src/theme/themingTargets.test.ts,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-style-authoring,
    architecture:component-theming-surface,
    architecture:theme-tokens,
    architecture:component-test-sufficiency,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs: [spec:AST-029]
---

# ChatMessageBubble component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | Required `children`; optional `variant`, `name`, `metadata`, `group`, and `width`; root `div` passthrough, styles, and ref.                                                                                                                                |
| Behavior                | The bubble derives sender and density from Chat message context, paints filled or ghost content, groups logical sender-side corners, and keeps renderable scalar name/metadata content inside aligned wrappers.                                            |
| End-user impact         | Conversation content reads as sender-aware bubbles; numeric zero stays aligned with its bubble, and slot values that paint nothing leave no empty gap.                                                                                                     |
| Builder impact          | None.                                                                                                                                                                                                                                                      |
| Compatibility/readiness | Records shipped behavior; no public change. No implementation gap; three owner questions stay open.                                                                                                                                                        |
| Review checks           | Reject a dropped root passthrough/ref, missing target metadata, physical grouped-corner logic, an explicit width that retains the default cap, scalar `0` outside its wrapper, empty scalar wrappers, or a claim that settles the open composite boundary. |
| Governing rules         | `architecture:public-component-api/INV1, INV5, INV6, INV8–INV9`; `architecture:component-theming-surface/INV4, INV6–INV8`; `architecture:component-test-sufficiency/INV1–INV7, INV10–INV11`; WCAG 2.2 SC 1.4.10.                                           |

This table is a review projection; the body below is authoritative.

## Intent

ChatMessageBubble is the optional sender-aware painted content surface inside a
ChatMessage. It gives conversation content a bubble boundary, text inset,
grouped-corner treatment, and aligned name/metadata placement that raw message
content does not have.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable; the component owns no state
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The bubble root's fill, text color, typography, radius, padding, wrapping, and
  width cap.
- Mapping message sender and density context to bubble paint and geometry.
- Grouped corner geometry on the sender side, using logical corners.
- The aligned wrappers around optional `name` and `metadata` content.
- Root DOM passthrough, consumer style composition, and the root ref.

**Does not own / non-goals**

- Message semantics, sender layout, avatar placement, or message-level names and
  metadata — owned by ChatMessage or the shared Chat composition surface.
- Timestamp, delivery status, and footer semantics — owned by
  ChatMessageMetadata.
- The meaning, accessibility, lifetime, or eventual rendered output of
  caller-supplied React nodes.
- List scrolling, transcript semantics, composer behavior, or system notices —
  owned by their Chat components.

## Public concepts

| Concept                      | Closed values or states                                                                                           | Meaning                                                                                  | Availability by variant/orientation/state | Default                | Owner                                    | Stability     | Invalid-value behavior                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------- | ---------------------------------------- | ------------- | -------------------------------------------------------------------------------- |
| `children`                   | any `ReactNode`                                                                                                   | Content rendered inside the bubble root                                                  | always                                    | required               | caller                                   | stable        | n/a — required                                                                   |
| `variant`                    | `filled`, `ghost`                                                                                                 | Selects a filled sender-aware boundary or transparent aligned content                    | always                                    | `filled`               | component                                | stable        | closed union; rejected by types                                                  |
| `name`                       | omitted; any `ReactNode`                                                                                          | Optional content above the bubble in an aligned wrapper                                  | always                                    | omitted                | caller/component wrapper                 | stable        | non-rendering scalars omit; visible scalars including `0` align; see FR7 and OQ1 |
| `metadata`                   | omitted; any `ReactNode`                                                                                          | Optional content below the bubble in an aligned wrapper                                  | always                                    | omitted                | caller/component wrapper                 | stable        | non-rendering scalars omit; visible scalars including `0` align; see FR7 and OQ1 |
| `group`                      | omitted, `first`, `middle`, `last`                                                                                | Tightens sender-side corners for consecutive bubbles                                     | filled, ghost                             | omitted                | component                                | stable        | omitted keeps full radius; other values rejected by types                        |
| `width`                      | omitted; any `SizeValue`                                                                                          | Replaces the default width cap with an explicit width                                    | filled, ghost                             | omitted                | caller                                   | stable        | numbers become CSS pixels; strings pass through                                  |
| message context              | sender `user`, `assistant`, `system`; density `compact`, `balanced`, `spacious`; absent                           | Selects reflected sender/density and corresponding paint and geometry                    | when nested or standalone                 | assistant and balanced | Chat context / this projection           | observational | absent context uses component fallbacks                                          |
| root `div`                   | `BaseProps<HTMLDivElement>` and `ref`                                                                             | Extends and references the element carrying children, paint, target, and bubble geometry | always                                    | none                   | `architecture:public-component-api`      | stable        | component target data and consumer styling compose                               |
| `chat-message-bubble` target | sender, variant, and density reflected as `data-*`; exact guaranteed-property set not separately declared in docs | Public selector for the painting bubble root                                             | always                                    | one target per bubble  | `architecture:component-theming-surface` | stable        | undeclared generic properties remain best effort                                 |

Consumer syntax and prop defaults remain in `ChatMessageBubble.doc.mjs`.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                   | Basis                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| FR1 | The component MUST always render one root `div` for `children`, including when the caller supplies non-rendering child content.                                                                                                             | Current source and tests                                                   |
| FR2 | The root MUST reflect the resolved sender. `user` selects user paint; `assistant`, `system`, and absent context use the non-user paint path; absent context reflects `assistant`.                                                           | Current source and tests                                                   |
| FR3 | The root MUST reflect the resolved density. `compact` uses the compact radius and inset; `balanced` is the fallback; `spacious` uses its wider block and inline inset.                                                                      | Current source and tests                                                   |
| FR4 | `filled` MUST paint sender-aware bubble styles; `ghost` MUST remove the fill and block-axis padding while preserving inline alignment.                                                                                                      | Current source and tests                                                   |
| FR5 | `first`, `middle`, and `last` MUST tighten the logical sender-side end, both, and start corner respectively. User uses inline-end; every non-user sender uses inline-start.                                                                 | Current source and tests                                                   |
| FR6 | Omitted `width` MUST keep `max(80%, 280px)`. An explicit number or string MUST set width and replace the default cap with `none`.                                                                                                           | Current source and tests                                                   |
| FR7 | `name` and `metadata` MUST omit their aligned wrappers for null, undefined, booleans, and the empty string. Visible scalar values, including numeric zero, MUST remain inside their aligned wrappers. Non-scalar React nodes remain opaque. | Current source and tests                                                   |
| FR8 | Root `ref`, neutral DOM/data/ARIA props, class, style, and `xstyle` MUST reach or combine on the painting root without losing the component target or owned styles.                                                                         | `architecture:public-component-api/INV5, INV6, INV8`                       |
| FR9 | Exactly one `chat-message-bubble` target MUST ride the painting root and reflect sender, variant, and density.                                                                                                                              | `architecture:component-theming-surface/INV4, INV6–INV8`; public Chat docs |

The public type also admits arrays, Fragments, elements, one-shot iterables,
lazy content, and promises. FR7 does not traverse, clone,
consume, await, or materialize those values: each remains caller-owned opaque
content. Whether any composite or asynchronous category should be normalized is
OQ1.

### Allowed variation

- **AV1 — Theme tokens.** Resolved colors, radii, spacing, and typography may vary
  by theme while the semantic token roles remain.
- **AV2 — Caller content.** Child, name, and metadata node structure and semantics
  remain caller-owned.
- **AV3 — Absolute geometry.** Token-resolved padding and radius may vary; logical
  sender-side grouping and width precedence do not.

### Representative states

| State                     | Required invariant                                                   | Allowed variation                  |
| ------------------------- | -------------------------------------------------------------------- | ---------------------------------- |
| standalone                | assistant sender and balanced density fallback; one painting target  | caller content                     |
| assistant/system, filled  | non-user paint; inline-start grouped corners                         | token-resolved paint               |
| user, filled              | user paint; inline-end grouped corners                               | token-resolved paint               |
| any sender, ghost         | transparent surface; inline inset retained; block inset removed      | themed text and padding            |
| compact/balanced/spacious | reflected density and corresponding padding/radius path              | resolved token scale               |
| group first/middle/last   | logical sender-side corner sequence in LTR and RTL                   | token-resolved radii               |
| numeric slot `0`          | visible zero remains inside the aligned wrapper                      | none                               |
| non-rendering scalar slot | null, undefined, booleans, and empty string emit no aligned wrapper  | none                               |
| opaque name/metadata      | non-scalar inputs emit wrappers without traversal or materialization | eventual caller-owned React output |
| width omitted/explicit    | default cap retained / explicit width replaces cap                   | valid CSS length                   |
| narrow/long text          | text wraps with no horizontal overflow at 320 CSS px                 | line breaks and resulting height   |

### Transformation and precedence order

- **ORD1 — Context to paint.** Resolve sender/density from the nearest message
  context or local fallback, select paint and geometry, then merge component
  theme props, StyleX output, and consumer styling inputs through the shared
  `mergeProps` contract.
- **ORD2 — Width.** Apply the default maximum width when omitted; when explicit,
  set width and replace that cap before consumer styling composition.
- **ORD3 — Grouping.** Resolve sender side first, then group position, then use
  logical corner properties so CSS direction mirrors the physical edge.

### Performance and resources

- **PR1 — Pure render derivation.** The component owns no state, Effect, event
  listener, observer, timer, or animation frame. Every output derives from props
  and context during render.
- **PR2 — Caller content is not inspected.** The component does not
  traverse, clone, consume, await, or materialize caller-supplied React nodes.
  Whether to preserve that boundary or normalize selected inputs is OQ1.

## Accessibility contract

- **AR1 — Display surface.** ChatMessageBubble adds no widget role, tab stop,
  keyboard behavior, focus management, announcement, or accessible name of its
  own. Semantics belong to the enclosing ChatMessage and caller content.
- **AR2 — Content preservation.** Caller DOM and ARIA passthrough reach the bubble
  root under FR8; component target metadata MUST NOT overwrite neutral caller ARIA.
- **AR3 — Reflow.** At a 320 CSS-px parent width, long content and the documented
  full-width case MUST wrap without horizontal page overflow (WCAG 2.2 SC 1.4.10).
- **AR4 — Color.** Bubble text remains meaningful content and requires WCAG 2.2
  AA text contrast against the final rendered bubble/backdrop in light and dark.
  The component uses semantic token pairs.

## Design relationships

| Anatomy or state | Design requirement                                    | Representation authority | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| bubble content   | sender-aware filled boundary or aligned ghost surface | unsettled                | primary        | FR2–FR4            |
| grouped corners  | visually connect consecutive bubbles on sender side   | unsettled                | supporting     | FR5                |
| name             | align auxiliary content with bubble text inset        | unsettled                | supporting     | FR7                |
| metadata         | align auxiliary content with bubble text inset        | unsettled                | supporting     | FR7                |

No `authority: current` design record owns ChatMessageBubble's local
representation (OQ3). These rows describe shipped appearance; they do not
authorize a redesign.

## Family and system relationships

- The shared Chat consumer docs own composition guidance across message, bubble,
  metadata, list, layout, and composer components.
- `architecture:public-component-api` owns export, passthrough, styling-input,
  and ref behavior.
- `architecture:component-theming-surface` owns the painting target and reflected
  axes. It does not independently require this closed variant axis to become
  extensible; that would need a component-level public API decision.
- `architecture:component-test-sufficiency` owns the risk-based evidence
  inventory.
- `spec:AST-029` owns the audit evidence inventory this record's verification
  map follows.

## Verification map

| Contract | Verification                                                                                                    | Representative states                                 | Mutation or failure expectation                                                     | Audit section                           |
| -------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------- |
| FR1–FR3  | `ChatMessageBubble.test.tsx` children, sender, fallback, and compact density tests                              | standalone; user and assistant; compact               | A missing root, fallback, or reflected axis fails.                                  | `audit:ChatMessageBubble/behavior`      |
| FR4, FR9 | `ChatMessageBubble.test.tsx` variant and ghost tests; `themingTargets.test.ts`                                  | filled; ghost                                         | Dropping reflection, removing the ghost inset entirely, or losing the target fails. | `audit:ChatMessageBubble/theming`       |
| FR5      | `ChatMessageBubble.a11y.chromium.spec.ts` visible-state and RTL grouped-corner tests                            | user and assistant × first, middle, last; LTR and RTL | Physical corner logic or the wrong sender side fails the corner assertions.         | `audit:ChatMessageBubble/rtl`           |
| FR6      | `ChatMessageBubble.test.tsx` width tests                                                                        | omitted; string; number                               | Retaining the cap or changing numeric pixels fails.                                 | `audit:ChatMessageBubble/behavior`      |
| FR7      | `ChatMessageBubble.test.tsx` slot tests; the Chromium visible-state test's numeric alignment                    | zero; true; false; empty string; nullish              | A truthiness check loses zero's alignment or restores an empty wrapper.             | `audit:ChatMessageBubble/behavior`      |
| FR8, AR2 | `ChatMessageBubble.test.tsx` "forwards the ref and neutral DOM props to the bubble root" and `data-testid` test | ref; DOM, data, and ARIA props                        | Dropped forwarding fails.                                                           | `audit:ChatMessageBubble/public-api`    |
| AR3      | `ChatMessageBubble.a11y.chromium.spec.ts` "keeps long content inside a 320px fixture"                           | 320 CSS px                                            | Horizontal overflow fails.                                                          | `audit:ChatMessageBubble/accessibility` |
| AR4      | `ChatMessageBubble.a11y.chromium.spec.ts` visible-state test's contrast assertion                               | light and dark                                        | Bubble text below 4.5:1 fails.                                                      | `audit:ChatMessageBubble/accessibility` |

Read from source, with no focused test yet:

- FR1: rendering one root when `children` is `null`.
- FR2: the `system` sender taking the non-user paint path.
- FR3: the standalone `balanced` fallback, the compact radius, and the
  `spacious` inset.
- FR4: `filled` painting the sender fill; `ghost` removing the fill and
  block-axis padding, and its inline alignment matching each density.
- FR8: `className`, `style`, and `xstyle` composition.
- AR1: no role, tab stop, or name of the component's own.
- PR1–PR2: no state or Effect, and no inspection of caller content.

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — Should ChatMessageBubble keep every non-scalar `ReactNode`
  name/metadata value as caller-owned opaque content, or normalize selected
  arrays, Fragments, one-shot iterables, lazy values, or promises into a stable,
  rerender-safe empty/non-empty contract?** (`human-api`)
- **OQ2 — Should the aligned name and metadata wrappers become independently
  themeable, inherit a current owner, or remain intentionally unreachable?**
  (`human-api`)
- **OQ3 — Which current design owner, if any, should make filled/ghost usage and
  grouped-corner representation durable?**
  (`human-design`)

## Content boundary

This file does not duplicate the consumer prop table/examples, implementation steps, or shared architecture rules. Those remain in
`ChatMessageBubble.doc.mjs` and their canonical owners.
