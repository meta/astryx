---
schema_version: 3
template_version: 6
kind: component
id: component:ChatSystemMessage
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility, testing]
verified_by:
  [
    packages/core/src/Chat/ChatSystemMessage.test.tsx,
    packages/core/src/Chat/__tests__/ChatSystemMessage.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/ChatSystemMessageAudit.stories.tsx,
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
    architecture:react-component-runtime,
    architecture:theme-tokens,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs: [spec:AST-002, spec:AST-009, spec:AST-020, spec:AST-029]
---

# ChatSystemMessage component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | The exported noninteractive chat row accepts required content, `default` or `divider` presentation, optional icon content, and supported root DOM, styling, and ref inputs.                                                                                                                       |
| Behavior                | The default branch centers and wraps content with optional icon content in a status region. The divider branch delegates its labelled separator to Divider and currently does not render the `icon` input.                                                                                        |
| End-user impact         | People can distinguish factual chat notices from sender messages and can identify temporal or section breaks through a labelled separator.                                                                                                                                                        |
| Builder impact          | Builders choose between a plain status row and a labelled divider and provide self-contained content. No new caller choice is introduced by this observational record.                                                                                                                            |
| Compatibility/readiness | This draft records the wrapping correction plus released observable behavior. The unresolved divider/icon combination remains unchanged and requires an owner decision before its behavior changes.                                                                                               |
| Review checks           | Reject lost status or separator semantics, dropped supported root inputs, target/anatomy drift, or claims that the unresolved divider/icon combination has been settled.                                                                                                                          |
| Governing rules         | `architecture:public-component-api/INV3`, `architecture:public-component-api/INV5`, `architecture:public-component-api/INV9`; `spec:AST-002/FR15`; `architecture:component-theming-surface/INV3-INV6`; `architecture:component-test-sufficiency`; `spec:AST-009`; `spec:AST-020`; `spec:AST-029`. |

This table is a review projection. The draft body below records checkable current
behavior and does not create product policy.

## Intent

ChatSystemMessage presents concise non-sender content inside a chat transcript. It
separates system-originated notices from sender messages and delegates labelled date
or section separators to Divider.

## Compatibility and migration

- Released default preserved: yes; the default branch now allows long content to wrap within its container.
- Compatibility class: additive layout correction, observational documentation, and evidence.
- Controlled/uncontrolled behavior: not applicable; the component owns no state.
- Migration decision: none for wrapping. Any divider/icon type restriction would require an explicit compatibility decision under `architecture:public-component-api/INV9`.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The non-sender status row and its `chat-system-message` target.
- Selection between the default centered row and the delegated divider composition.
- Wrapping default-variant content within the available inline space while keeping icon artwork from shrinking.
- Root DOM, styling, and ref composition.

**Does not own / non-goals**

- Sender identity, avatar, bubble, transcript ordering, or scrolling.
- Divider rule paint, label placement, separator role, or separator naming, which are delegated to `component:Divider`.
- Long Divider-label overflow and forced-colors rule paint, which remain shared `component:Divider` advisories rather than ChatSystemMessage-owned defects.
- Divider's skipped-label rendering. Empty strings and empty Fragments leave the separator without a visible label or accessible name; numeric zero renders one visible `0` and names the separator `0`. These partitions remain owned by `component:Divider`.
- The semantic or directional meaning of caller-provided content or icon artwork.
- Announcement timing or spoken output; claims at that layer require `spec:AST-009` evidence.

## Public concepts

Consumer syntax remains in `ChatSystemMessage.doc.mjs`. This table closes the
observable public surface without deciding the unresolved divider/icon contract.

| Concept          | Closed values or states                                  | Meaning                                                                     | Availability by variant/orientation/state             | Default   | Owner                               | Stability                  | Invalid-value behavior                              |
| ---------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- | --------- | ----------------------------------- | -------------------------- | --------------------------------------------------- |
| Presentation     | `default`; `divider`                                     | Selects a centered status row or a labelled horizontal Divider composition. | Every render.                                         | `default` | `component:ChatSystemMessage`       | Observed released surface  | Values outside the public union are rejected by TS. |
| Content          | caller-provided `ReactNode`                              | Supplies the visible status or separator label.                             | Both variants.                                        | Required  | caller and component                | Observed released surface  | Missing content is rejected by TS.                  |
| Icon content     | omitted; caller-provided `ReactNode`                     | Supplies optional caller-owned icon content associated with the message.    | Rendered by default and currently ignored by divider. | Omitted   | caller and component                | Unsettled released surface | Divider currently ignores the input; see OQ1.       |
| Root surface     | ref; supported DOM/data/ARIA/events; class/style/xstyle  | Extends the component-owned root without replacing its owned role or state. | Both variants.                                        | Omitted   | `architecture:public-component-api` | Observed released surface  | Unsupported BaseProps omissions stay unsupported.   |
| Status semantics | persistent `role="status"`; delegated labelled separator | Exposes the row as status content and the divider child as a separator.     | Status on both; separator on divider.                 | Fixed     | component and `component:Divider`   | Observed released surface  | Consumer role input does not replace owned role.    |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                  | Basis                                                                                                       | Draft review state                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| FR1 | The default branch MUST render the required content in a centered, noninteractive status row, allow long content to wrap within the available inline space, and preserve optional icon geometry.     | Current source, released docs, tests, and examples                                                          | Verified current behavior                               |
| FR2 | The divider branch MUST render renderable content through Divider as a labelled horizontal separator inside the component's status root. Skipped content follows Divider's delegated label contract. | Current source, released docs, Divider implementation, tests, and examples                                  | Verified current behavior; delegated Divider partitions |
| FR3 | The divider branch currently ignores `icon`; this draft MUST NOT convert that observation into a stable restriction, a requirement to render the icon, or a warning policy.                          | `architecture:public-component-api/INV3`, `architecture:public-component-api/INV5`, and `spec:AST-002/FR15` | Human API decision required; see OQ1                    |
| FR4 | Supported root DOM, data, ARIA, className, style, xstyle, and ref inputs MUST reach or compose on the root while component-owned `role="status"` and reflected `variant` remain intact.              | Current source plus `architecture:public-component-api/INV5-INV8`                                           | Verified current behavior and existing focused evidence |
| FR5 | The component MUST use semantic color, spacing, and typography tokens and logical layout; the `variant` state remains reflected on the single `chat-system-message` target.                          | Current source, `architecture:theme-tokens`, and theming architecture                                       | Verified current behavior                               |
| FR6 | The component remains render-only: props determine output without Effects, state mirrors, observers, listeners, timers, or owned async resources.                                                    | Current source and `architecture:react-component-runtime/INV1-INV8`                                         | Verified current behavior                               |

### Allowed variation

- **AV1 - Caller content.** Text and other React content may vary while remaining
  self-contained. Empty strings, numeric zero, and empty Fragments are reachable
  `ReactNode` partitions. The default variant keeps `role="status"` and renders the
  content unchanged: empty string and empty Fragment content remain empty, while
  numeric zero renders one `0`. In the divider variant, the status root and separator
  remain; empty string and empty Fragment content produce no visible label or
  accessible name, while numeric zero renders one visible `0` and names the
  separator `0`. Divider owns those label partitions.
- **AV2 - Caller styling.** Supported root styling inputs may extend the component
  without replacing owned status semantics or variant reflection.
- **AV3 - Delegated Divider paint.** Divider owns its rule and label paint and may
  evolve within its own contract.

### Representative states

| State                 | Required invariant                                                                                                                                                                                                                       | Allowed variation                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Default               | Centered status content is present.                                                                                                                                                                                                      | Content, theme, and root styling.           |
| Default with icon     | Optional icon content and visible content render together.                                                                                                                                                                               | Caller-provided artwork and content.        |
| Default long content  | Content wraps without crossing either inline edge or creating page overflow.                                                                                                                                                             | Theme and localized content.                |
| Divider               | A labelled horizontal separator presents the supplied content.                                                                                                                                                                           | Label content, theme, and root styling.     |
| Divider with icon     | Current output is measured without deciding the ignored-input contract.                                                                                                                                                                  | No behavior change until OQ1 is resolved.   |
| Empty ReactNode       | The default variant keeps `role="status"` and renders content unchanged (empty or one `0`). In the divider variant, the status root and separator remain; empty content has no label/name, while numeric zero renders and names one `0`. | Empty string, numeric zero, empty Fragment. |
| Narrow/coarse pointer | The noninteractive row remains visible without horizontal page overflow.                                                                                                                                                                 | Theme and supported content.                |

### Transformation and precedence order

- **ORD1 - Select branch.** `variant="divider"` selects the Divider branch;
  every other supported value uses the default branch.
- **ORD2 - Compose root.** Apply component-owned target/state and styles, then
  compose supported consumer styling and root inputs while retaining the owned
  status role.
- **ORD3 - Delegate divider.** Divider owns separator semantics and paint inside
  the component root.

### Performance and resources

- **PR1 - Render-only projection.** The component adds no Effect, observer,
  listener, timer, state mirror, or owned asynchronous lifecycle.

## Accessibility contract

- **AR1 - Status exposure.** The root currently exposes `role="status"` for both
  variants. Browser evidence may prove role exposure; spoken announcement timing is
  outside this draft and requires `spec:AST-009` evidence.
- **AR2 - Divider relationship.** Renderable content in the divider branch delegates a
  horizontal `separator` whose labelled target contains the visible label; focused DOM
  tests verify the computed accessible name. Skipped content follows Divider's
  delegated label contract.
- **AR3 - Caller content.** Visible content remains the self-contained message.
  Caller-provided icon content does not replace that text.
- **AR4 - Noninteractive surface.** The component introduces no focus target,
  keyboard command, pointer action, disabled state, or interactive state machine.

## Design relationships

| Anatomy or state | Design requirement                                                                                 | Representation authority                                     | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------- | ------------------ |
| System message   | Centers a concise non-sender row and owns the component target.                                    | Current source and released consumer docs                    | Supporting     | FR1, FR4, FR5      |
| Content          | Presents the caller's visible message.                                                             | Current source and released consumer docs                    | Prominent      | FR1, FR2, AR3      |
| Icon content     | Supplies optional caller-owned artwork associated with the message; variant behavior is unsettled. | Current source and released consumer docs; divider unsettled | Supporting     | FR1, FR3, AR3      |
| Divider          | Delegates labelled separator paint and semantics to Divider.                                       | `component:Divider` observed implementation and docs         | Supporting     | FR2, AR2           |

This observational draft does not choose new spacing, proportions, color roles,
icon artwork, live-region timing, or divider/icon behavior.

## Family and system relationships

- `component:Divider` owns the delegated separator structure, role, name,
  paint, long-label overflow, and label partitions. Numeric zero renders as one
  visible label and names the separator `0`; skipped content remains unlabelled.
- `architecture:public-component-api` owns released exports, BaseProps reachability,
  styling composition, and the ref contract.
- `architecture:component-theming-surface` owns the target/anatomy mapping and
  variant reflection.
- `architecture:component-test-sufficiency` owns bounded, mutation-sensitive evidence
  for applicable promises and established public seams.
- `architecture:react-component-runtime` owns the render-only lifecycle boundary.
- `architecture:theme-tokens` owns the semantic token vocabulary.
- `spec:AST-009` owns any future claim about spoken announcement timing or AT output.
- `spec:AST-020` owns evidence-layer and accessibility completeness boundaries.
- `spec:AST-029` owns this observational audit backfill and prevents it from settling
  new public meaning.

## Verification map

| Contract                  | Verification                                                                                                    | Representative states                                                                                                              | Mutation or failure expectation                                                                                                                         | Audit section                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| FR1, AR1, AR3             | `ChatSystemMessage.test.tsx`, scoped axe, and exact-head Chromium receipts                                      | Default, default with icon, long content, nested live log, neutral light/dark                                                      | Missing content, status role, icon content, wrapping, or browser-visible subject fails focused or browser evidence.                                     | `audit:ChatSystemMessage/accessibility` |
| FR2, AR2                  | `ChatSystemMessage.test.tsx`, Divider tests, scoped axe, and exact-head Chromium receipts                       | Labelled divider content plus empty string, numeric zero, and empty Fragment observations                                          | Lost separator role, label association, orientation, content, or paint fails focused or browser evidence; skipped partitions stay delegated to Divider. | `audit:ChatSystemMessage/behavior`      |
| FR3                       | Closed audit inventory and exact-head observation of the divider/icon partition                                 | Divider with supplied icon                                                                                                         | The audit must expose, not silently omit, the unresolved branch; implementation remains unchanged until owner decision.                                 | `audit:ChatSystemMessage/public-api`    |
| FR4                       | Mutation-sensitive root-passthrough tests, source inspection, type checks, and target reflection                | Default and divider roots                                                                                                          | Removing ref, className, style, xstyle, ARIA forwarding, or owned role precedence fails focused tests.                                                  | `audit:ChatSystemMessage/public-api`    |
| FR5                       | `themingTargets.test.ts`, source inspection, generated build, and exact-head computed paint                     | Both variants and color modes                                                                                                      | Target/state metadata drift, raw styling, physical layout, or unresolved mode paint fails checks or browser evidence.                                   | `audit:ChatSystemMessage/theming`       |
| FR6                       | Source inspection, strict lint, and component test suite                                                        | Every render                                                                                                                       | Adding hidden state or an owned external resource triggers runtime review and corresponding evidence.                                                   | `audit:ChatSystemMessage/code-health`   |
| RTL relation              | Source-hashed verified-N/A record                                                                               | Both variants and caller-owned icon content                                                                                        | Directional component-owned content, physical positioning, ordering, scroll/drag, overlay, or horizontal keyboard behavior invalidates the record.      | `audit:ChatSystemMessage/i18n-rtl`      |
| Browser matrix            | `ChatSystemMessage.a11y.chromium.spec.ts` exact-head 10-sensor receipts                                         | Default, icon, wrapped long content, divider, unresolved divider/icon, nested live log, 320px/coarse pointer, light/dark, D7 pairs | Stale build, wrong story, incorrect mode, missing semantics, default overflow, failed contrast, blank crop, or page error fails closed.                 | `audit:ChatSystemMessage/visual`        |
| Documentation and surface | Consumer docs, published declarations, block metadata, explicit story ownership, exports, and `check:knowledge` | Props, `./Chat` subpath, four blocks, draft record                                                                                 | Missing or stale public docs, export, owner route, target map, or knowledge shape fails validation or review.                                           | `audit:ChatSystemMessage/docs`          |

## Decision log

None. This draft records the wrapping correction, released observable behavior,
and audit evidence. It introduces no public API, default, divider/icon decision,
ownership transfer, or subjective visual decision.

## Open questions

- **OQ1 - Which explicit contract should govern `icon` with `variant="divider"`: render the icon with the divider label; introduce a breaking type restriction with the migration required by `architecture:public-component-api/INV9`; or retain the current no-op with documentation and a development warning?** (`human-api`)

## Content boundary

This file does not duplicate consumer examples, audit scores, screenshots,
eligibility data, or shared Divider and system rules. It links to their owners.
