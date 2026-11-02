---
schema_version: 3
template_version: 4
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
    spec:AST-086,
  ]
---

# useTableInfiniteScroll module contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `useTableInfiniteScroll<T>` returns one `TablePlugin<T>` with only controlled `hasMore`, controlled `isLoading`, and `onLoadMore` returning `Promise<void>`.                                                                  |
| Behavior                | One after-table sentinel observes the parent-owned block viewport, or the browser viewport when absent. Requests latch before invocation; completion and committed controlled state gate short-batch rearming.                |
| End-user impact         | An always-available manual command, coherent progress, preserved focus, and failure-loop suppression keep incremental data loading operable.                                                                                  |
| Builder impact          | The caller owns rows, requests, errors, and stale-data suppression. A dataset reset remounts the component owning the hook together with its Table; no reset/root/look-ahead/loading-renderer API exists.                     |
| Compatibility/readiness | Additive and unreleased. Module and parent row-count decisions await exact-head owner approval; source implementation and runtime evidence remain release gates.                                                              |
| Review checks           | Reject overlapping/reentrant loads, immediate failure loops, stale-generation rearming, DOM-inferred mode, ancestor discovery, focus loss, duplicate announcements/chrome, or invalid table content.                          |
| Governing rules         | `component:Table` owns wrapper/context, render planning, and viewport. Required FR17-FR20, FR22 and DEC-4/DEC-5 parent additions remain subject to owner review; runtime, public API, and evidence rules retain their owners. |

This table is a review projection; the body below defines the module contract.

## Intent

`useTableInfiniteScroll` coordinates incremental append requests for a flat data-driven Table without owning product data, a router, query client, cache, cursor, or page format. Observation is progressive enhancement; a manual load command is always available while more data exists. Loading does not itself paginate existing rows or bound the number of rendered rows.

## Compatibility and migration

- Released default preserved: `yes`; absent this opt-in capability, legacy Table and plugin behavior is unchanged.
- Compatibility class: additive unreleased hook; unsupported new-capability combinations are neutralised while legacy plugins remain available.
- Migration decision: `module:Table/useTableInfiniteScroll/DEC-1`, DEC-6, and DEC-7.

Consumer signatures, imports, examples, and reset instructions belong in consumer docs. Owner approval establishes the normative module and parent decisions; implementation and release evidence remain separate. Merged code or passing checks alone do not establish approval.

## Ownership boundary

**Owns**

- The public hook, end sentinel, observation lifecycle, single-request latch, completion gates, and automatic rearming.
- Fixed progress/manual presentation, failure-loop pause, deterministic command-removal focus handoff, and evidence.
- Contributions to the parent's wrapper/render plan and mode/admission handling without changing caller rows or control state.

**Does not own / non-goals**

- Parent transform ordering, render-mode/context seam, flat admission, empty-state placement, shared viewport, or virtual logical metadata: `component:Table`.
- Data/cursor/page/cache state, transport cancellation, stale response commits, error content, or the decision to fetch again: the caller.
- Client/server pagination, Relay or router integration, scroll restoration, prefetching, or row/column virtualization.
- Children-mode loading; tree/grouped/detail/custom-row v1 loading; public reset, root-ref, look-ahead, or loading-renderer customization.

## Public API and concepts

`hasMore` and `isLoading` are booleans. `onLoadMore()` returns `Promise<void>` and receives no data-client object. An async wrapper can express synchronous append completion without a required loading-flag cycle. These are the complete v1 configuration fields. The module exposes no `resetKey`, `rootRef`, `lookAhead`, or `loadingRenderer` field and no equivalent renderer/root/mode option.

| Concept            | Closed values or states                          | Meaning                                                          | Default                | Owner                      | Stability                        |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------------- | ---------------------- | -------------------------- | -------------------------------- |
| More data          | True/false                                       | Permits requests and controls load affordance presence.          | Controlled             | Caller through this module | Unreleased; owner review pending |
| Controlled loading | True/false                                       | Blocks requests and contributes to current loading presentation. | Controlled             | Caller through this module | Unreleased; owner review pending |
| Request            | Idle, in flight, awaiting commit, failure-paused | One shared automatic/manual request lifecycle.                   | Idle                   | This module                | Unreleased; owner review pending |
| Root               | Parent block viewport, else browser viewport     | Shared geometry, with native ancestor clipping.                  | Derived                | Parent                     | Unreleased; owner review pending |
| Look-ahead         | Zero                                             | No ahead-of-viewport loading distance.                           | Internal zero          | This module                | Not public                       |
| Manual command     | Ready, busy/nonoperable, absent                  | Present whenever admitted and `hasMore=true`.                    | Present with more data | This module                | Unreleased; owner review pending |

