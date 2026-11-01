---
schema_version: 3
template_version: 3
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

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | Candidate fixed-height row-windowing module with caller-owned data, one validated stable unique Table row identity, a vertical viewport, row height, and an explicit server-rendered initial range. OQ1 keeps parent-owned phases, a dedicated component, and an atomic props bundle open. Caller-configurable overscan is not admitted unless OQ12 proves a semantic need.                                                          |
| Behavior                | Render one contiguous visible row window plus an internally bounded overscan and, when necessary, one separately bounded retained-focus row subtree, while preserving native table structure, full-table row metadata, scroll geometry, stable identity, and supported plugin/core appearance.                                                                                                                                       |
| End-user impact         | Large tables keep bounded DOM and responsive scrolling while preserving supported row state and keyboard focus. The accessibility tree exposes truthful full-table positions for mounted rows; this contract does not claim virtual-cursor discovery of unmounted rows.                                                                                                                                                              |
| Builder impact          | Builders opt into a fixed-height contract, identify the vertical viewport, and supply stable row keys. Variable-height content and unsupported plugin combinations remain explicit rather than silently degrading.                                                                                                                                                                                                                   |
| Compatibility/readiness | Additive, unreleased virtualization capability; no automatic correction to existing nonvirtualized paginated rowIndexStart/rowCount callers. Any shared correction needs a separately approved Table authority/compatibility decision under OQ9. This draft is not implementation authority; parent integration, viewport, fixed height, SSR, focus, anchoring, plugin/appearance compatibility, and budgets remain owner decisions. |
| Review checks           | Reject invalid table DOM, block rewrites of semantic elements, render-then-hide, mismatched/duplicate/index keys, incomplete full-table ARIA totals or positions, unenforceable fixed height, silent clipping/drift, lost focus, unbounded focus retention, spacer-relative striping/dividers, recycled uncontrolled state, scroll jumps, unsupported combinations that appear to work, or unmeasured performance claims.            |
| Governing rules         | `component:Table` owns shared plugin phases and row rendering; its DEC-1 and [`spec:AST-025`](../../../../../../docs/specs/AST-025/spec.md) FR18/FR19 constrain shared viewport ownership. `architecture:react-component-runtime` owns measurement/resource lifetime; `architecture:public-component-api` and `spec:AST-002` own public caller burden.                                                                               |

This table is a review projection; the body below is authoritative.

## Intent

`useTableVirtualization` bounds the number of mounted body rows in a large data-driven
Table while preserving semantic table structure and the caller's row identities. It owns
visible-range calculation, overscan, spacer geometry, absolute row-position metadata,
focus retention, supported-plugin composition, resize/scroll coordination, performance
budgets, and implementation evidence.

Row virtualization is distinct from infinite loading and pagination. It limits mounted DOM
for data the caller already owns; it does not fetch, page, cache, or discard product data.
Column virtualization is a separate contract.

## Compatibility and migration

- Released default preserved: `yes` for the additive virtualization capability; absent opt-in, Table renders every supplied row and this module does not change existing nonvirtualized paginated `rowIndexStart`/`rowCount` output.
- Compatibility class: additive public capability plus the smallest approved parent integration. Full-table metadata is required for virtualized mode. Any shared correction affecting existing nonvirtualized callers requires a separately approved `component:Table` authority/compatibility decision; this module does not automatically authorize a global correction.
- Migration decision: `module:Table/useTableVirtualization/DEC-1` after the protocol and interaction questions are approved. OQ9 keeps the metadata integration and public compatibility scope explicit; any migration for existing callers belongs to the separately approved Table decision.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The public virtualization capability and its fixed-height row-window contract, independent of the API shape chosen in OQ1.
- Visible-range and overscan calculation, top/bottom spacer geometry, and vertical viewport coordination.
- Stable row identity through window changes and explicit DOM-recycling policy.
- Virtualized full-table `aria-rowindex`/`aria-rowcount`, focus retention, keyboard/assistive-technology behavior, and evidence; admitted detail-row representation remains with the parent/detail owner.
- Compatibility declarations for selection, sorting, filtering, activation, expansion/tree/grouping, sticky columns, context menus, and infinite loading.
- Resize/scroll resource lifetime and measurable performance budgets.

