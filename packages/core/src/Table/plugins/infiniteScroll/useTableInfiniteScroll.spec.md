---
schema_version: 3
template_version: 3
kind: module
id: module:Table/useTableInfiniteScroll
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers:
  [public-api, behavior, layout, theming, accessibility, interaction]
verified_by:
  [
    packages/core/src/Table/plugins/infiniteScroll/useTableInfiniteScroll.test.tsx,
    packages/core/src/Table/__tests__/TableInfiniteScroll.a11y.chromium.spec.ts,
    packages/core/src/Table/Table.perf.test.tsx,
    scripts/check-knowledge.mjs,
  ]
parent_component: component:Table
references:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
    architecture:react-component-runtime,
    spec:AST-002,
    spec:AST-009,
    spec:AST-020,
  ]
---

# useTableInfiniteScroll module contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | Candidate `useTableInfiniteScroll` hook returning one `TablePlugin` from controlled `hasMore`, controlled `isLoading`, and `onLoadMore`; root, reset, fallback, and look-ahead inputs remain unadmitted until their owner decisions pass.                                            |
| Behavior                | One end sentinel requests the next batch as it approaches the relevant block-scroll viewport, never overlaps requests, and rearms when loading completes while more data remains.                                                                                                    |
| End-user impact         | People can continue through incrementally loaded rows without duplicate requests, focus disruption, inaccessible progress, or a dead end when automatic observation is unavailable.                                                                                                  |
| Builder impact          | Builders own data, request state, errors, and appended rows. The plugin owns observation, duplicate suppression, progress/fallback presentation, and cleanup.                                                                                                                        |
| Compatibility/readiness | Additive, unreleased module. This draft is not implementation authority. Scroll-root ownership, request completion/reset, parent rendering-mode seam, fallback policy, loading/error composition, customization, and announcement evidence require owner decisions before promotion. |
| Review checks           | Reject viewport assumptions, overlapping loads, stale callbacks, a permanently visible sentinel loop, unexplained focusable sentinels, progress announced on every observer tick, a mouse-only fallback, invalid table DOM, retained observers, or router/data-client dependencies.  |
| Governing rules         | `component:Table` FR9-FR12 and ORD1-ORD4 own plugin composition; `architecture:react-component-runtime` owns observer lifetime; `architecture:public-component-api` and `spec:AST-002` own public caller burden.                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

`useTableInfiniteScroll` connects incremental data loading to a data-driven Table
without making Table own a router, cache, query client, cursor format, or product data.
It owns an end sentinel, observation lifecycle, one-request-at-a-time behavior,
rearming, accessible progress, and a keyboard-operable fallback.

Infinite scroll is distinct from client pagination and virtualization. It appends data;
it does not choose the caller's page/cursor protocol or bound the number of rendered rows.

## Compatibility and migration

- Released default preserved: `yes`; Table behavior remains unchanged unless the new plugin is supplied.
- Compatibility class: additive public hook, types, documentation, and examples.
- Migration decision: `module:Table/useTableInfiniteScroll/DEC-1` after the open ownership decisions are approved.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The public hook, configuration, sentinel, observer lifecycle, and loading trigger boundary.
- Duplicate-request suppression, rearming after completion, and short-batch behavior.
- Default progress and manual fallback behavior, accessibility, performance, and evidence.
- Composition with Table's scroll wrapper, empty state, loading state, appended rows, other plugins, and the candidate children-mode warning/no-op, blocked on OQ8's parent contract decision.

**Does not own / non-goals**

- Aggregate `TablePlugin` protocol, transform order, or scroll-wrapper implementation — owned by `component:Table`.
- Product data, request/cursor/page state, cache policy, retry policy, or error content — owned by the caller or another module.
- Client pagination, server pagination, Relay integration, row virtualization, or column virtualization.
- Scroll restoration, URL state, routing, or prefetching.
- A new public Table theme target unless a separate approved decision establishes a distinct theme-author need.
- Caller-composed children-mode semantics or the parent rendering-mode contract. The candidate warning/no-op depends on OQ8; the module never interprets caller children or infers mode from DOM to append loading UI.

## Public API and concepts

The candidate minimum shape is:

```ts
export interface UseTableInfiniteScrollConfig {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void | Promise<void>;
}

export function useTableInfiniteScroll<T extends Record<string, unknown>>(
  config: UseTableInfiniteScrollConfig,
): TablePlugin<T>;
```