## Behavioral contract

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Basis                           | Draft review state                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| FR1  | One mounted hook returns one stable plugin and reads current callbacks/configuration without restarting its request generation. Callback identity changes do not clear a latch or failure pause.                                                                                                                                                                                                                                                                                                                                                                                                                       | DEC-1; parent identity contract | Choice closed; evidence pending                           |
| FR2  | One sentinel and one load/progress surface append to accumulated `afterTable` inside the parent scroll-wrapper content box, outside the semantic table. Prior props, refs, styles, before/after content, and chrome survive. No non-row content enters table sections or rows.                                                                                                                                                                                                                                                                                                                                         | Parent wrapper contract; DEC-2  | Choice closed; evidence pending                           |
| FR3  | Automatic requests require admitted data mode, `hasMore=true`, committed `isLoading=false`, no outstanding latch, no failure pause, and a currently intersecting sentinel. The latch is set before calling the current callback; observer/manual/reentrant paths share it.                                                                                                                                                                                                                                                                                                                                             | DEC-1                           | Choice closed; evidence pending                           |
| FR4  | A fulfilled Promise completes after settlement and the first subsequent commit observing current `isLoading=false`; no true phase is required. Invocation never rearms from a pre-call false snapshot. A non-Promise result is invalid configuration: release the invocation latch, pause automatic loading, emit one development diagnostic and restore the manual command once controlled loading is false. An invalid callback cannot create a permanent inferred-busy state.                                                                                                                                       | DEC-1                           | Choice closed; evidence pending                           |
| FR5  | After a successful current request reaches FR4's gate, a still-visible sentinel with `hasMore=true` rearms after commit without needing an exit/re-entry gesture. Each following batch uses a fresh latch, never a recursive same-stack callback loop.                                                                                                                                                                                                                                                                                                                                                                 | DEC-1                           | Choice closed; evidence pending                           |
| FR6  | `hasMore=false` disconnects observation and removes command/progress without an unsolicited exhaustion announcement. Before removing a focused command, focus moves to the parent's programmatic Scroll-region destination with `preventScroll`; other focus is untouched. False-to-true may rearm only under current completion/pause gates.                                                                                                                                                                                                                                                                          | DEC-3                           | Choice closed; parent review and evidence pending         |
| FR7  | Missing IntersectionObserver disables automatic observation without throwing or breaking SSR/hydration. The same manual Button remains available; unsupported observation never creates a silent dead end.                                                                                                                                                                                                                                                                                                                                                                                                             | DEC-3                           | Choice closed; evidence pending                           |
| FR8  | One fixed progress presentation uses the mounted Load more Button's `isLoading` state for current effective loading. Button's persistent polite loading region is the sole announcement owner under `spec:AST-086` FR3/FR4/FR8; its Spinner is silent. The module does not announce the same loading message through `useAnnounce` or add another live region. Latch/controlled updates coalesce into one busy transition, without observer-event or appended-row announcements. No module-owned error chrome or public progress renderer exists.                                                                      | DEC-4/DEC-5                     | Choice closed; implementation/AT evidence pending         |
| FR9  | Loading does not call other plugin callbacks, mutate selection/activation/sort/filter state, replace rows, or reset scroll. Caller data updates remain caller-owned.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Ownership boundary              | Choice closed; evidence pending                           |
| FR10 | Empty data can load. The stable plugin publishes its effective loading snapshot through `TablePlugin.renderState` before sections are constructed, together with immutable `hasMore` availability from the same controlled configuration: a current outstanding latch or controlled loading contributes true while `hasMore` is true, and exhaustion contributes false. Parent FR22 gates that contribution by current mode/model/wrapper admission before suppressing only the default initial EmptyState. Completion without rows restores ordinary empty behavior; caller empty/error content remains caller-owned. | Parent FR22; DEC-4              | Choice closed; parent implementation and evidence pending |
| FR11 | The root is the parent-owned Table block viewport when present, otherwise the browser viewport. Native IntersectionObserver ancestor clipping handles outer nested scrolling; no nearest-scroll-ancestor discovery or second viewport exists. Root/sentinel replacement disconnects obsolete resources before acquisition.                                                                                                                                                                                                                                                                                             | Parent FR19; DEC-2              | Choice closed; parent review and evidence pending         |
| FR12 | The module stays data-protocol agnostic and adds no cursor, page, router, cache, request-client, reset, root-ref, look-ahead, or loading-renderer API. Internal look-ahead is zero.                                                                                                                                                                                                                                                                                                                                                                                                                                    | DEC-6                           | Choice closed; evidence pending                           |
| FR13 | The parent's mode/admission context drives children-mode no-op and one deduplicated development warning. Missing/unknown mode or non-flat/unsupported custom body modifiers disable the new capability in all builds with deduplicated diagnostics, preserving legacy props and plugins. Mode is never inferred from DOM.                                                                                                                                                                                                                                                                                              | Parent FR17-FR18; DEC-7         | Choice closed; parent review and evidence pending         |
| FR14 | A reset remounts the component owning this hook and its Table together. Settlements from a prior generation cannot invoke, rearm, announce, or paint the new generation. Remounting only the Table child is not a reset. Ordinary callback/config changes do not reset outstanding work or failure pause.                                                                                                                                                                                                                                                                                                              | DEC-6                           | Choice closed; evidence pending                           |

