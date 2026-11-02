---
schema_version: 3
template_version: 4
kind: module
id: module:Table/useTableVirtualization
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers:
  [
    public-api,
    behavior,
    layout,
    theming,
    accessibility,
    interaction,
    performance,
    react-runtime,
  ]
verified_by:
  [
    packages/core/src/Table/plugins/virtualization/useTableVirtualization.test.tsx,
    packages/core/src/Table/__tests__/TableVirtualization.a11y.chromium.spec.ts,
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
    spec:AST-025,
  ]
---

# useTableVirtualization module contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `useTableVirtualization({rowHeight, viewportHeight})` returns an opaque `TableVirtualizationCapability` for `Table.virtualization`; Table retains data, columns, explicit stable identity and plugins.                                 |
| Behavior                | Fixed-height flat-row windowing with four internal overscan rows per side, at most one retained focused row, native table semantics and parent-owned pre-cell planning.                                                                |
| End-user impact         | Mounted rows preserve selection, controls, focus and truthful full-table positions; unmounted rows are not promised virtual-cursor discovery.                                                                                          |
| Builder impact          | Callers choose total row pitch and bounded viewport height in CSS pixels and accept constrained single-line content; unsupported content falls back to full rendering.                                                                 |
| Compatibility/readiness | Additive, unreleased capability; legacy output remains unchanged without opt-in. Module and parent row-count decisions await exact-head owner approval; runtime and numerical evidence remain release gates.                           |
| Review checks           | Reject render-then-hide, independent keys or scroll owners, invalid native structure, silent clipping/drift, lost focus, unbounded retention, window-relative metadata and unmeasured budget claims.                                   |
| Governing rules         | `component:Table` owns identity, context, admission, render planning, viewport and logical appearance. `spec:AST-025` FR18/FR19 constrain scrolling; `spec:AST-002` and runtime/accessibility architecture constrain API and evidence. |

This table is a review projection; the body below is authoritative.

## Intent

`useTableVirtualization` bounds mounted body rows for caller-owned flat Table data.
Its capability describes fixed geometry; Table owns the semantic rendering pipeline.
Virtualization limits DOM, not product data, fetching, pagination or cache lifetime.

## Compatibility and migration

- Released default preserved: `yes`; absent `Table.virtualization`, rendering, identity and nonvirtualized paginated `rowIndexStart`/`rowCount` output remain unchanged.
- Compatibility class: additive hook, opaque capability and parent opt-in. Virtualized data mode requires valid explicit identity and constrained content; conflicting legacy offset/count inputs use full-render fallback.
- Migration decision: `module:Table/useTableVirtualization/DEC-1` and `component:Table/DEC-4`/`DEC-5`. Promotion requires exact-head owner review of the module and its parent dependencies; draft decisions are not implementation authority.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Fixed-height capability, visible range, internal overscan and gap geometry.
- Bounded retained-focus participation, anchor policy and virtualized accessibility outcomes.
- Supported flat-row composition, fixed-height admission and performance targets.

**Does not own / non-goals**

- Data, columns, canonical identity, rendering mode, row kind, whole-row ownership, pre-cell render plan, viewport and logical appearance metadata: `component:Table`.
- Fetching, loading presentation, selection, activation, sort/filter state, navigation, route restoration or arbitrary imperative row navigation: their module or product owners.
- Tree/grouped/detail rows, expanded panels, custom row anatomy, paginated global-offset data, variable-height or column virtualization in v1.
- A new theme target, public ScrollableArea wrapper, external-root mode, overscan setting or `scrollToRow` API.

## Public API and concepts

The hook returns an opaque `TableVirtualizationCapability` from `rowHeight` and
`viewportHeight`, never data or identity. Table consumes it with its existing
`data`, `columns`, `idKey` and `plugins` and owns types/runtime admission.

| Concept       | Values or states                                              | Meaning                                                       | Default               | Owner                             | Stability         |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | --------------------- | --------------------------------- | ----------------- |
| Geometry      | Positive finite CSS-pixel `rowHeight` and `viewportHeight`    | Total body-row pitch and bounded Table viewport height        | Both required         | This module                       | Draft             |
| Capability    | Opaque Table-compatible value                                 | Carries geometry intent, not sliced props or an engine handle | Absent without opt-in | This module; parent consumption   | Draft             |
| Identity/data | Ordered mutable-compatible `T[]`; valid explicit `idKey`      | One complete logical dataset and parent-resolved key source   | Required for opt-in   | `component:Table`                 | Parent dependency |
| Range         | Half-open contiguous logical interval                         | Viewport-intersecting rows before overscan                    | Derived               | This module                       | Draft             |
| Focus island  | Absent or one retained product-row subtree                    | Preserves the focused row outside the ordinary window         | Absent                | This module; existing focus owner | Draft             |
| Metadata      | Logical index/count, header count, parity and final-row state | One source for distinct ARIA and visible numbering            | Derived               | `component:Table`                 | Parent dependency |