The final shape is blocked on OQ1-OQ8. Consumer docs own final signatures,
defaults, imports, and examples after promotion.

| Concept         | Closed values or states                     | Meaning                                                                                          | Default                  | Owner                                 | Stability |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------- | --------- |
| More-data state | `hasMore` true or false                     | Whether another load may be requested.                                                           | Controlled               | Caller through this module            | Candidate |
| Loading state   | `isLoading` true or false                   | Whether a request is already in flight.                                                          | Controlled               | Caller through this module            | Candidate |
| Load request    | `void` or promise-returning callback        | Starts one caller-owned append operation without prescribing its data protocol.                  | No request while blocked | Caller through this module            | Unsettled |
| Look-ahead      | Optional non-negative distance, if admitted | Starts loading before the sentinel reaches the visible block-end edge.                           | Not yet admitted         | Caller/module boundary                | Unsettled |
| Sentinel        | Observed, loading, exhausted, unavailable   | Coordinates automatic loading without becoming unexplained table data or an accidental tab stop. | Derived                  | `module:Table/useTableInfiniteScroll` | Candidate |
| Manual fallback | Available or hidden                         | Provides an explicit load command when automatic observation is unavailable or unsuitable.       | Unsettled                | `module:Table/useTableInfiniteScroll` | Unsettled |

## Behavioral contract

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                        | Basis                                            | Draft review state                      |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| FR1  | Stable configuration callbacks and unchanged primitive inputs preserve one stable `TablePlugin`.                                                                                                                                                                                                                                                           | Parent plugin identity and runtime architecture  | Settled candidate                       |
| FR2  | The plugin contributes one end sentinel after the semantic `<table>`, inside the Table scroll-wrapper content. It never inserts non-row content inside `<table>`, `<thead>`, `<tbody>`, or `<tr>`.                                                                                                                                                         | Valid HTML and parent wrapper contract           | Settled candidate                       |
| FR3  | Automatic loading is armed only when `hasMore` is true and `isLoading` is false. One visibility episode produces at most one active request.                                                                                                                                                                                                               | Duplicate suppression                            | Settled candidate                       |
| FR4  | While a load is in flight, the module does not call `onLoadMore` again, including through repeated observation, manual activation, or rerender. Completion can make another call eligible only for the current configuration, subject to the controlled inputs and FR14. The caller remains solely responsible for suppressing stale product-data commits. | Controlled state and async ownership             | Callback completion contract unsettled  |
| FR5  | When a short append leaves the sentinel visible and `hasMore` remains true, completing the prior load can request the next batch without requiring the user to scroll away and back.                                                                                                                                                                       | Continuous loading behavior                      | Settled outcome; mechanism free         |
| FR6  | `hasMore=false` disconnects observation, removes the manual command, and presents no loading state. Changing back to true can arm a new request.                                                                                                                                                                                                           | Exhausted-state boundary                         | Settled candidate                       |
| FR7  | An observer-unavailable environment preserves server rendering/hydration and exposes the approved manual fallback rather than throwing or silently dead-ending the user.                                                                                                                                                                                   | Progressive enhancement                          | Fallback policy unsettled               |
| FR8  | Loading progress is shown and announced at most once per state transition, not once per observer callback. Error and retry UI remain caller-owned and do not render duplicate progress chrome.                                                                                                                                                             | Accessibility and module boundary                | Composition surface unsettled           |
| FR9  | The module does not call another plugin's callbacks, mutate selection/activation/expansion/sort/filter state, replace product rows, or reset scroll position. Preservation of caller-controlled state follows from that non-interference; caller data updates remain caller-owned.                                                                         | Plugin independence                              | Settled candidate                       |
| FR10 | Empty data may still load when `hasMore=true`; default EmptyState and load affordance do not obscure each other or communicate contradictory states.                                                                                                                                                                                                       | Empty/loading composition                        | Human layout decision                   |
| FR11 | Approved scroll-root or look-ahead changes reconnect observation without leaking the old observer or triggering from a detached sentinel. Unmount and node replacement release every observer and retained node.                                                                                                                                           | `architecture:react-component-runtime`           | Settled candidate                       |
| FR12 | The plugin remains data-protocol agnostic. `onLoadMore` receives no Table-owned page, cursor, Relay, router, cache, or request-client object.                                                                                                                                                                                                              | Public ownership boundary                        | Settled candidate                       |
| FR13 | In children mode the module is a no-op and emits at most one deduplicated development warning. This candidate outcome depends on OQ8's missing parent contract; it does not establish a rendering-mode signal on the current Table wrapper transform or permit mode inference from DOM.                                                                    | Missing `component:Table` dependency, OQ8        | Hold: parent contract decision required |
| FR14 | Reconfiguration during a load follows one approved caller-visible reset or React remount boundary. Settlement from a load started before that boundary neither calls `onLoadMore`, makes a call eligible, nor changes loading presentation for the current configuration. Caller response ownership remains unchanged.                                     | Caller-visible reset and stale-completion safety | Human API decision                      |

