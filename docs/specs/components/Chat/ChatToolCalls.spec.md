---
schema_version: 3
template_version: 6
kind: component
id: component:ChatToolCalls
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility, testing]
verified_by:
  [
    packages/core/src/Chat/ChatToolCalls.test.tsx,
    apps/storybook/stories/ChatToolCalls.stories.tsx,
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
    architecture:interaction-modality,
    architecture:theme-tokens,
    architecture:knowledge-contracts,
  ]
contributing: []
system_specs: [spec:AST-009, spec:AST-029]
---

# ChatToolCalls component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | The exported component accepts a required call list, optional group label, controlled or uncontrolled expansion, a change callback, and supported root div props and ref.                |
| Behavior                | No calls render nothing; one call renders directly; multiple calls expose a disclosure whose collapsed surface shows the latest call and whose expanded surface shows every call.        |
| End-user impact         | Group labels appear as supplied, collapsed detail controls leave keyboard and accessibility navigation, and every disclosure has the shared visible focus treatment.                     |
| Builder impact          | Existing calls keep their shape and defaults. Builders may rely on the released `label` prop and continue to omit it for the translated count.                                           |
| Compatibility/readiness | Patch-compatible restoration of documented behavior and objective accessibility requirements. No prop, export, default, theme target, call ordering, or caller-content contract changes. |
| Review checks           | Reject ignored labels, focusable descendants inside a collapsed group, lost keyboard activation, unreadable supporting text, dropped root inputs, or changed call ordering/defaults.     |
| Governing rules         | `architecture:public-component-api/INV5–INV6, INV8–INV9`; `architecture:interaction-modality`; `spec:AST-009/FR7`; `spec:AST-029/FR3–FR7`; WCAG 2.2 SC 1.4.3 and 2.4.7.                  |

This table is a review projection. The draft body records verified shipped or
remediated behavior and creates no new tool-call protocol or visual policy.

## Intent

ChatToolCalls presents tool or function invocations inside an assistant message,
including execution status, optional metadata, and inspectable result details.

## Compatibility and migration

- Released default preserved: yes; omitted status means complete and groups start collapsed unless `defaultIsExpanded` is true.
- Compatibility class: patch-compatible correctness and accessibility repair.
- Controlled/uncontrolled behavior: `isExpanded` remains authoritative when supplied; otherwise local state starts from `defaultIsExpanded ?? false`.
- Migration decision: none. No public type, prop, export, default, or theme target changes.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Projection of ordered call data into single-call or grouped presentation.
- Group and per-call disclosures, including keyboard operation and focus treatment.
- Status, metadata, duration, statistics, and result-detail placement.
- The root div, `chat-tool-calls` target, supported BaseProps composition, and ref.

**Does not own / non-goals**

- Tool execution, streaming transport, result parsing, or error recovery.
- Semantics and interaction inside caller-provided `stats` or `resultDetail` content.
- Badge, Icon, Spinner, or CodeBlock internals.
- Product policy for which tool calls may be shown.

## Public concepts