**Does not own / non-goals**

- Aggregate plugin protocol and shared render phases — owned by `component:Table`.
- A global correction or migration of existing nonvirtualized paginated `rowIndexStart`/`rowCount` callers; OQ9 requires a separate Table authority/compatibility decision for any such shared change.
- Expanded detail representation or expansion admission; the parent/detail owner owns the shape, and OQ6 must admit the combination before it is supported.
- Product data, fetching, caching, pagination, infinite loading, or server cursors.
- Column virtualization.
- Variable-height row measurement in v1 unless owner evidence admits it explicitly.
- Product scroll restoration, route state, or imperative navigation to arbitrary data not owned by the caller.
- Cell renderer correctness for unstable keys or content that violates the declared fixed-height contract.
- A new theme target. Spacer geometry is not theme anatomy, and visible rows use existing Table targets.

## Public API and concepts

No TypeScript shape is admitted yet. OQ1 chooses parent-owned phases, a dedicated
component, or one atomic Table-compatible props bundle. Whichever shape is approved,
the integration MUST:

- accept mutable-compatible `T[]` data supported by current `TableProps<T>`;
- keep data and the exact validated stable unique `idKey` together for window identity and Table reconciliation, so callers cannot accidentally omit or disagree with it;
- provide one canonical logical offset/count source from which ARIA metadata and `useTableRowIndex` derive their respective positions rather than requiring duplicate caller-maintained offsets; and
- define duplicate/invalid-key behavior before exposing the capability.

The current parent protocol cannot safely express data windowing, semantic spacer rows,
identity, and full-table metadata without an approved integration; OQ1 owns that boundary.

| Concept             | Closed values or states                               | Meaning                                                                                                                                   | Default                     | Owner                                 | Stability |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------- | --------- |
| Data ownership      | Complete caller-owned ordered `T[]`                   | Supplies the logical dataset from which mounted rows are derived.                                                                         | Required                    | Caller through this module            | Candidate |
| Row identity        | Validated stable unique `string` or `number` key      | Drives both window identity and Table reconciliation; duplicate/invalid keys follow one fail-safe policy.                                 | Required                    | Parent/module boundary                | Unsettled |
| Row measurement     | Positive finite total row block size in CSS pixels    | Defines deterministic geometry under an enforceable fixed-height content/appearance mode.                                                 | Required in v1              | `module:Table/useTableVirtualization` | Unsettled |
| Visible range       | Contiguous half-open logical index interval           | Names the rows intersecting the viewport before internal overscan.                                                                        | Derived                     | `module:Table/useTableVirtualization` | Candidate |
| Focus island        | Absent or one separately bounded retained row subtree | Keeps the currently focused row and, only if OQ6 admits it, owned detail mounted without stretching the visible range across the dataset. | Absent without remote focus | `module:Table/useTableVirtualization` | Unsettled |
| Overscan            | Internally bounded non-negative row count             | Absorbs ordinary scroll/keyboard movement without becoming a caller tuning API unless OQ12 admits it.                                     | Internal                    | `module:Table/useTableVirtualization` | Unsettled |
| Spacer geometry     | One or more inaccessible logical-space segments       | Preserves full scroll extent around the visible range and optional focus island.                                                          | Derived                     | `module:Table/useTableVirtualization` | Candidate |
| Initial range       | Explicit positive row count or other approved seed    | Provides deterministic server/hydration output before a client viewport is measurable.                                                    | Unsettled                   | Caller/module boundary                | Unsettled |
| Recycling policy    | Stable keyed mount/unmount; no cross-key DOM reuse    | Avoids moving uncontrolled/focused state between logical rows.                                                                            | No cross-key recycling      | `module:Table/useTableVirtualization` | Candidate |
| Appearance metadata | Absolute logical parity and logical-final-row state   | Preserves striping/dividers independently of spacer/window DOM position.                                                                  | Derived                     | Parent/module boundary                | Unsettled |