### Transformation and precedence order

- **ORD1 — Exhausted/loading gate.** Resolve `hasMore` and `isLoading` before observing or exposing a manual command.
- **ORD2 — Current configuration.** Calls use the current `onLoadMore` and respect the approved reset/remount boundary; changing callback identity alone does not end an in-flight load or silently redefine product-data ownership.
- **ORD3 — One load at a time.** From invocation of `onLoadMore` until the approved completion condition, no observation or manual activation invokes it again, including reentrant activation from caller code. Synchronous throws and asynchronous settlement follow OQ2's completion rule.
- **ORD4 — Completion after reset.** FR14 excludes settlement from before a reset/remount from invoking or enabling a call or changing current loading presentation. Completion of a current-configuration load follows OQ2/OQ5 and the controlled inputs; the plugin never commits or rejects caller data.
- **ORD5 — Rearm.** Controlled completion and continued `hasMore` rearm the current sentinel, including when it remains visible.
- **ORD6 — Presentation.** Exhausted, loading, automatic, fallback, and error-adjacent states render one coherent after-table surface.
- **ORD7 — Parent pipeline.** In data mode the module appends to accumulated `afterTable` content and preserves prior wrapper props, styles, refs, and chrome; children mode returns prior props unchanged, subject to OQ8's parent contract dependency.

### Performance and resources

- **PR1 — One observer.** At most one `IntersectionObserver` and one observed sentinel exist per mounted plugin instance.
- **PR2 — No scroll listener.** Native observation, not a per-frame or per-scroll JavaScript listener, drives automatic loading.
- **PR3 — Stable resources.** Callback updates do not recreate observation when the approved root/look-ahead geometry and sentinel are unchanged.
- **PR4 — Complete cleanup.** Unmount, sentinel replacement, root replacement, exhaustion, and loading transitions release obsolete observation.
- **PR5 — Constant callback work.** An observer entry performs constant coordination work and never scans rows or columns.

## Accessibility contract

- **AR1 — Valid structure.** Sentinel, progress, and fallback UI stay outside the semantic table and do not appear as data rows or cells (WCAG 2.2 SC 1.3.1; DOM/accessibility-tree and browser evidence).
- **AR2 — Progress announcement.** Loading transitions use a non-interruptive status that does not repeat for observer churn or every appended row (WCAG 2.2 SC 4.1.3). Deterministic transition tests prove event count/order, and the approved implementation requires NVDA + Chrome on Windows and VoiceOver + Safari on macOS to prove spoken announcement timing under `spec:AST-009` FR4 and FR12.
- **AR3 — Operable fallback.** The approved fallback is a real keyboard-operable control with a localized name and visible focus; the sentinel itself is not an unexplained tab stop (WCAG 2.2 SC 2.1.1, 2.4.7, and 4.1.2; DOM/axe/real-browser evidence).
- **AR4 — Focus stability.** Appending rows does not move focus, reset focused descendants, or make the fallback disappear while it owns focus without a deterministic successor (WCAG 2.2 SC 2.4.3 and 2.4.7; real-browser keyboard evidence).
- **AR5 — Reduced motion.** Progress presentation does not require motion to communicate loading state and respects platform motion settings; real-browser visual evidence proves the supported states.
- **AR6 — Touch and zoom.** Automatic loading and fallback remain available without hover, precision pointing, or a fixed viewport size (WCAG 2.2 SC 1.4.10 and 2.1.1; responsive/touch real-browser evidence).
- **AR7 — Evidence boundaries.** Real AT evidence is limited to AR2's announcement claim or any later approved AT-dependent outcome; it supplements rather than replaces deterministic state, DOM, keyboard, and browser coverage.