| Concept       | Closed values or states                               | Meaning                                                      | Availability        | Default   | Owner                               | Stability                 | Invalid-value behavior               |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------ | ------------------- | --------- | ----------------------------------- | ------------------------- | ------------------------------------ |
| Call list     | empty; single; multiple                               | Selects absent, direct-row, or grouped presentation.         | Every render        | required  | `component:ChatToolCalls`           | released observed surface | Empty renders nothing.               |
| Status        | pending; running; complete; error                     | Selects the visible and accessible execution state.          | Every call          | complete  | `component:ChatToolCalls`           | released observed surface | Type-invalid values reject.          |
| Group label   | omitted; supplied string                              | Names an expanded group; omission uses the translated count. | Multiple calls      | omitted   | caller and component                | released observed surface | Supplied strings render verbatim.    |
| Group state   | controlled; uncontrolled collapsed; uncontrolled open | Controls whether grouped rows are exposed.                   | Multiple calls      | collapsed | caller or component                 | released observed surface | Conflicting control is avoided.      |
| Result detail | omitted; caller React node                            | Adds an independently operable per-call disclosure.          | Any call            | omitted   | caller and component                | released observed surface | Omitted content adds no control.     |
| Root surface  | ref; supported DOM/data/ARIA/class/style/xstyle       | Extends the root without replacing its owned target.         | Non-empty call list | omitted   | `architecture:public-component-api` | released observed surface | Unsupported inputs stay unsupported. |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                 | Basis                                                         | Draft review state       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ |
| FR1 | An empty call list MUST render no root; one call MUST render directly; multiple calls MUST render one group disclosure and preserve caller order in its full list.                                  | Released implementation, docs, stories, and tests             | verified                 |
| FR2 | A supplied `label` MUST replace the translated count on the expanded group surface; omission MUST retain the translated count fallback.                                                             | Released public prop and consumer docs; public API INV5, INV9 | remediated and verified  |
| FR3 | A collapsed group MUST keep its descendant call disclosures out of keyboard and accessibility navigation; expansion MUST restore them.                                                              | HTML `inert`, disclosure semantics, WCAG operability          | remediated and verified  |
| FR4 | Every component-owned disclosure MUST activate with Enter, Space, and pointer input, expose expansion state, and draw the shared keyboard focus ring.                                               | Current interaction-modality architecture and WCAG 2.4.7      | remediated and verified  |
| FR5 | Neutral supporting labels, targets, durations, and custom statistics MUST use the readable secondary foreground; signed addition/deletion counts retain their released semantic colors pending OQ2. | WCAG 2.2 SC 1.4.3 and current token architecture              | partial remediation; OQ2 |
| FR6 | Supported root ref, DOM/data/ARIA, className, style, and xstyle inputs MUST reach or compose on the root while the public target remains intact.                                                    | `architecture:public-component-api/INV5–INV6, INV8`           | verified                 |

### Allowed variation

- **AV1 — Call content.** Tool names, targets, node names, durations, statistics, error messages, and result details remain caller supplied.
- **AV2 — Group control.** Callers may control expansion or supply only its initial uncontrolled value.
- **AV3 — Styling.** Supported root styling inputs may extend the component without replacing its public target.

### Representative states

| State                | Required invariant                                                                                      | Allowed variation                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Empty                | No root is rendered.                                                                                    | Empty array identity may vary.                                                      |
| Single               | One row appears without group chrome.                                                                   | Metadata and result detail may be absent.                                           |
| Multiple, collapsed  | Latest call and count appear; full rows are inert.                                                      | Call count and latest status may vary.                                              |
| Multiple, expanded   | Every call appears in source order; supplied label or translated count names the group.                 | Label text and row metadata may vary.                                               |
| Detail closed/open   | The row exposes its state and conditionally mounts the caller-owned detail.                             | Any caller React node.                                                              |
| Statuses             | All statuses expose translated accessible text; complete and error also retain distinct semantic marks. | Theme may change semantic artwork; pending and running share a spinner pending OQ1. |
| Narrow / RTL context | Rows truncate without horizontal overflow and follow logical inline direction.                          | Content length, theme, and direction.                                               |

### Transformation and precedence order

- **ORD1 — Choose presentation.** Empty, single, and grouped branches are selected from list length.
- **ORD2 — Resolve state.** Controlled expansion wins; otherwise local state starts from the initial default.
- **ORD3 — Resolve label.** A supplied group label wins; otherwise use the translated count.
- **ORD4 — Compose rows.** Preserve call order, render status and metadata, then add caller-owned detail disclosure where present.
- **ORD5 — Compose root.** Apply the component target and styles, then combine supported consumer inputs.

### Performance and resources

- **PR1 — Local state only.** The component owns disclosure state and no Effect, listener, observer, timer, or external resource.
- **PR2 — Linear projection.** Group rendering traverses the supplied call list once and does not mutate caller data.

## Accessibility contract

- **AR1 — Disclosure operation.** Group and detail disclosures expose `aria-expanded`, operate with pointer, Enter, and Space, and use the shared visible focus ring.
- **AR2 — Collapsed ownership.** Collapsed group content is inert; hidden detail content is unmounted.
- **AR3 — Status meaning.** Every status exposes translated visually hidden text. Complete and error also use distinct semantic marks; pending and running currently share the same subtle spinner (OQ1). Error messages are exposed to assistive technology and echoed in the status icon's hover tooltip.
- **AR4 — Static evidence.** Focus appearance, keyboard behavior, inertness, color contrast, and DOM relationships use unit, axe, and real-browser evidence under `spec:AST-009/FR7`; this audit makes no AT-announcement claim.