### Transformation and precedence order

- **ORD1 — Parent mode and admission.** Consume optional second context to `transformScrollWrapper` before adding resources/chrome; children, missing context, and unsupported row models retain prior props unchanged.
- **ORD2 — Gates and current values.** Resolve `hasMore`, committed `isLoading`, outstanding latch, failure pause, and current generation before every automatic/manual attempt.
- **ORD3 — One invocation.** Set the latch before the current callback; reentrant/manual/observer attempts see it immediately. Callback identity never resets it.
- **ORD4 — Completion barrier.** Apply FR4's Promise completion or invalid-result recovery and the current generation check. Rearming happens after commit, not synchronously inside callback settlement.
- **ORD5 — Failure.** Throws/rejections pause automatic loading under DEC-5. Manual retry is the only in-place recovery; owning-hook remount starts a new generation. More-data toggles and observer churn do not clear a pause.
- **ORD6 — Presentation and focus.** Apply the surface states below, suppress conflicting initial empty state through parent render planning, and transfer focus before removing a focused command.
- **ORD7 — Parent pipeline.** Declare `rowModel: 'flat'` without claiming `wholeRowOwner`; append after existing `afterTable` and preserve prior wrapper contributions. Use the one parent viewport, not a private scroll layer.

### Completion, failure, and surface states

A Promise remains latched through settlement and a subsequent current false commit, including a synchronously fulfilled Promise without a true loading phase. A still-pending Promise or caller-controlled `isLoading=true` remains busy because a known owner reports loading, not because a cycle is missing. A non-Promise result releases the invocation latch and pauses automatic requests; after a false commit the same manual command is operable again, without requiring a remount.
A throw/rejection ends the invocation and pauses automatic loading. Once settled and committed false, manual retry starts a fresh latch; success resumes rearming and failure retains the pause. Errors/stale data remain caller-owned, without duplicate error chrome or visible-sentinel retries.

| State                                           | Surface and request behavior                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Admitted, more data, ready                      | One localized Load more Button, including when observation works; visible sentinel can request automatically.       |
| Current loading or outstanding completion latch | Same mounted/focusable Button, visibly busy and nonoperable for click/Enter/Space; one fixed progress presentation. |
| Initial loading with no rows                    | Loading surface rather than the default empty-state message; no prefilled or duplicated live region.                |
| Failure-paused and committed not loading        | Same operable manual Button retries; no automatic loop and no module-owned error chrome.                            |
| Exhausted                                       | No command/progress/observer; hand off focus only if the removed command owns it.                                   |
| Unsupported observation                         | Same manual/loading/exhausted states; automatic observation is absent.                                              |
| Children/unsupported admission                  | No module sentinel, loading chrome, requests, or empty-state changes; deduplicated development diagnostic.          |