## Behavioral contract

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Basis                                                            | Draft review state                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| FR1  | Stable callbacks, data identity, viewport, valid row height, initial-range inputs, and unchanged internal overscan preserve stable module output where their observable result is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Parent identity and runtime architecture                         | Settled candidate                                 |
| FR2  | Mounted data consists of one contiguous visible range plus internally bounded overscan and, when focus would otherwise unmount, at most one separately bounded retained-focus row subtree. Empty data mounts no data/spacer/focus-island row.                                                                                                                                                                                                                                                                                                                                                                                                                               | Window and focus bounds                                          | Human interaction decision                        |
| FR3  | Spacer segments plus mounted row heights equal the full logical body height, including around an optional focus island. The same logical offset before/after a no-op render produces the same visible range without a jump.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Scroll continuity                                                | Settled candidate                                 |
| FR4  | Native `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, and `<td>` semantics remain valid. Spacer representation is absent from accessibility semantics and does not require block/absolute/role rewrites of structural table elements.                                                                                                                                                                                                                                                                                                                                                                                                                                     | HTML and accessibility boundary                                  | Architecture decision pending                     |
| FR5  | Virtualized full-table metadata counts the complete logical table, not just mounted rows, and absolutely indexes represented header/data rows and, if OQ6 admits expansion, every represented semantic detail row. Inaccessible spacers count as neither. The parent/detail owner defines the logical sequence and detail positions; semantic detail rows cannot be silently omitted. Without detail rows, data indices are `headerRowCount + logicalDataIndex + 1` and the total is `headerRowCount + logicalDataRowCount`; these formulas cannot omit admitted semantic detail rows. OQ9 governs integration and any separately approved shared compatibility correction. | WAI-ARIA row metadata; parent/detail ownership and compatibility | Parent API and detail admission decisions pending |
| FR6  | One validated stable unique canonical key drives both window identity and Table reconciliation. The approved integration makes that key inseparable from its data regardless of API shape. Duplicate/invalid keys disable virtualization and fall back to full rendering in all builds, with one development warning.                                                                                                                                                                                                                                                                                                                                                       | React identity and fail-safe behavior                            | Parent/API decision required                      |
| FR7  | A focused row that leaves the ordinary window becomes the one bounded focus island rather than stretching the contiguous range or moving focus to the document body. A focused owned detail subtree participates only if OQ6 admits its representation, metadata, and focus behavior. The island is released on blur, removal, or return to the ordinary range.                                                                                                                                                                                                                                                                                                             | Keyboard/focus correctness                                       | Human interaction and detail admission decisions  |
| FR8  | Sorting/filtering/data replacement recompute current logical order and reconcile scroll/focus anchors according to one explicit policy. Stale geometry or prior indices cannot expose another row under a retained key.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Controlled data and identity                                     | Scroll-anchor policy unsettled                    |
| FR9  | Sticky columns, selection, sorting, filtering, context menus, and `useTableRowIndex` preserve state/meaning for mounted rows. One parent logical-offset source drives ARIA and visible row numbering. Activation, expansion, tree, grouping, infinite loading, and custom rows are explicit compatibility decisions in OQ6; an unapproved activation contract is not an existing Table capability or a promise of supported composition.                                                                                                                                                                                                                                    | Plugin composition                                               | Compatibility matrix decision pending             |
| FR10 | Server and first client render the same explicit initial range. Hydration does not render the full dataset then collapse it or render an empty body and repair it in an Effect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | SSR/hydration and runtime architecture                           | Initial-range policy unsettled                    |
| FR11 | Viewport resize, row-height/data-length change, and scroll events update the range without synchronous layout read/write loops. Stable no-op renders do not reconnect resources or reset scroll.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Runtime/performance boundary                                     | Settled candidate                                 |
| FR12 | Imperative scrolling, if admitted, targets a logical canonical key/index with defined alignment and unavailable-row behavior. It remains separate from activation, focus, navigation, and fetching.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Public responsibility boundary                                   | Human API decision                                |
| FR13 | Completion proves bounded mounted data rows and recorded frame/render/memory budgets. Hiding offscreen mounted rows or rendering all rows before slicing is not virtualization.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Performance outcome                                              | Settled candidate                                 |
| FR14 | V1 accepts only a positive finite total row block size and an owner-approved fixed-height Table mode that defines text overflow, density/theme padding, custom cell content, interactive controls, plugin output, precedence, overflow detection, and explicit rejection/fallback. Invalid height disables virtualization and falls back to full rendering.                                                                                                                                                                                                                                                                                                                 | Enforceable geometry contract                                    | Human API/design decision                         |
| FR15 | If striping or row dividers are supported, their parity/final-row treatment derives from absolute logical row metadata, not spacer-relative `:nth-child`/`:last-child`; middle windows match the equivalent full Table. Otherwise the options are explicitly rejected.                                                                                                                                                                                                                                                                                                                                                                                                      | Core Table appearance compatibility                              | Parent appearance decision                        |
| FR16 | Accessibility-tree claims cover truthful metadata for mounted rows only. This contract does not claim that virtual-cursor users can discover unmounted rows; any admitted AT navigation/announcement outcome requires its own interaction and `spec:AST-009` matrix.                                                                                                                                                                                                                                                                                                                                                                                                        | Evidence boundary                                                | Settled limitation                                |

### Transformation and precedence order

- **ORD1 — Logical data and identity.** Approved sorting/filtering/data-order owners establish the logical `T[]`; the parent validates one canonical stable unique key and exposes one logical offset/count source. Any admitted semantic detail rows follow the parent/detail owner's sequence and position contract in FR5.
- **ORD2 — Admission inputs.** Validate viewport, positive finite row block size, approved fixed-height mode/content, dataset length, initial range, and internal overscan before calculating a window. Invalid identity/height falls back to full rendering.
- **ORD3 — Mounted set.** Derive the contiguous visible range from current scroll geometry, expand by internal overscan, and add at most one separately bounded focus island when required.
- **ORD4 — Semantic body.** Render inaccessible spacer segments, keyed data rows, any admitted semantic detail rows, and any focus island with FR5 full-table indices through the approved parent integration, regardless of API shape. Preserve valid table semantics and exclude spacers, not semantic detail rows, from row counts.
- **ORD5 — Element plugins.** Existing row/cell transforms run only for mounted logical data/focus-island rows unless their current contracts explicitly include spacer anatomy; `useTableRowIndex` consumes the same logical offset as ARIA metadata.
- **ORD6 — Core appearance.** Virtualized row rendering receives absolute logical parity/final-row metadata before striping/divider styles resolve, so spacers and window edges do not alter appearance.
- **ORD7 — State changes.** Data/order/height/viewport changes apply the approved anchor policy before exposing the next range; stale work cannot overwrite current geometry.
- **ORD8 — Parent protocol.** The module does not privately bypass BaseTable. Any new data/body/identity/appearance phase belongs to `component:Table` and must be approved before implementation; OQ1 does not require a phase-shaped API.

### Performance and resources

- **PR1 — Bounded DOM.** Mounted data is bounded by visible rows plus internal overscan and at most one separately bounded focus-retained row subtree, independent of total dataset length.
- **PR2 — Fixed-height arithmetic.** Correct range/geometry behavior uses the validated declared block size and viewport geometry and does not require per-row measurement or observer fan-out; diagnostics/fallback for contract violations remain an OQ10 outcome.
- **PR3 — One viewport subscription.** At most one scroll subscription and one resize/viewport observer exist per mounted instance; updates are scheduled without more than one pending frame of range work.
- **PR4 — Stable no-op.** Unchanged inputs and a scroll offset that remains within the current effective range do not rebuild every row or reset stable module output identity.
- **PR5 — Measured budgets.** Implementation records mounted row count, initial render cost, no-op rerender cost, scroll-frame work, memory trend, and supported-plugin overhead at representative 1k, 10k, and 100k logical rows.
- **PR6 — Cleanup.** Unmount and viewport replacement release listeners, observers, animation-frame work, retained elements, and stale geometry.

## Accessibility contract

- **AR1 — Semantic table.** Native table structure and header/cell associations remain intact; virtualization does not convert Table into an ARIA grid or generic block list.
- **AR2 — Full-table position exposure.** The browser accessibility tree exposes each represented semantic row's absolute full-table `aria-rowindex` and full-table `aria-rowcount` under FR5, including represented detail rows only if OQ6 admits expansion. Positions never use window-relative ordinals, and inaccessible spacers count as neither. This is a computed-semantics claim, not a promise that unmounted rows are discoverable by virtual cursor.
- **AR3 — Hidden spacers.** Spacer geometry has no accessible row/cell content, name, selection, current state, or focus stop.
- **AR4 — Focus retention.** One focused row may remain as the separately bounded focus island through range shifts; an owned detail subtree participates only under OQ6's admitted representation, counts, indices, positions, and focus contract. The island is released on blur/removal/return and never causes an unbounded range or silent focus move to the document body.
- **AR5 — Keyboard traversal.** Supported Table controls and row interactions remain reachable without requiring pointer scrolling or exposing thousands of tab stops.
- **AR6 — Announcements.** Scrolling does not generate live-region noise. Any explicit “row X of Y” claim uses the semantic row metadata rather than repeated status messages.
- **AR7 — Zoom, reflow, and fixed-height admission.** At supported zoom/text settings, the approved fixed-height mode cannot silently clip required content. Content or plugin output outside that mode follows the explicit rejection/full-render fallback chosen in OQ10.
- **AR8 — Evidence boundary.** DOM/accessibility-tree and real-browser keyboard tests prove static semantics, focus, and computed full-table metadata. Real AT is added only if an approved outcome depends on announcement, virtual-cursor advancement/discovery, or a recorded divergence under `spec:AST-009`; no such unmounted-row discovery claim exists in this draft.

## Design relationships

| Anatomy or state       | Design requirement                                                                                                    | Representation authority                                                                                                      | Module contract             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Mounted data row       | Looks and behaves like the same logical row in a non-virtualized Table.                                               | Existing row/cell targets and supported plugins                                                                               | FR2-FR16, AR1-AR8           |
| Spacer segments        | Preserve geometry without becoming visible/accessibility data anatomy.                                                | This module; not a public theme target                                                                                        | FR3-FR5, AR1-AR3            |
| Vertical viewport      | Preserves Table's shared scroll owner; nested owners obey nearest-effective-axis ownership and default chaining.      | `component:Table/DEC-1` and [`spec:AST-025`](../../../../../../docs/specs/AST-025/spec.md) FR18/FR19; integration pending OQ2 | FR3, FR11, PR3              |
| Focus island           | Keeps at most one focused row subtree mounted outside the ordinary window; detail participates only if OQ6 admits it. | This module plus the focused descendant/detail owner                                                                          | FR2, FR5, FR7, AR2, AR4-AR5 |
| Logical row appearance | Preserves striping parity and final-row dividers from absolute logical metadata.                                      | Parent Table appearance plus this module                                                                                      | FR15, ORD6                  |
| Unsupported tall row   | Uses the explicit rejection/full-render fallback rather than clipping under a fixed-height promise.                   | Parent/module boundary pending OQ10                                                                                           | FR14, AR7                   |

The module adds no new theming target. Data rows retain current Table targets. Spacer geometry
is structural implementation detail and cannot accept arbitrary theme paint or sizing.

## Parent and system relationships

- `component:Table` owns BaseTable's data/render phases, semantic body/header construction, canonical key reconciliation, row memoization, plugin ordering, core striping/divider appearance, existing body-relative `rowIndexStart`/`rowCount` behavior, and stable expansion/detail representation. This module requires an approved window/spacer/identity/appearance integration with FR5 full-table metadata. OQ9 keeps any shared correction for existing nonvirtualized paginated callers outside the additive module until a separate Table authority/compatibility decision approves it.
- `component:Table/DEC-1` keeps one Table-owned viewport with shared scroll behavior on the existing Scroll region and a private observed content box. [`spec:AST-025`](../../../../../../docs/specs/AST-025/spec.md) FR18 makes the nearest effective owner on the applicable axis win, permits orthogonal nesting, and requires deliberate same-axis nesting with chaining by default. FR19 lets Table integrate on its existing wrapper so column sizing, keyboard access, scroll shadows, sticky columns, and sticky headers share one viewport; it does not require a separate public ScrollableArea. An external owner is valid only when Table explicitly accepts and coordinates it. OQ2 chooses integration within these constraints, not a parallel scroll owner or overflow detector.
- `architecture:react-component-runtime` owns scroll/resize resource lifetime, current values, scheduling, node replacement, StrictMode replay, and cleanup.
- `architecture:public-component-api` and `spec:AST-002` require intent-named inputs and reject leaking an internal virtualizer or tuning knob without proven caller need.
- `spec:AST-009` and `spec:AST-020` own the evidence boundary. This draft claims computed accessibility-tree metadata for mounted rows, not AT discovery of unmounted rows.
- `useTableRowIndex` and every supported state plugin consume the same parent-owned canonical identity/logical offset rather than a caller-maintained duplicate. Expansion/tree/grouping/infinite-loading/custom-row behavior composes only if its owning current contract and OQ6 explicitly admit it; semantic detail rows then participate in FR5 counts/indices/positions without transferring representation ownership to virtualization.

## Verification map

| Contract                      | Verification                                                                                                                                                                    | Representative states                                                                                                          | Mutation or failure expectation                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1-FR6, FR14-FR15, ORD1-ORD6 | Deterministic range/geometry/identity/appearance tests plus Table renders inspecting native DOM, keys, spacer semantics, full-table ARIA, striping, and dividers                | Empty; first/middle/last window; focus island; duplicate keys; invalid height; striped/divided; admitted detail rows           | Visible rows drop, geometry drifts, DOM is invalid, keys recycle, ARIA excludes represented headers/detail rows, fallback fails, or appearance shifts.                                     |
| FR7-FR9, FR12, FR16, AR1-AR8  | Real-browser keyboard/accessibility-tree tests for scrolling, focus island, data replacement, zoom, controls, row index, and approved plugins                                   | Focus in row/control; detail only if admitted; offscreen scroll; sort/filter; sticky/selection/activation/index                | Focus/body/semantics/state/numbering fail, admitted detail counts/indices/positions are wrong, unmounted discovery is overclaimed, clipping is silent, or unsupported combos appear valid. |
| FR10, SSR/hydration           | Server markup plus hydration tests at explicit initial ranges and viewport changes                                                                                              | Empty, smaller/larger than initial, changed client viewport                                                                    | Full data renders then collapses, markup mismatches, initial rows disappear, or an Effect repairs known-wrong output.                                                                      |
| FR11, PR2-PR4, PR6; OQ2       | Fake viewport/scroll/resize harness under StrictMode, no-op rerenders, viewport replacement, unmount, and rapid scroll, plus real-browser shared-owner and chaining integration | Stable, changed and detached viewport; repeated scroll events; orthogonal/deliberate same-axis nesting; sticky columns/headers | Resources leak/churn, stale work commits, scroll resets, synchronous layout loops occur, owners diverge, an uncoordinated external owner is accepted, or chaining fails.                   |
| FR13, PR1, PR5                | Performance suite and browser trace recording visible/overscan/focus-island DOM, commits, frame work, and memory at 1k/10k/100k logical rows                                    | Core-only and every supported plugin/appearance combination                                                                    | Mounted rows scale with total data, focus retention is unbounded, budgets regress, or claimed support adds unbounded work.                                                                 |
| Public API and docs           | Public-subpath compile/contract fixtures for the OQ1-approved phases, component, or atomic props bundle; `.doc.mjs`, generated inventory, Storybook, and fixed-height recipes   | Mutable-compatible `T[]`, unique key, viewport, initial range, fixed-height mode, support matrix                               | Caller can omit/disagree on identity, readonly data mismatches Table, tuning leaks without admission, or docs imply unsupported behavior.                                                  |
| Compatibility scope; OQ9      | Representative nonvirtualized paginated `rowIndexStart`/`rowCount` fixtures alongside virtualized full-table metadata fixtures                                                  | Existing first/later pages and unknown totals; virtualized header/data and any admitted detail sequence                        | Additive virtualization silently changes existing callers or a shared correction proceeds without separate Table authority/compatibility approval.                                         |
| Structural ownership          | `pnpm check:knowledge`                                                                                                                                                          | Draft module and parent backlink                                                                                               | A missing, orphaned, misnamed, wrong-kind, or duplicate module record passes validation.                                                                                                   |

## Decision log

### DEC-1 — V1 is fixed-height row virtualization

**Reference:** `module:Table/useTableVirtualization/DEC-1`
**Decider:** pending owner approval

V1 must prove bounded DOM and semantic correctness from one positive finite total row block size under an owner-approved fixed-height Table mode. That mode defines text overflow, density/theme padding, custom content/controls, plugin output, precedence, diagnostics, and full-render fallback. Variable-height measurement remains a separate contract.

Rejected: silently measuring some rows, assuming an average height, clipping arbitrary Table content without an admitted mode, and calling hidden or `content-visibility` rows virtualized while they remain mounted.

### DEC-2 — Preserve native table semantics

**Reference:** `module:Table/useTableVirtualization/DEC-2`
**Decider:** pending owner approval

Virtualization must use valid semantic table structure and FR5 full-table metadata: represented headers and data are counted/indexed, as are represented semantic detail rows if OQ6 admits expansion; inaccessible spacers are excluded. The parent/detail owner defines detail shape and positions. Reuse of existing body-relative `rowIndexStart`/`rowCount` is unresolved in OQ9; any shared correction affecting nonvirtualized paginated callers requires separate Table authority/compatibility approval, not automatic correction by this additive module. Structural elements remain native rather than block-positioned or role-replaced.

Rejected: incomplete full-table totals, `display:block` on `<table>/<tbody>/<tr>`, absolutely positioned generic row divs, and spacer rows announced as data.

### DEC-3 — Stable keys; no cross-row DOM recycling

**Reference:** `module:Table/useTableVirtualization/DEC-3`
**Decider:** pending owner approval

V1 uses one validated stable unique canonical key for both window identity and Table reconciliation. The approved integration makes that key inseparable from its data whether OQ1 selects parent-owned phases, a dedicated component, or an atomic props bundle. Duplicate/invalid keys disable virtualization and fall back to normal full rendering in every build, with one development warning. Rows outside the approved mounted set may unmount, but no keyed DOM/component instance is reused for another logical key.

Rejected: separate window/Table extractors, optional identity that falls back to window-local indices, duplicate keys that recycle multiple rows, and recycling uncontrolled input, focus, or component state across logical rows.

## Open questions

- **OQ1 — Which parent integration represents windowing, identity, metadata, and spacers?** (`human-api`) Choose parent-owned phases, a dedicated component, or one atomic Table-compatible props bundle. Whichever shape is chosen must keep mutable-compatible `T[]`, the exact validated unique `idKey`, logical offset/count, and semantic spacer ownership together so callers cannot omit or disagree with identity/metadata. No hook or return-object shape is admitted by this question.
- **OQ2 — Who owns the vertical viewport?** (`human-api`) Decide a Table-owned block viewport versus a caller-supplied ref explicitly accepted and coordinated by Table, subject to `component:Table/DEC-1` and [`spec:AST-025`](../../../../../../docs/specs/AST-025/spec.md) FR18/FR19. Preserve the shared scroll owner for column sizing, keyboard access, scroll shadows, sticky columns, and sticky headers; no separate public ScrollableArea is required. The nearest effective owner on the applicable axis wins; orthogonal nesting may coexist, and any same-axis nesting is deliberate in Table's contract and preserves chaining by default. An arbitrary external wrapper does not satisfy ownership without explicit Table coordination; do not create a parallel owner or overflow detector.
- **OQ3 — What is the initial SSR range?** (`human-api`) Decide whether an initial row count is required, has a documented default, or derives from explicit server-known geometry. Full-render-then-collapse and empty-then-repair are rejected.
- **OQ4 — How is the bounded focus island represented?** (`human-design`) Define at most one discontiguous retained row and, only if OQ6 admits it, its owner-defined detail subtree, spacer segmentation, release on blur/removal/return, scroll/focus behavior, and what happens when another off-window row receives focus. Detail shape remains the parent/detail owner's, not virtualization's.
- **OQ5 — What happens when data order changes?** (`human-api`) Decide start-offset, focused/active-key, first-visible-key, or another scroll-anchor policy for sorting, filtering, insertion, deletion, and replacement.
- **OQ6 — Which plugins and core appearance modes compose in v1?** (`human-api`) Confirm sticky columns, selection, sorting, filtering, context menus, and `useTableRowIndex` with one logical offset. Decide whether activation, expansion, tree, grouped rows, infinite loading, custom rows, striping, and each divider mode are supported, constrained, or rejected with dedicated evidence. Activation requires its own approved current module contract before composition can be admitted; an open draft supplies neither capability nor authority. Expansion admission requires the parent/detail owner to define detail representation, full-table row counts, absolute indices and positions for every represented semantic detail row, fixed-height geometry compatibility, and bounded focus-island behavior under OQ4. Neither silently omitting semantic detail rows nor mentioning retained detail admits expansion.
- **OQ7 — Is imperative `scrollToRow` public in v1?** (`human-api`) Admit it only if callers need an operation beyond setting scroll position, and define canonical key/index, alignment, unavailable-row, focus, and data-not-loaded behavior.
- **OQ8 — What objective budgets gate completion?** (`human-api`) Approve mounted-row, focus-island, render, frame, and memory budgets at representative data sizes so “smooth” cannot substitute for evidence.
- **OQ9 — How does the parent integrate full-table ARIA metadata, and what is the public compatibility scope?** (`human-api`) Define represented header indices/count, data offsets, any OQ6-admitted semantic detail counts/indices/positions, and spacer exclusion. Decide whether a virtualized-only metadata path is sufficient or a shared correction is necessary before reusing body-relative `rowIndexStart`/`rowCount`. Any shared correction affecting existing nonvirtualized paginated callers requires a separately approved Table authority/compatibility decision that defines their output, docs, and migration. This additive module does not choose or authorize that global correction.
- **OQ10 — What exactly constitutes fixed-height mode?** (`human-api`) Define positive-finite validation, total block-size semantics, `textOverflow`, density/theme padding precedence, allowed custom renderers/interactive content/plugins, overflow diagnostics, and the explicit rejection or full-render fallback. Native row height is a minimum, so a numeric prop alone is insufficient.
- **OQ11 — How are striping and dividers made logical-position-aware?** (`human-design`) If supported, replace spacer-relative `:nth-child`/`:last-child` meaning with parent-supplied absolute parity/final-data-row state while preserving ordinary non-virtualized CSS behavior and middle-window pixels.
- **OQ12 — Is caller-configurable overscan admitted?** (`human-api`) Keep overscan internal unless two non-derivable caller situations prove an API need under `spec:AST-002`; if admitted, define semantic outcome, bounds, invalid values, default, and decision burden rather than exposing an engine-tuning knob.

## Content boundary

This record does not duplicate consumer signatures/examples, the parent Table pipeline,
general virtualizer algorithms, current usage audits, implementation steps, data-fetching,
column virtualization, or variable-height contracts. It links to their canonical owners.
