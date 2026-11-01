---
schema_version: 3
template_version: 7
kind: component
id: component:ChatToolCalls
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-01
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

| Area                    | Contract                                                                                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `ChatToolCalls` with required `calls` (each with `name`, optional `status`, `target`, `node`, `duration`, `additions`, `deletions`, `stats`, `errorMessage`, `resultDetail`, `data`, and `key`), optional `label`, `isExpanded`, `defaultIsExpanded`, `onExpandedChange`, and root div props and ref. |
| Behavior                | No calls render nothing; one call renders directly; multiple calls expose a disclosure whose collapsed surface shows the latest call and whose expanded surface shows every call.                                                                                                                     |
| End-user impact         | Readers see what tools an assistant ran and whether each is pending, running, done, or failed; a group of calls collapses to its latest call and keeps hidden rows out of keyboard and screen-reader navigation.                                                                                      |
| Builder impact          | None.                                                                                                                                                                                                                                                                                                 |
| Compatibility/readiness | Records shipped behavior; no public change. One implementation gap, listed under Current-state impact; two owner questions stay open.                                                                                                                                                                 |
| Review checks           | Reject ignored labels, focusable descendants inside a collapsed group, lost keyboard activation, unreadable supporting text, dropped root inputs, or changed call ordering/defaults.                                                                                                                  |
| Governing rules         | `architecture:public-component-api/INV5–INV6, INV8–INV9`; `architecture:interaction-modality`; `spec:AST-009/FR7`; WCAG 2.2 SC 1.4.3 and 2.4.7.                                                                                                                                                       |

This table is a review projection; the body below is authoritative.

## Intent

ChatToolCalls presents tool or function invocations inside an assistant message,
including execution status, optional metadata, and inspectable result details.

## Compatibility and migration

- Released default preserved: `yes`; omitted status means complete and groups
  start collapsed unless `defaultIsExpanded` is true
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: `isExpanded` remains authoritative when supplied; otherwise local state starts from `defaultIsExpanded ?? false`.
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Signed statistics can miss text contrast.** The success and error
  foreground tokens used for signed `+N` and `-N` statistics do not reach
  4.5:1 on every shipped light and dark surface; WCAG 2.2 SC 1.4.3 requires
  that contrast for text (FR5, OQ2).

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

| Concept       | Closed values or states                               | Meaning                                                      | Availability        | Default   | Owner                               | Stability | Invalid-value behavior               |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------ | ------------------- | --------- | ----------------------------------- | --------- | ------------------------------------ |
| Call list     | empty; single; multiple                               | Selects absent, direct-row, or grouped presentation.         | Every render        | required  | `component:ChatToolCalls`           | Stable    | Empty renders nothing.               |
| Status        | pending; running; complete; error                     | Selects the visible and accessible execution state.          | Every call          | complete  | `component:ChatToolCalls`           | Stable    | Type-invalid values reject.          |
| Group label   | omitted; supplied string                              | Names an expanded group; omission uses the translated count. | Multiple calls      | omitted   | caller and component                | Stable    | Supplied strings render verbatim.    |
| Group state   | controlled; uncontrolled collapsed; uncontrolled open | Controls whether grouped rows are exposed.                   | Multiple calls      | collapsed | caller or component                 | Stable    | Conflicting control is avoided.      |
| Result detail | omitted; caller React node                            | Adds an independently operable per-call disclosure.          | Any call            | omitted   | caller and component                | Stable    | Omitted content adds no control.     |
| Root surface  | ref; supported DOM/data/ARIA/class/style/xstyle       | Extends the root without replacing its owned target.         | Non-empty call list | omitted   | `architecture:public-component-api` | Stable    | Unsupported inputs stay unsupported. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                        | Basis                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| FR1 | An empty call list MUST render no root; one call MUST render directly; multiple calls MUST render one group disclosure and preserve caller order in its full list.                                                                                                               | Current source, tests, and docs                        |
| FR2 | A supplied `label` MUST replace the translated count on the expanded group surface; omission MUST retain the translated count fallback.                                                                                                                                          | Current source, tests, and docs                        |
| FR3 | A collapsed group MUST keep its descendant call disclosures out of keyboard and accessibility navigation; expansion MUST restore them.                                                                                                                                           | Current source and tests                               |
| FR4 | Every component-owned disclosure MUST activate with Enter, Space, and pointer input, expose expansion state, and draw the shared keyboard focus ring.                                                                                                                            | `architecture:interaction-modality`; WCAG 2.2 SC 2.4.7 |
| FR5 | Neutral supporting labels, targets, durations, and custom statistics MUST use the readable secondary foreground; signed addition and deletion counts use the success and error text colors. Implementation gap: those colors can miss text contrast (Current-state impact; OQ2). | WCAG 2.2 SC 1.4.3 and current token architecture       |
| FR6 | Supported root ref, DOM/data/ARIA, className, style, and xstyle inputs MUST reach or compose on the root while the public target remains intact.                                                                                                                                 | `architecture:public-component-api/INV5–INV6, INV8`    |

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
- **AR3 — Status meaning.** Every status exposes translated visually hidden text. Complete and error also use distinct semantic marks; pending and running share the same subtle spinner (OQ1). Error messages are exposed to assistive technology and, on call rows, echoed in the status icon's hover tooltip.
- **AR4 — Static evidence.** Focus appearance, keyboard behavior, inertness, and DOM relationships use unit and Storybook play-function evidence under `spec:AST-009/FR7`; this record makes no announcement claim.