## Behavioral contract

All implementation, browser, accessibility and performance verification below is
pending. These requirements specify draft outcomes, not verified runtime capability.

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Basis                                 | Verification state |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------ |
| FR1  | Unchanged geometry preserves capability identity. Unchanged logical data, keys, columns, plugins and effective mounted set preserve output identities and do not invoke product renderers again.                                                                                                                                                                                                                                                                                                                                                 | Parent memoization; runtime identity  | Pending            |
| FR2  | Mounted data is one contiguous visible window with four overscan rows per side plus at most one discontiguous focused product row. The island is never duplicated inside the window. Empty data mounts no data, spacer or island row.                                                                                                                                                                                                                                                                                                            | DEC-4; bounded DOM                    | Pending            |
| FR3  | Mounted row pitch plus at most three nonzero gap segments equals `logicalDataRowCount * rowHeight`. Gaps use omitted-row count, not DOM-relative indices. Invalid arithmetic or an unrepresentable browser extent disables virtualization rather than compressing geometry.                                                                                                                                                                                                                                                                      | Fixed geometry; native scrolling      | Pending            |
| FR4  | Table retains native table/section/row/cell elements. Each gap is an inaccessible native spacer row/cell with final-column span and no content, padding, border, theme target, state, focus stop or product transform. Structural elements are neither block-rewritten nor absolutely positioned.                                                                                                                                                                                                                                                | Native HTML; DEC-2                    | Pending            |
| FR5  | For nonempty flat data, headers have indices `1..H`, data row `i` has `aria-rowindex=H+i+1`, and Table exposes the parent's FR20 row total: `-1` while admitted incremental loading reports more data, otherwise H+N. Spacers count as neither. Visible row numbering derives `i+1` from the same parent logical source. Empty data preserves the parent empty-state branch without virtual metadata.                                                                                                                                            | Parent FR20; full-table semantics     | Pending            |
| FR6  | Table validates explicit identity across the complete logical dataset and supplies its canonical key and validity to virtualization and row transforms. Function keys preserve string/finite-number type; valid property keys use the parent's string projection. Internal React keys distinguish canonical numeric and string keys. Invalid/duplicate/missing identity disables virtualization in all builds.                                                                                                                                   | Parent FR16; DEC-3                    | Pending            |
| FR7  | A focused row leaving the window remains in the same keyed body-child sequence with its original subtree. Real focus departure, removal or return releases the island; focus transfer replaces it without retaining a second row. Scrolling alone never moves focus or reveals the island.                                                                                                                                                                                                                                                       | Existing focus owner; DEC-4           | Pending            |
| FR8  | Order/data/height changes preserve the first-visible canonical key and fractional row offset, not the active or focused key. A removed anchor resolves to the first surviving successor in old order, then predecessor, then start; the result clamps to the new extent. Appending does not follow the tail.                                                                                                                                                                                                                                     | Controlled data; DEC-4                | Pending            |
| FR9  | Flat selection, sort/filter controls, sticky columns, context menus and row indexing preserve their existing owners. Activation and infinite loading compose only with joint parent/module admission and verification; active state does not retain rows, and loading uses an after-table sentinel beyond the full loaded extent.                                                                                                                                                                                                                | Parent FR17/FR18; independent modules | Pending            |
| FR10 | Server and first client use the same seed `[0, min(N, ceil(viewportHeight/rowHeight)+4))` and gaps from the same validated inputs. There is no initial-count API, full-render-then-collapse or empty-then-repair. Unmeasurable client geometry retains the seed or last valid range.                                                                                                                                                                                                                                                             | SSR; runtime architecture             | Pending            |
| FR11 | Viewport and content invalidation use the parent's both-axis geometry/pooled resize path with inline `contain`, block `allow`, one viewport scroll subscription and at most one pending range frame. Stable no-op renders do not reconnect resources or reset scroll; replaced nodes and stale work cannot publish geometry.                                                                                                                                                                                                                     | Parent FR19; runtime lifetime         | Pending            |
| FR12 | V1 has no public imperative scrolling API. Internal anchor or focus coordination remains distinct from activation, navigation and fetching; native viewport scrolling remains available.                                                                                                                                                                                                                                                                                                                                                         | Public responsibility; DEC-1          | Pending            |
| FR13 | Bounded renderer/DOM counts and the PR targets gate completion. Offscreen content is not constructed and then hidden, discarded or sliced; identity validation is not counted as offscreen cell rendering.                                                                                                                                                                                                                                                                                                                                       | Parent FR18; performance              | Pending            |
| FR14 | Accepted fixed mode defaults unspecified `textOverflow` to existing single-line truncation; explicit `wrap` disables virtualization. Default cells and recognized height-safe plugin cells preserve font size, control targets, density/theme padding and collapsed-border contribution within the total declared pitch. Arbitrary custom renderers, wrapping, media/editor/detail content or custom spans fall back. Overflow or pitch violations remove fixed constraints and render fully; a numeric native row height alone is insufficient. | Fixed-height enforceability; DEC-2    | Pending            |
| FR15 | Striping and all `rows`, `columns`, `grid`, `none` divider modes derive parity/final-row paint from parent metadata in virtual mode only. Ordinary CSS remains unchanged. Selection/hover and pinned-cell overlay projection retain their canonical precedence; disappearing final-row paint does not change pitch.                                                                                                                                                                                                                              | Parent FR20/FR21; logical appearance  | Pending            |
| FR16 | Accessibility claims cover truthful positions of mounted rows, not virtual-cursor discovery of unmounted rows. Scrolling does not add live-region announcements or an ARIA-grid/roving-row contract.                                                                                                                                                                                                                                                                                                                                             | Accessibility evidence boundary       | Pending            |