## Design relationships

| Anatomy or state | Design requirement                                                                             | Representation authority          | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------------------------------------------- | --------------------------------- | -------------- | ------------------ |
| Call row         | Compact inline status and metadata remain legible.                                             | Current source and WCAG contrast  | supporting     | FR5, AR3           |
| Disclosure       | Keyboard focus remains visible without changing layout.                                        | Current interaction architecture  | supporting     | FR4, AR1           |
| Status           | Translated hidden text preserves accessible meaning; complete and error retain semantic marks. | Current source and objective a11y | supporting     | FR5, AR3           |

This observational draft does not choose new spacing, density, iconography,
proportion, status vocabulary, or motion.

### Theme ownership

The existing `chat-tool-calls` target remains on the root. Badge, Icon, and Spinner
own their nested targets and paint. This observational draft does not add a public
theme target or redefine inherited Chat-family anatomy.

## Family and system relationships

- `architecture:public-component-api` owns released exports, accepted inputs, styling composition, and refs.
- `architecture:component-theming-surface` owns the target and delegated anatomy contract.
- `architecture:interaction-modality` owns shared keyboard focus treatment.
- `architecture:component-test-sufficiency` owns bounded, mutation-sensitive evidence.
- `spec:AST-009` assigns these static semantics, keyboard, focus, and contrast claims to lower evidence layers rather than real AT.
- `spec:AST-029` owns this observational audit backfill and closed evidence receipt.

## Verification map

| Contract         | Verification                                                                  | Representative states                                                | Mutation or failure expectation                                                        | Audit section                       |
| ---------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------- |
| FR1–FR4, AR1–AR2 | `ChatToolCalls.test.tsx`                                                      | empty, single, grouped, label, disclosures                           | Ignored label, wrong state, operable collapsed row, or missing ring fails.             | `audit:ChatToolCalls/behavior`      |
| FR5, AR3–AR4     | scoped Chromium axe plus existing-baseline visual comparisons                 | neutral metadata in light mode; existing visual states in light/dark | Reintroducing disabled-text contrast fails; semantic stats remain baselined under OQ2. | `audit:ChatToolCalls/accessibility` |
| FR6              | focused root passthrough/ref checks and theming target guard                  | single root                                                          | A supported input, ref, or public target is dropped or replaced.                       | `audit:ChatToolCalls/public-api`    |
| RTL relation     | source-hashed verified-N/A record                                             | all checked-in stories                                               | Component-owned directional behavior invalidates the record.                           | `audit:ChatToolCalls/i18n-rtl`      |
| Browser matrix   | existing visual baselines, scoped a11y, and required real-browser play guards | grouped focus and 320px narrow overflow; existing light/dark states  | Missing focus, overflow, visual regressions, or new a11y violations fail.              | `audit:ChatToolCalls/rendered`      |
| Docs / surface   | docs, declarations, exports, knowledge check, docs typecheck                  | public props, Chat subpath, draft record                             | Missing or stale docs, export, target, or knowledge shape fails.                       | `audit:ChatToolCalls/docs`          |

## Decision log

No component-local product decision is created by this observational draft. The
repairs restore released API behavior and objective accessibility requirements.

## Open questions

- **OQ1 — Pending/running visual distinction.** Pending and running currently render the same subtle spinner and differ only in translated accessible text. Which approved visible treatment should distinguish them without inventing component-local status policy?
- **OQ2 — Semantic statistics contrast.** The released success/error foreground tokens for signed `+N`/`-N` statistics do not reach 4.5:1 in every shipped light/dark surface. Which system-level semantic text token should replace them while preserving addition/deletion meaning? The five affected axe baselines remain until that owner decision lands.

## Content boundary

This file does not duplicate consumer examples, audit scores, screenshots, tool
execution policy, or delegated component contracts.