## Design relationships

| Anatomy or state | Design requirement                                                                             | Representation authority          | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------------------------------------------- | --------------------------------- | -------------- | ------------------ |
| Call row         | Compact inline status and metadata remain legible.                                             | Current source and WCAG contrast  | supporting     | FR5, AR3           |
| Disclosure       | Keyboard focus remains visible without changing layout.                                        | Current interaction architecture  | supporting     | FR4, AR1           |
| Status           | Translated hidden text preserves accessible meaning; complete and error retain semantic marks. | Current source and objective a11y | supporting     | FR5, AR3           |

No component-local design decision is recorded.

### Theme ownership

The existing `chat-tool-calls` target remains on the root. Badge, Icon, and Spinner
own their nested targets and paint. No anatomy-theming map is recorded yet; the
block is optional during migration, so the map is deferred.

## Family and system relationships

- `architecture:public-component-api` owns released exports, accepted inputs, styling composition, and refs.
- `architecture:component-theming-surface` owns the target and delegated anatomy contract.
- `architecture:interaction-modality` owns shared keyboard focus treatment.
- `architecture:component-test-sufficiency` owns bounded, mutation-sensitive evidence.
- `spec:AST-009` assigns these static semantics, keyboard, focus, and contrast claims to lower evidence layers rather than real AT.
- `spec:AST-029` owns the audit evidence inventory this record's verification
  map follows.

## Verification map

| Contract     | Verification                                                                                                                                   | Representative states                      | Mutation or failure expectation                                            | Audit section                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------- |
| FR1          | `ChatToolCalls.test.tsx` empty, single, collapsed default, toggle, and "includes the latest status in a collapsed group accessible name" tests | empty; single; grouped                     | A rendered empty root, group chrome on one call, or a wrong surface fails. | `audit:ChatToolCalls/behavior`      |
| FR2          | `ChatToolCalls.test.tsx` "renders the public custom group label when expanded"                                                                 | supplied label                             | An ignored label fails.                                                    | `audit:ChatToolCalls/behavior`      |
| FR3, AR2     | `ChatToolCalls.test.tsx` "removes collapsed call rows from keyboard and accessibility navigation"                                              | collapsed; expanded                        | An operable collapsed row fails.                                           | `audit:ChatToolCalls/accessibility` |
| FR4, AR1     | `ChatToolCalls.test.tsx` focus-ring, disclosure-semantics, and `aria-controls` tests                                                           | group header; detail row                   | A missing ring, expansion state, or controls reference fails.              | `audit:ChatToolCalls/accessibility` |
| AR3          | `ChatToolCalls.test.tsx` status-mark, status-name, and error-message tests                                                                     | each status; error with and without detail | A missing status text, mark, or error text fails.                          | `audit:ChatToolCalls/accessibility` |
| FR6          | `ChatToolCalls.test.tsx` "forwards the root ref and supported DOM props"                                                                       | single root                                | A dropped ref or prop fails.                                               | `audit:ChatToolCalls/public-api`    |
| FR4, AR4     | `ChatToolCalls.stories.tsx` `FocusedGroupedDetail` and `Narrow` play functions                                                                 | focused grouped detail; 320 CSS px         | A thinner or detached focus ring, or horizontal overflow, fails.           | `audit:ChatToolCalls/accessibility` |
| RTL relation | `apps/storybook/rtl-audit/verified-not-applicable.json`                                                                                        | all stories                                | —                                                                          | `audit:ChatToolCalls/i18n-rtl`      |

Read from source, with no focused test yet:

- FR1: caller order in the expanded list.
- FR2: the translated-count fallback when `label` is omitted.
- FR4: Enter and Space activation.
- FR5: the secondary foreground on supporting text.
- FR6: `xstyle` composition.
- PR1–PR2: no Effect or external resource, and no mutation of caller data.

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — Pending/running visual distinction.** Pending and running render the same subtle spinner and differ only in translated accessible text. Which approved visible treatment should distinguish them without inventing component-local status policy?
- **OQ2 — Semantic statistics contrast.** The released success/error foreground tokens for signed `+N`/`-N` statistics do not reach 4.5:1 in every shipped light/dark surface. Which system-level semantic text token should replace them while preserving addition/deletion meaning? The five affected axe baselines remain until that owner decision lands.

## Content boundary

This file does not duplicate consumer examples, tool execution policy, or delegated component contracts.