### Transformation and precedence order

- **ORD1 — Logical inputs.** Caller sort/filter owners establish Table data; parent identity, rendering mode, row kind and ownership resolve before windowing.
- **ORD2 — Admission.** Parent validates capability geometry, identity, flat compatibility and fixed content before invoking product cell renderers. Children mode remains an unchanged no-op.
- **ORD3 — Range.** Body-relative scroll geometry accounts for headers/chrome and sticky occlusion once; range intersection is clamped, expanded by four rows per side and combined with one focus island.
- **ORD4 — Rendering.** Parent BaseTable performs the pre-cell plan, renders gaps and keyed product rows in logical order, and runs existing sequential element transforms only on mounted product rows.
- **ORD5 — Metadata/paint.** Parent logical indices/counts drive ARIA, row numbering, parity and final-row appearance before paint; selection and activation retain their respective state owners.
- **ORD6 — Change/fallback.** Anchor reconciliation and range publication use the same current inputs; disabled virtualization releases resources/gaps/constraints, preserves unrelated plugins and fully renders compatible content with one deduplicated development diagnostic per condition. Recovery requires a changed valid admission input, not repeated retry of a violating configuration.

### Performance and resources

- **PR1 — Structural bound.** With unobscured body viewport `V`, mounted product rows are at most `ceil(V/rowHeight)+1+8+1`; the final one is the optional island. SSR rows are bounded by FR10's seed. There are at most three nonzero gaps; cells and element work scale with mounted rows/columns, never total data length.
- **PR2 — Geometry.** Range arithmetic uses declared pitch, not a variable-size cache or offscreen measurement. Bounded mounted-content diagnostics verify pitch/overflow after mount and font/theme/zoom/geometry invalidation through shared observation; they create no per-row observer fan-out.
- **PR3 — Stable work.** A no-op/current-window scroll invokes zero product renderers. A changed mounted item updates one row. Parent identity/order-map validation may be O(N) on changed data or identity but never per scroll; caller sort/filter cost is recorded separately.
- **PR4 — Shared lifetime.** Parent shared viewport/content observation also serves sticky state; no independent virtualizer detector or second viewport is installed. Unmount, disablement and node replacement release owned subscriptions, queued frames, island elements and obsolete snapshots without silencing shared subscribers.
- **PR5 — Timing targets.** The p95 range-plus-commit target is 4 ms; p95 no-op is 2 ms. At 60 Hz, p95 whole-frame work is at most 16.7 ms with at most 1% missed frames and no persistent blank windows. Core cold render at 100k rows, including key validation, is at most 250 ms. Supported-plugin incremental p95 scroll overhead is at most 2 ms.
- **PR6 — Memory targets.** Additional identity bookkeeping is at most 32 MiB at 100k rows, excluding caller data. Fixed-viewport mounted heap at 100k is at most the 1k case plus 8 MiB. After 20 mount/unmount and viewport-replacement cycles, controlled-GC retained growth plateaus within 1 MiB and no instance node, listener or frame survives.
- **PR7 — Evidence.** Targets are unverified draft gates, not measured evidence. Verification records environment/build/browser versions, corpus, viewport/pitch/column count, p50/p95/max and operation counts at 1k/10k/100k, core and supported combinations; timing and memory results remain outside this record.