## Design relationships

| Anatomy or state    | Design requirement                                                                    | Representation authority  | Module contract   |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------- | ----------------- |
| End sentinel        | Supplies observation geometry without masquerading as table data or a control.        | This module               | FR2-FR7, AR1      |
| Loading progress    | Communicates one active append operation without duplicating caller-owned chrome.     | Unsettled pending OQ4     | FR3-FR8, AR2, AR5 |
| Manual load command | Provides an explicit fallback with normal control semantics and focus treatment.      | Unsettled pending OQ3/OQ4 | FR7-FR10, AR3-AR4 |
| Exhausted state     | Stops requesting and removes load affordances without adding an unsolicited message.  | This module               | FR6, ORD1, ORD5   |
| Error/retry         | Remains outside the module unless a later loading/error composition contract owns it. | Caller or another module  | FR8, non-goal     |

The module adds no direct theme target. OQ3/OQ4 must select any progress/fallback component and then name its exact existing target or record a classified `none`; no delegation is promised yet. Sentinel geometry is implementation detail rather than theme API.

## Parent and system relationships

- `component:Table` owns the scroll-wrapper phase and accumulated `afterTable` slot. **Missing parent dependency (OQ8):** its current contract does not establish a data/children mode signal at that phase. The module remains on hold until the parent contract records the approved mode distinction or makes the invalid combination unrepresentable; FR13 then cites that owning claim. This draft neither supplies a field nor approves a parent API change.
- `architecture:react-component-runtime` owns observer acquisition, current-value synchronization, node replacement, StrictMode replay, and cleanup boundaries.
- `architecture:public-component-api` and `spec:AST-002` require a protocol-agnostic API whose inputs express caller-owned state rather than implementation clients.
- `spec:AST-009` and `spec:AST-020` own announcement evidence and the WCAG/evidence-layer boundary; AR2 is the only current real-AT-dependent claim.
- Pagination and virtualization remain separate modules. Infinite loading can compose with them only where their current contracts explicitly permit it.

## Verification map

| Contract                            | Verification                                                                                                    | Representative states                                                                                     | Mutation or failure expectation                                                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR3-FR7, FR14, ORD1-ORD5       | Deterministic observer events, callback count/order assertions, and controlled rerenders                        | Visible/hidden, loading, exhausted, short batch, reentrant activation, throw, async settle, reset/remount | Calls overlap, pre-reset completion invokes or enables a call or changes current loading presentation, short batches dead-end, observation throws, or rearm fails.                      |
| FR2, FR8-FR10, FR12-FR13, ORD6-ORD7 | Table render and plugin-composition tests against the parent rendering-mode contract once OQ8 is resolved       | Data/children mode, empty/non-empty, wrapper chrome, loading, exhausted, caller error UI                  | Invalid DOM appears, children mode renders a sentinel, warning repeats, prior chrome is lost, caller state is mutated, or states contradict; absent parent authority keeps OQ8 on hold. |
| FR11, PR1-PR5                       | Observer lifecycle tests under StrictMode, root/sentinel/look-ahead change, unmount, and no-op rerender         | Every approved acquisition, replacement, and release path                                                 | More than one observer survives, detached nodes remain observed, or stable inputs churn resources.                                                                                      |
| AR1, AR3-AR7                        | DOM/accessibility-tree assertions, axe, and real-browser keyboard/touch/zoom/reduced-motion/focus flows         | Automatic, fallback, loading, append, exhaustion, observer unavailable                                    | Sentinel becomes a row/tab stop, focus is lost, fallback is inoperable, or responsive/motion behavior carries required meaning.                                                         |
| AR2                                 | Deterministic status-transition count/order tests plus NVDA + Chrome on Windows and VoiceOver + Safari on macOS | Initial load, repeated observer entries, short batches, completion, exhaustion                            | Status repeats, arrives out of order, is skipped, or announces observer churn/appended rows instead of loading transitions.                                                             |
| Public API and docs                 | Public-subpath compile fixture, `.doc.mjs`, generated inventory, Storybook, and one generic async-cache recipe  | Controlled state, promise/void callback, approved reset/root/fallback/look-ahead inputs                   | API leaks a client, exposes look-ahead without admission, cannot express the approved reset boundary, promises unsettled behavior, or permits contradictions.                           |
| Performance                         | Extend Table performance coverage with stable no-op, observer callback, and repeated append budgets             | Large representative data and repeated batches                                                            | Stable rerenders recreate resources, callbacks scan rows, or appends exceed recorded budgets.                                                                                           |
| Structural ownership                | `pnpm check:knowledge`                                                                                          | Draft module and parent backlink                                                                          | A missing, orphaned, misnamed, wrong-kind, or duplicate module record passes validation.                                                                                                |

