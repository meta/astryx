---
schema_version: 3
template_version: 7
kind: component
id: component:ChatSendButton
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, theming, accessibility, testing]
verified_by:
  [
    packages/core/src/Chat/ChatSendButton.test.tsx,
    packages/core/src/Chat/__tests__/ChatSendButton.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/ChatComposer.stories.tsx,
    apps/storybook/stories/ChatSendButtonAudit.stories.tsx,
    apps/storybook/rtl-audit/verified-not-applicable.json,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:icon-resolution-and-component-slots,
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:component-test-sufficiency,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs: [spec:AST-002, spec:AST-020, spec:AST-029, spec:AST-032]
---

# ChatSendButton component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | The exported control selects send or stop presentation from props over ChatComposer context, accepts `sm` or `md`, supports icon overrides, and extends the rendered Button with supported Button DOM, event, styling, and ref inputs.  |
| Behavior                | Send is disabled from explicit or composer readiness, stop remains enabled, state-specific actions run before a composed generic click handler, and current send artwork resolves from an explicit override before the shared fallback. |
| End-user impact         | People receive a translated, state-appropriate send or stop action whose availability follows composer readiness.                                                                                                                       |
| Builder impact          | None.                                                                                                                                                                                                                                   |
| Compatibility/readiness | Records shipped behavior; no public change. One implementation gap, listed under Current-state impact.                                                                                                                                  |
| Review checks           | Reject lost send/stop routing, consumer events that replace the state action, a disabled stop action, unlabelled icon-only output, dropped root inputs, or a lost explicit-first send icon or `arrowUp` fallback.                       |
| Governing rules         | `spec:AST-032` FR2–FR3; `architecture:public-component-api` INV5–INV8; `architecture:interaction-modality`; `architecture:component-test-sufficiency`; `spec:AST-020`; `spec:AST-029`.                                                  |

This table is a review projection; the body below is authoritative.

## Intent

ChatSendButton is the compact action control used by ChatComposer. It translates
composer readiness and streaming state into a shared Button while keeping action,
icon, styling, and ref seams available for standalone composition.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: not applicable; explicit props take
  precedence over context-derived values
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **The send icon has no component-slot stage.** Send artwork resolves from
  `sendIcon`, then the shared `arrowUp`. `spec:AST-032` FR2–FR3 put a
  component-icon slot stage in that resolution; ChatSendButton does not offer
  it yet (FR3).

## Ownership boundary

**Owns**

- Selection of the send or stop state.
- State-specific translated accessible names and Button variants.
- Composer-context fallback for readiness and actions.
- Send and stop icon selection at the component seam.
- Composition of the state action with an accepted generic click handler.
- The `chat-send-button` theme target and circular root treatment.

**Does not own / non-goals**

- ChatComposer value editing, submission lifecycle, streaming lifecycle, or placement.
- Shared Button activation, focus, disabled semantics, hit area, or base styling.
- Shared icon artwork or theme icon registration.
- A public policy for whether `isStopShown` may appear without a stop action.

## Public concepts

Consumer syntax remains in `ChatSendButton.doc.mjs`. This inventory closes the
observable semantic surface without duplicating the prop table.

| Concept      | Closed values or states                                        | Meaning                                                                                | Availability by variant/orientation/state | Default                                                     | Owner                               | Stability | Invalid-value behavior                                                                      |
| ------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- | ----------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| Action state | send; stop                                                     | Selects the name, Button variant, icon role, disabled rule, and state action.          | Every render.                             | Composer `isStopShown`, otherwise send.                     | `component:ChatSendButton`          | Stable    | Values outside the boolean prop type are unsupported.                                       |
| Availability | enabled; disabled                                              | Prevents send activation when content is not ready. Stop intentionally ignores it.     | Disabled applies only to send.            | Explicit `isDisabled`, otherwise inverse composer canSend.  | component and ChatComposer context  | Stable    | Values outside the boolean prop type are unsupported.                                       |
| Action       | state callback; composer fallback; composed generic click      | Runs the state action and then an accepted consumer click handler.                     | Enabled send and stop activation.         | `onSend` or submit current value; `onStop` or context stop. | component, context, and caller      | Stable    | With no state callback or matching context action, only a supplied generic click can run.   |
| Send icon    | explicit content; shared fallback                              | Selects artwork for the send state.                                                    | Send state.                               | `sendIcon`, then shared `arrowUp`.                          | component and caller                | Stable    | Unsupported React content follows the shared Button rendering boundary.                     |
| Stop icon    | explicit content; shared fallback                              | Selects artwork for the stop state.                                                    | Stop state.                               | `stopIcon`, then shared `stop`.                             | component and caller                | Stable    | Unsupported React content follows the shared Button rendering boundary.                     |
| Size         | `sm`; `md`                                                     | Selects the delegated Button size while preserving circular treatment.                 | Both states.                              | `md`.                                                       | `component:ChatSendButton`          | Stable    | Values outside the public union are rejected by TypeScript.                                 |
| Root surface | ref; supported Button DOM/data/ARIA/events; style/class/xstyle | Extends and styles the rendered Button without replacing component-owned action logic. | Every render.                             | Omitted.                                                    | `architecture:public-component-api` | Stable    | Unsupported BaseProps omissions remain unsupported; owned semantics win accidental clashes. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                         | Basis                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| FR1 | The send state MUST render a primary icon-only Button named by the send translation, and it MUST be disabled when explicit or context-derived readiness is false.                                                 | Current implementation, docs, tests, `spec:AST-020`, and shared Button behavior          |
| FR2 | The stop state MUST render a secondary icon-only Button named by the stop translation, remain enabled regardless of send readiness, and invoke explicit or context stop behavior.                                 | Current implementation, docs, and tests                                                  |
| FR3 | Send icon resolution prefers `sendIcon` and otherwise resolves the shared `arrowUp`. Implementation gap: the component-icon slot stage `spec:AST-032` FR2–FR3 require is not offered (Current-state impact).      | Current implementation, docs, tests, and current owner requirement in `spec:AST-032`     |
| FR4 | Stop icon resolution prefers `stopIcon` and otherwise resolves the shared `stop` icon.                                                                                                                            | Current implementation, docs, and tests                                                  |
| FR5 | Explicit state, disabled, callback, icon, and size props MUST win over their context or component fallback. A generic accepted click handler MUST compose after the selected state action rather than replace it. | Current source and tests; `architecture:public-component-api` INV5–INV7                  |
| FR6 | Supported Button DOM, data, ARIA, className, style, xstyle, and ref inputs MUST reach or compose on the rendered Button while component-owned label, state, and activation behavior remain intact.                | Current implementation plus `architecture:public-component-api/INV5-INV8`                |
| FR7 | The component MUST paint through the shared Button on the co-located `chat-send-button` target and preserve its circular component treatment.                                                                     | Current implementation, Chat consumer docs, and `architecture:component-theming-surface` |

### Allowed variation

- **AV1 — Context or standalone composition.** A builder may rely on ChatComposer
  context or provide all state, action, and disabled values explicitly.
- **AV2 — Artwork.** Explicit send and stop content and shared fallback artwork may
  vary within the icon resolution FR3 and FR4 state.
- **AV3 — Consumer styling.** Supported styling inputs may extend the Button while
  component-owned state and activation behavior remain.

### Representative states

| State                  | Required invariant                                                                  | Allowed variation                               |
| ---------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| Send, disabled         | Primary translated send action is unavailable and does not run callbacks.           | Icon source, size, theme, and consumer styling. |
| Send, enabled          | Primary translated send action runs explicit or context submission.                 | Icon source, size, theme, and consumer styling. |
| Stop                   | Secondary translated stop action remains enabled and runs explicit or context stop. | Icon source, size, theme, and consumer styling. |
| Explicit override      | Explicit state, callback, icon, disabled value, and size win their fallback seams.  | Context may still supply unspecified values.    |
| Composed generic click | State action and accepted generic click both run without one replacing the other.   | Either handler may be absent.                   |

### Transformation and precedence order

- **ORD1 — Resolve state.** Explicit `isStopShown` wins, then composer context,
  then the send state.
- **ORD2 — Resolve action.** Explicit state callback wins its composer fallback.
  The selected state action runs before the accepted generic click handler because
  this component does not promise consumer cancellation of its state action.
- **ORD3 — Resolve availability.** Stop remains enabled. Send uses explicit
  `isDisabled`, then inverse composer readiness, then disabled outside context.
- **ORD4 — Resolve artwork.** In send, explicit `sendIcon` wins, then shared
  `arrowUp`; in stop, explicit `stopIcon` wins, then shared `stop`. The
  component-icon slot stage `spec:AST-032` FR2 requires is not offered yet
  (FR3).
- **ORD5 — Compose root.** Apply component-owned Button semantics and the
  `chat-send-button` target while preserving supported consumer root inputs.

### Performance and resources

- **PR1 — Render-only projection.** The component adds no Effect, observer,
  listener, timer, state mirror, or owned async lifecycle.

## Accessibility contract

- **AR1 — Native action semantics.** The delegated Button MUST own native button
  activation, keyboard behavior, focus indication, and disabled semantics.
- **AR2 — State-appropriate name.** The icon-only control MUST expose the current
  translated send or stop label independently of icon artwork.
- **AR3 — Disabled send behavior.** A disabled send action MUST not invoke either
  the state action or a consumer click handler.
- **AR4 — Modality parity.** Pointer and keyboard activation MUST traverse the same
  state-action and composed-event path.

## Design relationships

| Anatomy or state | Design requirement                                                | Representation authority                                     | Hierarchy role           | Component contract |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------ | ------------------ |
| Action button    | Circular compact Button carrying the current send or stop action. | Current source and consumer docs; exact tuning stays in code | Primary/secondary action | FR1, FR2, FR7      |
| Send artwork     | Upward send glyph unless explicit content wins (FR3's gap).       | Current source and docs; `spec:AST-032` FR2–FR3              | Action cue               | FR3                |
| Stop artwork     | Shared stop glyph unless explicit content wins.                   | Current source and consumer docs                             | Action cue               | FR4                |

This record selects no new dimensions, variants, icon artwork, color roles, or
visual prominence. No anatomy-theming map is recorded yet; the block is
optional during migration, so the map is deferred.

The Chat family consumer doc catalogs `chat-send-button`. Button owns the
underlying painting and interaction-state styling; the component target is
co-located on that painting element.

## Family and system relationships

- ChatComposer owns value, readiness, submission, stop lifecycle, and placement.
- Button owns shared activation, focus, disabled semantics, hit area, and paint.
- `architecture:public-component-api` owns BaseProps reachability, style/ref
  composition, and deliberate event composition.
- `architecture:icon-resolution-and-component-slots` owns the shared slot model;
  `spec:AST-032` FR2–FR3 put a component-slot stage in send resolution, which is
  not shipped (Current-state impact).
- `architecture:component-theming-surface` owns the qualification and placement
  of the co-located `chat-send-button` target.
- `architecture:interaction-modality` and `spec:AST-020` own pointer, keyboard,
  focus, and accessibility parity inherited through Button.
- `architecture:component-test-sufficiency` owns public-seam regression coverage.
- `spec:AST-029` owns the audit evidence inventory this record's verification
  map follows.

## Verification map

| Contract                  | Verification                                                                                                         | Representative states                                                                                                    | Mutation or failure expectation                                                                                                                  | Audit section                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| FR1, FR2, AR1-AR4         | `ChatSendButton.test.tsx`, `ChatSendButton.a11y.chromium.spec.ts`, and `ChatComposer.test.tsx`                       | Enabled/disabled send, stop with and without handler, context stop, keyboard/pointer, light/dark interaction states      | Label, disabled, native activation, state routing, or interaction paint drift fails focused or exact-head browser evidence.                      | `audit:ChatSendButton/accessibility` |
| FR3                       | `ChatSendButton.test.tsx`                                                                                            | Explicit and shared-fallback send icon                                                                                   | Losing explicit-first precedence or the `arrowUp` fallback fails focused tests; the `spec:AST-032` slot stage is not tested here.                | `audit:ChatSendButton/theming`       |
| FR4                       | `ChatSendButton.test.tsx`                                                                                            | Explicit and fallback stop icon                                                                                          | Losing explicit precedence or registry resolution fails focused assertions.                                                                      | `audit:ChatSendButton/behavior`      |
| FR5, FR6                  | `ChatSendButton.test.tsx` callback composition, ordering, size, root passthrough, disabled-click, and keyboard tests | Send, stop, `sm`/`md`, ref/class/data/ARIA, Enter/Space                                                                  | Consumer events replacing state actions, cancellation reordering, lost root inputs, or modality drift fails focused tests.                       | `audit:ChatSendButton/api`           |
| FR7                       | `themingTargets.test.ts` and `ChatSendButton.a11y.chromium.spec.ts`                                                  | Send and stop themes                                                                                                     | Target removal, movement off paint, or undocumented target drift fails tests or browser evidence.                                                | `audit:ChatSendButton/theming`       |
| RTL relation              | RTL shared-fixture route plus refreshed verified-N/A source receipts for ChatSendButton and ChatComposer             | Send and stop                                                                                                            | Directional artwork, physical positioning, or transform invalidates the checked-in receipts.                                                     | `audit:ChatSendButton/i18n-rtl`      |
| Browser matrix            | `ChatSendButton.a11y.chromium.spec.ts` browser states                                                                | Light/dark send and stop rest/hover/focus/press, disabled rest/hover, `sm`/`md`, 320px coarse pointer, D7 contrast pairs | A stale build, decoy selector, missing state, changed disabled paint, absent interaction pixels, failed contrast, or geometry miss fails closed. | `audit:ChatSendButton/visual`        |
| Documentation and surface | Consumer docs, export checks, Storybook, and `check:knowledge`                                                       | Props, public subpath, states, contract                                                                                  | Missing or stale docs, exports, relationships, or required structure fails validation.                                                           | `audit:ChatSendButton/docs`          |

Read from source, with no focused test yet:

- FR5: explicit props winning over ChatComposer context.
- FR6: `style` and `xstyle` reaching the root.

## Decision log

No component-local decision is recorded.

## Open questions

- **Cross-reference: stop without handler.** `component:ChatComposer/OQ4` owns
  the unresolved policy for a visible stop action without an explicit or context
  `onStop`. This record covers today's enabled no-op branch without
  duplicating that question.

## Content boundary

This file does not duplicate consumer examples, audit scores, screenshots,
eligibility data, or shared Button and icon-system rules. It links to their owners.