## Accessibility contract

- **AR1 — Native semantics.** Header/cell associations and full-table row metadata follow FR4/FR5; gaps have no accessible names, roles as data, controls or state.
- **AR2 — Keyboard access.** The parent's named effective viewport preserves native Arrow/Page scrolling and Tab/Shift+Tab through mounted controls. Tab does not claim traversal of unmounted rows or transfer navigation-key ownership from nested controls.
- **AR3 — Focus retention.** One keyed row persists while it or its recognized owned menu subtree holds focus. Existing menu/layer owners preserve dismissal and focus return, including portalled controls through parent ownership coordination; DOM containment alone does not establish portal ownership.
- **AR4 — Removal.** If row removal otherwise detaches current focus, focus returns to the parent's named viewport with `preventScroll` through shared modality-aware focus. FR22 supplies temporary programmatic-only focusability when fitting content has no sequential viewport stop, preserving explicit caller attributes and restoring the temporary attribute on departure. A caller-selected surviving successor is not stolen. Returning focus to a retained row uses the existing focus owner, not an independent overlay/focus manager.
- **AR5 — Content admission.** Zoom, text reflow and theme/density changes preserve required content and interactive target sizes or trigger full-render fallback, not silent clipping. Default single-line truncation preserves the existing text semantics and overflow affordance.
- **AR6 — Evidence limits.** DOM/accessibility-tree and real-browser keyboard evidence prove structure, indices, control operation and focus. Real AT is required only for an admitted AT-dependent outcome or recorded divergence under `spec:AST-009`; infinite-loading announcement evidence remains with that module.

## Design relationships

| Anatomy/state       | Design requirement                                   | Representation authority                    | Module contract |
| ------------------- | ---------------------------------------------------- | ------------------------------------------- | --------------- |
| Product row/cell    | Equivalent logical-row appearance and controls       | Existing Table targets and state owners     | FR14/FR15       |
| Gap segments        | Geometry only; inaccessible and unpainted            | This module; no theme target                | FR3/FR4         |
| Viewport            | One coordinated Table-owned scroll region            | Parent FR19/DEC-5; `spec:AST-025` FR18/FR19 | FR11; PR4       |
| Focus island        | Same keyed row, not another visual component         | Existing row and focus/menu owners          | FR7; AR3/AR4    |
| Overflowing content | Full-render fallback; no reduced font or target size | Parent fixed-content admission              | FR14; AR5       |

The module adds no theme target. Spacer sizing is internal geometry; logical-row
paint and pinned overlay coordination remain parent-owned.

## Parent and system relationships

- `component:Table` FR16 owns canonical identity; FR17 owns optional row-transform and wrapper context, rendering mode, row kind and whole-row ownership. The parent owns optional `rowModel: 'flat' | 'tree' | 'grouped' | 'detail' | 'custom'` and `wholeRowOwner: 'activation' | 'expansion' | 'navigation'` declarations and compatibility, not this module.
- Parent FR18 owns pre-cell planning and flat admission. Missing compatibility for an unknown custom body modifier disables virtual opt-in; it does not invalidate ordinary legacy usage. Tree/grouped/detail/custom-row combinations fall back without name/order or private-marker inference.
- Parent FR19/DEC-5 owns the existing both-axis viewport, inline containment/block chaining, shared geometry and pooled resize. `spec:AST-025` FR18/FR19 prohibit incidental same-axis nesting and uncoordinated external owners.
- Parent FR20 owns logical metadata and the virtualized-only ARIA path; FR21 owns one coordinated row/pinned paint outcome. DEC-4 owns identity/interaction ownership and DEC-5 owns render-plan/viewport integration.
- `architecture:react-component-runtime` owns current geometry, rendered-state/resource separation, node replacement, StrictMode replay and cleanup. `architecture:public-component-api` and `spec:AST-002` own capability reachability and caller burden.
- Activation, infinite loading and virtualization require joint current parent/module admission before supported composition is released. The loading sentinel follows the full loaded extent outside semantic table data; the parent FR20 owns row totals, including `-1` while admitted loading reports more data. Loading owns availability, announcements and reset semantics, not a second row-count writer. Activation neither supplies identity nor makes active state a focus/scroll owner.

## Verification map

Implementation verification is pending; structural checks are not runtime evidence.