The shared Button receives effective loading through `isLoading`, owning its
`aria-busy`, Spinner and persistent polite loading region; request guards preserve
focus and block repeated activation without native disabling. Its localized
loading region alone announces the busy transition, including an initially busy
mount under Button's empty-before-content rule. The module contributes no channel
call, live role or second loading message. Coalesced latch/controlled updates and
StrictMode replay must not create another busy occasion. The sentinel is not a tab
stop. A focused command's exhaustion successor follows parent FR22; fitting content
uses temporary programmatic focusability while explicit caller attributes remain
intact. No focus moves merely because loading settles or observation churns.

### Performance and resources

- **PR1 — One observer.** At most one IntersectionObserver and one observed sentinel exist per mounted hook; there is no row/column scan in an entry callback.
- **PR2 — Native observation.** No per-scroll/per-frame JavaScript listener drives loading; unsupported IO uses manual operation.
- **PR3 — Stable resources.** Current callback updates and no-op rerenders do not reconnect unchanged root/sentinel geometry; internal look-ahead remains zero.
- **PR4 — Closed cleanup cases.** Loading, exhaustion, children/unsupported mode, root/sentinel replacement, unmount, and StrictMode replay release obsolete observation. Loading-to-ready and exhausted-to-more acquire at most one current observer after gates pass; queued obsolete entries are ignored.
- **PR5 — Generation isolation.** Cleanup invalidates old node/async/announcement work without cancelling or committing caller data; settlement cannot touch a new mounted generation.

## Accessibility contract

- **AR1 — Valid structure.** Sentinel/progress/Button remain outside the semantic table and never become announced data rows/cells (WCAG 2.2 SC 1.3.1).
- **AR2 — Progress timing.** The mounted Load more Button's persistent polite loading region is the sole owner of each current busy-start message; the composed Spinner is silent and the module adds no channel call or live region (`spec:AST-086` FR3/FR4/FR6/FR8). Deterministic ownership/count tests verify one delivery per coalesced busy transition. Cross-platform spoken timing is recommended follow-up under `spec:AST-009`, not a fabricated completed test or extra owner.
- **AR3 — Manual operation.** A shared Button with localized name and visible focus exists whenever admitted and `hasMore=true`, independent of IO. Busy state preserves focus while blocking pointer and keyboard requests (SC 2.1.1, 2.4.7, 4.1.2).
- **AR4 — Focus stability.** Appending/loading do not move focus or remount the command. Exhaustion moves focus before focused-command removal to the parent destination with `preventScroll`, never stealing unrelated focus (SC 2.4.3, 2.4.7).
- **AR5 — Motion.** Progress stays understandable without motion and respects reduced motion.
- **AR6 — Touch and zoom.** Manual and automatic paths require neither hover nor precise pointing and remain usable under touch, zoom, and responsive layout (SC 1.4.10).
- **AR7 — Evidence layers.** DOM/accessibility-tree and deterministic tests prove the single Button-region route, silent Spinner, state/keyboard/focus and cleanup. Spoken timing on NVDA + Chrome or VoiceOver + Safari follows the recommended `spec:AST-009` follow-up; no new virtual-cursor or precise speech claim is added by this module.

## Design relationships

| Anatomy or state | Design requirement                                                    | Representation authority                     | Module contract     |
| ---------------- | --------------------------------------------------------------------- | -------------------------------------------- | ------------------- |
| Sentinel         | Geometry only; no false row or control semantics.                     | Internal, no public target                   | FR2, FR11, AR1      |
| Manual command   | Always present with more data; mounted focus-preserving busy state.   | `component:Button`, existing `button` target | FR6-FR8, AR3-AR4    |
| Progress         | One fixed localized presentation, not duplicate loading/error chrome. | DEC-4; shared primitives; no module target   | FR8, FR10, AR2, AR5 |
| Exhaustion       | No unsolicited message; deterministic focus successor.                | DEC-3; parent Scroll region                  | FR6, AR4            |
| Error            | Caller-owned content and request decision.                            | Caller                                       | DEC-5               |

No new Table/module theme target or state is public. Button retains its existing delegated target; sentinel/supporting status text is internal and non-customizable. This draft claims no current module-doc anatomy inventory or completed target verification.

## Parent and system relationships