## Decision log

### DEC-1 — Infinite scroll owns loading coordination, not data

**Reference:** `module:Table/useTableInfiniteScroll/DEC-1`
**Decider:** pending owner approval

The module observes the end of rendered Table content and asks the caller for another batch. It owns at-most-one-in-flight loading, callback eligibility after completion/reset, rearming, and presentation under FR4/FR14 and ORD2-ORD5, not an internal coordination mechanism. The caller remains the sole owner of rows, request protocol, cache, cursor/page, stale-response suppression, errors, and retry policy.

Rejected: importing a router/query client, mutating Table data, or combining cursor,
server-pagination, Relay, and infinite-loading contracts.

### DEC-2 — The sentinel is after the table

**Reference:** `module:Table/useTableInfiniteScroll/DEC-2`
**Decider:** pending owner approval

Observation and progress UI use the parent scroll wrapper's `afterTable` slot. They never
insert non-row elements into semantic table structure or synthesize a fake data row.

Rejected: a `<div>` inside `<tbody>`, a sentinel `<tr>` announced as data, and a focusable
sentinel with no user command.

### DEC-3 — Automatic loading requires an operable fallback

**Reference:** `module:Table/useTableInfiniteScroll/DEC-3`
**Decider:** pending owner approval

Automatic observation is progressive enhancement. An approved fallback prevents a dead
end when observation is unsupported, disabled, or unsuitable and gives keyboard users an
explicit command without making the sentinel itself interactive.

Rejected: silently doing nothing without IntersectionObserver and making automatic loading
the only path.

## Open questions

- **OQ1 — Who owns the block-scroll root?** (`human-api`) Decide viewport default versus an explicit caller root/ref, and how Table nested in a vertical `ScrollableArea` identifies the correct root without brittle ancestor discovery.
- **OQ2 — What observable event completes a load?** (`human-api`) Decide whether controlled `isLoading`, a returned promise, or both permit another `onLoadMore` call after synchronous throw and asynchronous settlement.
- **OQ3 — When is manual fallback shown?** (`human-design`) Decide always-visible, observer-unavailable-only, user-selected, or another policy; define focus behavior when loading/exhaustion removes it.
- **OQ4 — What loading customization is public?** (`human-api`) Decide whether the module renders one fixed default, accepts `renderLoadingIndicator`, composes an existing loading-state module, or stays behavior-only while still meeting progress requirements.
- **OQ5 — How do error and retry compose?** (`human-api`) Keep error content caller-owned, but define how a failed request rearms automatic loading and avoids immediate retry loops or duplicate loading/error chrome.
- **OQ6 — Is caller-configurable look-ahead admitted?** (`human-api`) First prove a non-derivable caller distinction under `spec:AST-002`; if admitted, choose an intent-named distance API with explicit units/default rather than reusing browser `threshold` terminology, which conventionally means an intersection ratio. Keep it out of the candidate interface until then.
- **OQ7 — What is the caller-visible reset boundary?** (`human-api`) Decide an explicit caller-owned reset identity versus a documented React remount/key boundary when dataset/query configuration changes during a load. Pre-reset settlement neither invokes nor enables a call nor changes loading presentation for the current configuration; stale product-data suppression remains the caller's job.
- **OQ8 — Which parent contract distinguishes data from children mode?** (`human-api`) Decide a parent-owned rendering-mode signal at the wrapper transform versus making the invalid combination unrepresentable, preserving FR13's warning/no-op outcome for children mode. The chosen behavior belongs in `component:Table`, and FR13 must cite its approved owning claim before this module is promoted. This missing dependency remains on hold; no parent field or approval is assumed.

## Content boundary

This record does not duplicate consumer signatures/examples, the parent Table wrapper
protocol, general observer mechanics, current usage audits, implementation steps, or
pagination/virtualization/data-client contracts. It links to their canonical owners.