| Contract          | Verification                                                             | Representative states                                                                                                          | Mutation/failure expectation                                                                                    |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| FR1-FR6; PR1-PR3  | Actual Table renderer-count, native DOM, geometry/identity tests         | Empty/short/first/middle/end, fractional pitch, 0/'0', duplicates, invalid keys, one island/three gaps                         | Removing pre-cell slice, typed keys, validation or correct gaps fails bounded-work/geometry assertions.         |
| FR7/FR8; AR2-AR4  | Real-browser focus and anchor integration                                | Scroll focused row/menu out/in, portal focus, transfer/removal, caller successor, sort/filter/insert/delete/replace/append     | Remount, second island, lost focus, stolen successor, stale anchor or tail-follow fails.                        |
| FR9/FR14/FR15     | Plugin and canonical visual regression matrix                            | Selection/sort/filter/sticky/context-menu/index; joint activation/loading; striping/all dividers, density/theme/direction/zoom | Unsupported combinations appear valid, pitch drifts, controls clip, or middle-window/pinned paint differs.      |
| FR10              | SSR/first-client/hydration fixtures                                      | Derived seed, smaller/larger viewport, hidden/reveal, empty state, unchanged legacy pages                                      | Full-render intermediate output, mismatch, empty repair or legacy metadata change fails.                        |
| FR11; PR4         | Shared-observation StrictMode/replacement lifecycle tests                | No-op, rapid scroll, resize/font/content, fitting/overflowing, same/orthogonal axes, disable/unmount                           | Duplicate listener, stale commit, ref churn, leaked resource, shared-subscriber loss or chaining failure fails. |
| FR13; PR1-PR7     | Table performance suite and browser frame/heap traces                    | 1k/10k/100k, cold/no-op/update/scroll, 20 lifetime cycles, supported combinations                                              | Counts scale with N per scroll, persistent gaps, frame/heap targets fail or evidence is missing.                |
| FR16; AR1-AR6     | DOM/accessibility-tree, axe and real-browser keyboard; AT where required | Full header/data positions, hidden spacers, mounted controls, focus, zoom; loading announcement separately                     | Wrong totals/indices, grid-role rewrite, announcement noise or unmounted-discovery claim fails.                 |
| API/compatibility | Public-subpath compile, consumer docs/inventory and knowledge checks     | Opaque capability, data-mode valid-key opt-in, unsupported content/mode fallback, legacy fixtures                              | Capability leaks data/engine knobs, permits contradictory opt-in, or structural ownership is missing.           |

## Decision log

### DEC-1 — Capability configures parent-owned rendering

**Reference:** `module:Table/useTableVirtualization/DEC-1`
**Decider:** pending owner review

The geometry-only opaque capability leaves data/rendering with Table. Its SSR seed
derives from declared sizes; four-row overscan and row-scroll coordination are internal.
Rejected: sliced-props bundles, duplicate Table renderers and public engine/overscan/scroll handles.

### DEC-2 — Flat fixed-content mode has a full-render fail-safe

**Reference:** `module:Table/useTableVirtualization/DEC-2`
**Decider:** pending owner review

Fixed single-line content preserves pitch, fonts and controls. Invalid geometry,
identity, content or extent disables virtualization in all builds. Native gaps
preserve structure; variable-height/tree/grouped/detail/custom rows remain outside v1.
Rejected: numeric row minimums as enforcement, average-height repair, silent clipping and hidden full DOM.

### DEC-3 — Identity and metadata stay canonical

**Reference:** `module:Table/useTableVirtualization/DEC-3`
**Decider:** pending owner review

Parent keys prevent cross-row recycling and distinguish numeric/string identity.
Parent positions count headers for ARIA, not visible numbering; virtual paint uses
logical positions without changing legacy output.
Rejected: secondary extractors, window-local identity and global legacy ARIA correction by this module.

### DEC-4 — One focus island and a first-visible-key anchor

**Reference:** `module:Table/useTableVirtualization/DEC-4`
**Decider:** pending owner review

One keyed island retains focus; first-visible key/fractional offset anchors scroll
with successor/predecessor/start fallback. Table remount, not activation/append, resets it.
Rejected: stretching a contiguous window to remote focus or using active state as scroll ownership.

### DEC-5 — Shared viewport and objective budgets gate completion

**Reference:** `module:Table/useTableVirtualization/DEC-5`
**Decider:** pending owner review

Table/shared scrolling owns both axes, per-axis chaining and pooled geometry.
Structural bounds and PR5/PR6 targets gate completion; targets are not results.
Rejected: a parallel public scroll wrapper/detector or a subjective smoothness verdict.

## Open questions

None. Owner approval establishes the normative module and parent decisions;
implementation and release evidence remain separate.

## Content boundary

This record does not duplicate consumer signatures/examples, parent protocol,
research, measured results, implementation steps or general virtualizer algorithms.