- `component:Table` FR17 and DEC-4 supply optional second `TableRenderContext` to `transformScrollWrapper`, with `mode`, admitted row model, logical/header counts, and a stable shared viewport reference; per-row `key`, `identityStatus`, and product/synthetic/unknown `kind` belong to `TableRowContext`, not wrapper inference. Unsupported structural models disable flat capabilities before transforms. FR18 owns pre-cell admission; FR19/DEC-5 own the both-axis viewport with inline containment and block allowance. The stable `renderState` source feeds effective loading into FR22 before section construction; parent mode/model/wrapper admission gates consumption, default empty suppression and exhaustion-focus ownership.
- Parent optional `rowModel` and `wholeRowOwner` declarations, not names/order/DOM, decide new-capability compatibility. V1 admits flat data only; tree/grouped/detail/custom-row models and undeclared custom body modifiers are unsupported opt-ins while legacy plugins retain their behavior.
- Flat selection, sorting, filtering, sticky columns, context menus, and row indices compose. Infinite loading and windowing share the parent viewport/render plan jointly after relevant module and parent approval; parent FR20 alone owns full virtual row metadata and totals. This module publishes `hasMore` through its render-state snapshot, preserving snapshot identity until loading or availability changes: `hasMore=true` makes the admitted nonempty windowed total unknown (`aria-rowcount=-1`), independently of busy/failure-pause state; exhaustion restores the parent H+N total. No module sets or infers a second count from mounted/loaded rows. Nonwindowed legacy caller counts and empty-table metadata remain unchanged.
- Runtime architecture owns observer acquisition, current-value synchronization, node replacement and StrictMode cleanup; public API rules keep the hook protocol-agnostic. Button owns its persistent loading-region machinery under `spec:AST-086`; the module supplies effective loading and does not duplicate its announcement.

## Verification map

Required implementation checks remain pending; recommended spoken-timing follow-up
is identified separately and is not a second announcement owner or release gate.
Frontmatter paths are verification targets, not assertions that files exist or pass.

| Contract                            | Verification                                                                                                                                       | Representative states                                                                                                                                                                                                                                                    | Mutation or failure expectation                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR3-FR7, FR14, ORD1-ORD5       | Pending deterministic observer/manual events and controlled-commit tests in the module unit suite.                                                 | Reentry; Promise pending/fulfilled/rejected with controlled true/false; synchronous fulfillment without a true phase; invalid non-Promise result and operable manual recovery; visible short batches; callback replacement; hook-owning reset versus child-only remount. | Overlap, stale-false rearm, same-stack recursion, immediate failure loop, dead-ended short batches, or prior-generation request/paint fails. |
| FR2, FR8-FR10, FR12-FR13, ORD6-ORD7 | Pending render/composition tests through the parent mode/render plan.                                                                              | Data/children/unknown context; flat/non-flat/custom; empty initial loading; chrome/refs; caller errors.                                                                                                                                                                  | Invalid DOM, children sentinel, repeated warning, replaced chrome, contradictory empty/progress, or duplicated error UI fails.               |
| FR11, PR1-PR5                       | Pending lifecycle and geometry tests under StrictMode.                                                                                             | Parent block root/viewport fallback/nested ancestor clipping; root/node replacement; ready/loading/exhausted/false-to-true; absent IO; unmount.                                                                                                                          | Ancestor discovery, leaked/multiple observers, stale entries, callback churn, or new-generation effects fails.                               |
| AR1, AR3-AR7                        | Pending `TableInfiniteScroll.a11y.chromium.spec.ts`, DOM/tree, axe, browser keyboard/touch/zoom/motion/focus flows.                                | Ready/busy/manual/unsupported IO, append, focused and unrelated-focus exhaustion, fitting Scroll region.                                                                                                                                                                 | Native disabling loses focus, busy requests fire, missing manual command, false row semantics, or focus handoff scroll/steal fails.          |
| AR2                                 | Pending DOM/accessibility-tree and transition-count checks of the single Button region and silent Spinner; spoken timing is recommended follow-up. | Initial load, latch/controlled updates, repeated entries, short batches, completion/failure/exhaustion, replay, reset.                                                                                                                                                   | Duplicate/skipped/out-of-order or stale-generation progress, prefilled regions, and churn announcements fail.                                |
| Public API and docs                 | Pending compile fixture, inventory, `.doc.mjs`, Storybook, and generic async recipe.                                                               | Three fields; Promise completion and invalid void-result diagnostics/recovery; owning-hook React key reset; manual fallback.                                                                                                                                             | Client/root/reset/look-ahead/renderer API leaks, wrong reset owner, or undocumented completion obligations fails.                            |
| Performance                         | Pending extensions to `Table.perf.test.tsx` for stable identities, callback work, and repeated appends.                                            | No-op rerender, many batches, flat load/window composition.                                                                                                                                                                                                              | Resource churn, row scans, or recorded budget regressions fails.                                                                             |
| Structural ownership                | `pnpm check:knowledge` structural check; implementation evidence is separate.                                                                      | Draft module/backlink, schema 3/template 4.                                                                                                                                                                                                                              | Missing, duplicate, wrong-kind, misnamed, or orphaned records must fail.                                                                     |

## Decision log

### DEC-1 — Latch before request and complete after commit

**Reference:** `module:Table/useTableInfiniteScroll/DEC-1`
**Decider:** pending owner review

All paths share a pre-invocation latch and require a Promise. Settlement plus a subsequent committed false snapshot completes a valid request without requiring a true phase. Invalid non-Promise results release the invocation latch, pause automatic attempts, and preserve operable manual recovery once controlled loading is false. Successful short batches rearm after commit.
Rejected: unobservable void completion, a mandatory true-to-false cycle, or treating invalid callback output as permanently pending.

### DEC-2 — Parent geometry and after-table placement

**Reference:** `module:Table/useTableInfiniteScroll/DEC-2`
**Decider:** pending owner review

The parent's block viewport is the root when present, otherwise the browser viewport. Native ancestor clipping handles nesting. One surface appends outside the table.

### DEC-3 — Always-operable manual path and deterministic focus

**Reference:** `module:Table/useTableInfiniteScroll/DEC-3`
**Decider:** pending owner review

A Load more Button exists with more data, stays mounted/focusable while busy, and is nonoperable until completion. Exhaustion transfers only its owned focus to the parent Scroll region before removal with `preventScroll`.
Rejected: IO-only loading, hiding the command during loading, or stealing unrelated focus on exhaustion.

### DEC-4 — The Load more Button owns loading announcements

**Reference:** `module:Table/useTableInfiniteScroll/DEC-4`
**Decider:** pending owner review

Shared Button primitives render one fixed loading surface. Its persistent polite
loading region is the sole busy-message owner; the module supplies coalesced
loading state and adds no channel call. Initial loading suppresses only the default
empty message. Required verification checks routing and ownership deterministically;
real spoken timing remains recommended follow-up.
Rejected: a public loading renderer, a second channel/region for Button's loading message, or duplicate error/progress chrome.

### DEC-5 — Failure pauses automatic loading

**Reference:** `module:Table/useTableInfiniteScroll/DEC-5`
**Decider:** pending owner review

Throws/rejections pause automatic loading until gated manual retry or owning-hook remount. Manual success resumes rearming. Caller-owned errors/stale data, more-data toggles, and callback changes never silently reset failure.
Rejected: immediately retrying a visible failed sentinel or module-owned error/retry panels.

### DEC-6 — Zero look-ahead and hook-owning remount reset

**Reference:** `module:Table/useTableInfiniteScroll/DEC-6`
**Decider:** pending owner review

Look-ahead is internal zero. Dataset reset keys the component owning both hook and Table; old settlements cannot affect the new generation. The caller still suppresses stale product-data commits.
Rejected: public look-ahead/reset APIs, Table-child-only remount as reset, or module cancellation of caller data.

### DEC-7 — Parent mode and flat admission

**Reference:** `module:Table/useTableInfiniteScroll/DEC-7`
**Decider:** pending owner review

Parent context/declarations admit flat data loading and the shared viewport. Children mode is a deduplicated-warning no-op; unknown/non-flat/custom-body incompatibility neutralises the capability while preserving legacy plugins.

## Open questions

None. Actual owner review and all implementation, browser, performance, and AT evidence remain pending.

## Content boundary

This record links rather than duplicates consumer examples, parent protocol, observer/live-region machinery, audit results, implementation plans, or caller data/error and pagination/virtualization contracts.
