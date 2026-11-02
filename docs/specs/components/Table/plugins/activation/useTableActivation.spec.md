---
schema_version: 3
template_version: 4
kind: module
id: module:Table/useTableActivation
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
    packages/core/src/Table/plugins/activation/useTableActivation.test.tsx,
    packages/core/src/Table/__tests__/TableActivation.a11y.chromium.spec.ts,
    packages/core/src/Table/Table.perf.test.tsx,
    scripts/check-knowledge.mjs,
  ]
parent_component: component:Table
references:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
    spec:AST-002,
    spec:AST-009,
  ]
---

# useTableActivation module contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `useTableActivation<T>` returns one `TablePlugin<T>`; its only configuration fields are controlled `activeKey`, `onActivate`, and optional `getIsItemActivatable`.                                                   |
| Behavior                | Eligible flat product rows request activation on primary click or Enter/Space after non-owning handlers; canonical identity, cancellation, descendant controls, and intersecting text selection gate the request.    |
| End-user impact         | One product row anchors adjacent detail or preview state without becoming selection, navigation, or focus ownership.                                                                                                 |
| Builder impact          | The caller supplies explicit stable unique `idKey`, controls the active key, and owns adjacent content; no second extractor, interaction mode, or theme state is public.                                             |
| Compatibility/readiness | Additive and unreleased. Draft choices are closed; actual owner review of this text and the parent additions, source implementation, and all implementation evidence remain pending.                                 |
| Review checks           | Reject implicit identity, multiple whole-row owners, non-flat opt-in, nested-control activation, competing paint writers, a colour-only active cue, pinned-cell divergence, or invented approval/evidence.           |
| Governing rules         | `component:Table` owns composition. Its FR16-FR21 and DEC-4/DEC-5 are required parent additions, not authority supplied by this draft; shared modality, public API, theming, and evidence rules retain their owners. |

This table is a review projection; the body below defines the draft contract.

## Intent

`useTableActivation` gives a flat data-driven Table one controlled current product row for master-detail, preview, and inspector layouts. It consumes parent-resolved identity, requests activation, and reflects state through existing row anatomy. Activation is neither a selected-set operation, a navigation promise, nor focus.

## Compatibility and migration

- Released default preserved: `yes`; the capability is opt-in and legacy callbacks retain their existing arguments and behavior.
- Compatibility class: additive unreleased hook; unsupported new-capability combinations are neutralised without disabling legacy plugins.
- Migration decision: `module:Table/useTableActivation/DEC-1` and DEC-5.

Consumer signatures, imports, examples, and migration instructions belong in the module's consumer docs. This draft is not implementation authority. Promotion requires actual owner review of the exact module and parent contract text; merged code, authored decisions, or successful checks do not substitute for approval.

## Ownership boundary

**Owns**

- Controlled activation, product-row eligibility, request boundaries, and module-owned active-state reflection.
- Primary-click and Enter/Space parity, existing-handler-first cancellation, and descendant/portal/text-selection isolation.
- Contributions to the parent row-paint resolver, the active cue, bounded updates, and evidence obligations.

**Does not own / non-goals**

- Aggregate plugin ordering, canonical identity validation, row-kind/admission metadata, whole-row ownership, render planning, viewport, and paint coordination: `component:Table`.
- Selection and `aria-selected` remain selection-owned; navigation-specific `aria-current` values such as `page`, `step` or `location` remain navigation-owned. This module owns only `aria-current="true"` identifying the eligible product row driving adjacent content; detail content and its loading remain caller-owned.
- Tree, grouped, expanded-detail, custom-row, or children-mode activation; hover activation; automatic focus movement or prefetching.
- A new public theme target or theme-authored `active` state in v1.

## Public API and concepts

The public hook returns `TablePlugin<T>`. `activeKey` accepts `string | number | null`; `onActivate(item, key)` returns `void`; optional `getIsItemActivatable(item)` returns `boolean`. There are no other v1 configuration fields. The caller never needs a second key extractor or DOM marker convention.

| Concept      | Closed values or states                         | Meaning                                                     | Default                            | Owner                              | Stability                        |
| ------------ | ----------------------------------------------- | ----------------------------------------------------------- | ---------------------------------- | ---------------------------------- | -------------------------------- |
| Active key   | Valid canonical string/finite number, or `null` | Strict equality to the parent key; `null` means inactive.   | Controlled                         | Caller through this module         | Unreleased; owner review pending |
| Eligibility  | Eligible or inert                               | Valid, admitted product row plus caller predicate.          | All admitted product rows eligible | This module and parent admission   | Unreleased; owner review pending |
| Request      | `(item, key)`                                   | Emits the same canonical key without mutating caller state. | No implicit update                 | Caller through this module         | Unreleased; owner review pending |
| Input        | Primary click, Enter, Space                     | Press-only activation; no hover or navigation mode.         | All three                          | This module                        | Unreleased; owner review pending |
| Presentation | Inactive or active                              | Existing anatomy, resolved fill, and non-colour marker.     | Inactive                           | This module; parent paint resolver | Unreleased; owner review pending |

## Behavioral contract

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Basis                           | Draft review state                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| FR1  | One mounted hook returns one stable plugin; mounted composed row handlers remain stable while reading current configuration.                                                                                                                                                                                                                                                                                                                                                                                                           | Parent identity contract; DEC-1 | Choice closed; implementation evidence pending            |
| FR2  | Activation requires explicit stable unique `idKey` and parent-supplied valid canonical identity. Property-name keys convert valid raw strings or finite numbers with `String`; function keys preserve their string/finite-number type. Comparison is strict and the callback emits exactly that key. Missing, invalid, duplicate, or unknown identity is inert in every build, with parent-owned deduplicated development diagnostics.                                                                                                 | Parent FR16; DEC-1              | Choice closed; parent review and evidence pending         |
| FR3  | Only an eligible row matching `activeKey` exposes module-owned `data-active`, `aria-current="true"` and active presentation. Other rows remove only those module-owned contributions. The current-item state expresses which row drives adjacent content, not selection or navigation; no `aria-selected`, `aria-current="page"` or replacement row role is inferred. A pre-existing incompatible current-state owner makes activation inactive for that row with a development diagnostic rather than overwriting its semantic state. | DEC-1/DEC-3                     | Choice closed; evidence pending                           |
| FR4  | Eligibility governs both interaction and presentation. A matching row that becomes ineligible loses activation handlers, module keyboard affordances, active attributes, fill, and marker; it preserves prior props and never mutates `activeKey`. Synthetic rows remain inert regardless of the predicate.                                                                                                                                                                                                                            | DEC-1/DEC-5                     | Choice closed; evidence pending                           |
| FR5  | A permitted primary click or non-repeated Enter/Space calls `onActivate` once after every composed non-owning handler. `preventDefault` cancels activation while preserving earlier side effects; accumulated handlers are not replaced.                                                                                                                                                                                                                                                                                               | Parent FR17; DEC-4              | Choice closed; evidence pending                           |
| FR6  | Nested native controls, including readonly controls, editable content, canonical interactive-role boundaries, and portalled events whose target is outside the row never activate it. A non-collapsed selection suppresses activation when any selected range intersects this row; an unrelated selection does not.                                                                                                                                                                                                                    | DEC-4                           | Choice closed; evidence pending                           |
| FR7  | An eligible row defaults to `tabIndex=0` only when earlier props omit it; explicit `-1` or other focus ownership survives. Programmatically focused eligible rows activate. `Enter Space` is composed with existing `aria-keyshortcuts`, without duplicate tokens or a replacement row role.                                                                                                                                                                                                                                           | DEC-2                           | Choice closed; evidence pending                           |
| FR8  | Auxiliary clicks, hover, and repeated Enter never activate. Repeated Space prevents scrolling without activation after the same boundary/cancellation gates. A permitted non-repeated Space prevents its scrolling default.                                                                                                                                                                                                                                                                                                            | DEC-4                           | Choice closed; evidence pending                           |
| FR9  | V1 admits only the parent's flat product-row render plan and one declared whole-row owner. Tree/grouped/detail/custom models and competing expansion/navigation ownership neutralise activation in all builds, independent of plugin names or insertion order, with deduplicated development diagnostics. Legacy behavior remains available.                                                                                                                                                                                           | Parent FR17-FR18; DEC-5         | Choice closed; parent review and evidence pending         |
| FR10 | One parent row-paint resolver applies the matrix below to normal and pinned cells. Selection wash dominates active fill when selected and `hasRowHighlight=true`; otherwise active fill dominates hover/striping. The active marker and focus indication remain independent. No second imperative background/overlay writer is permitted.                                                                                                                                                                                              | Parent FR21; DEC-3              | Choice closed; parent implementation and evidence pending |
| FR11 | Children mode, empty-state rows, synthetic rows, and excluded rows receive no activation additions. Detaching rows or the hook releases resources and leaves no callbacks or painting on a new row generation.                                                                                                                                                                                                                                                                                                                         | DEC-5; resource boundary        | Choice closed; evidence pending                           |
| FR12 | With valid unique keys, changing only `activeKey` does not replace plugins, handlers, columns, or product data or React-rerender unrelated rows. Only the old/new active mounted rows change activation reflection; an offscreen row reflects current state when mounted.                                                                                                                                                                                                                                                              | Bounded update contract         | Choice closed; evidence pending                           |

### Transformation and precedence order

- **ORD1 — Admission and eligibility.** Consume the parent's validated identity, product/synthetic kind, and flat/ownership admission before applying the caller predicate. Unsupported or ineligible rows preserve prior contributions and remove only activation-owned state.
- **ORD2 — Controlled state.** Compare the supplied canonical key strictly; emit that same key. Do not coerce in activation, use index fallback, or infer active state from focus or events.
- **ORD3 — Existing handlers.** Compose non-owning handlers first, preserving their side effects and cancellation regardless of named-plugin order.
- **ORD4 — Event boundary.** Check target containment, shared interactive/editable boundaries, and selected-range intersection before accepting a press. Reuse or extract the canonical shared guard; do not copy a selector catalog or import a complete navigation hook for it.
- **ORD5 — Accepted press.** Accept primary click and non-repeated Enter/Space once; apply FR8's Space default handling only for an otherwise eligible row gesture.
- **ORD6 — Presentation.** Contribute activation state to the parent's sole paint resolver; preserve prior refs, children, classes, styles, attributes, and focus ownership.
- **ORD7 — Parent pipeline.** Declare `rowModel: 'flat'` and `wholeRowOwner: 'activation'`; use parent sequential transforms and declarative ownership/admission, not a private pipeline or plugin-name inspection.

### Active, selection, and focus matrix

| Selection  | Activation | `hasRowHighlight` | Effective normal/pinned fill and cue                                                        |
| ---------- | ---------- | ----------------- | ------------------------------------------------------------------------------------------- |
| Unselected | Inactive   | Either            | Existing base, striping, hover, and independent focus treatment.                            |
| Selected   | Inactive   | `true`            | Existing selection wash; selection semantics remain.                                        |
| Selected   | Inactive   | `false`           | No selection wash; base/striping/hover and selection semantics remain.                      |
| Unselected | Active     | Either            | Component-owned active fallback above hover/striping, plus inline-start marker.             |
| Selected   | Active     | `true`            | Selection-dominant wash plus inline-start active marker; selection semantics remain.        |
| Selected   | Active     | `false`           | Active fallback plus marker; no selection wash is reintroduced; selection semantics remain. |

Every row applies the same result for selection-first and activation-first updates,
including toggling `hasRowHighlight` while both states are present. Focus is always
separate: a focus outline is never the active cue. The marker is a visible
inline-start decoration on existing row/cell anatomy, independent of colour,
with no extra data column, control, or public target. It follows text direction,
survives pinned-cell occlusion, and remains distinguishable in light, dark, and
forced-colors modes. `hasRowHighlight=false` reclaims only selection-owned wash;
it does not disable activation or change any selection semantics.

### Performance and resources

- **PR1 — Constant local work.** Key comparison, state reflection, and ordinary event guards add O(1) row-local coordination; selected-range checks scale with selected ranges, not dataset size. Resolve eligibility at most once per relevant row update. Parent full-dataset validation is not repeated by activation.
- **PR2 — Stable identities.** Plugin and mounted handlers remain stable across key/callback/predicate changes while observing their current values.
- **PR3 — Bounded active updates.** FR12's old/new-row bound applies to key-only updates; eligibility, data, selection, or theme changes retain their own scopes.
- **PR4 — Bounded lifetime.** Retained resources scale with mounted rows and are completely released on row/hook detach, including virtual row recycling.

## Accessibility contract

- **AR1 — Native semantics.** Rows retain native table roles; activation adds no button/link role or selection semantics. `aria-current="true"` on the active eligible row exposes its current-item relationship without a navigation-specific value. DOM and computed accessibility-tree checks verify that exposure; no particular spoken phrase or virtual-cursor behavior is promised.
- **AR2 — Keyboard parity.** Default sequential focus, earlier roving/programmatic focus, composed shortcuts, Enter/Space, and visible unobscured focus satisfy the admitted keyboard model. Representative large unvirtualized tables require browser focus-order evidence.
- **AR3 — Independent controls.** Native readonly controls, interactive-role descendants, editable content, and portals remain independently reachable and operable without row activation.
- **AR4 — State honesty.** Ineligible, missing or unmatched rows expose no module-owned current state; at most one eligible uniquely keyed row exposes `aria-current="true"`. Changing the controlled key moves both current-state exposure and the visible marker together; `activeKey=null` removes both. Existing selection/navigation semantics remain independently owned.
- **AR5 — Non-colour state.** The inline-start marker communicates active state independently of fill and focus in light/dark/forced-colors and normal/pinned states (WCAG 2.2 SC 1.4.1).
- **AR6 — Modality parity.** Primary pointer, touch-generated click, and keyboard share press-owned activation; hover never changes active state.
- **AR7 — Evidence layers.** Unit, DOM, accessibility-tree, axe, and browser evidence remain pending. Real AT is required only for an AT-dependent outcome or recorded divergence under `spec:AST-009`; this module introduces no announcement claim.

## Design relationships

| Anatomy or state | Design requirement                                          | Representation authority           | Module contract  |
| ---------------- | ----------------------------------------------------------- | ---------------------------------- | ---------------- |
| Activatable row  | Native structure and independent cell controls.             | This module; shared modality owner | FR5-FR9, AR1-AR3 |
| Active row       | Traceable marker and one coherent normal/pinned fill.       | DEC-3; owner review pending        | FR3, FR10, AR5   |
| Focused row      | Focus remains distinguishable from controlled active state. | Existing focus owner               | FR7, AR2, AR5    |
| Selection        | Wash opt-out and semantics remain independent.              | Selection owner; parent resolver   | FR9-FR10         |

### Design decisions

<!-- design-decisions:v1 -->

| ID  | Decision                                                                         | Intent or reason                                                                       | Applies to               | Allowed variation                                                                                             |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| DD1 | An active row has a visible inline-start marker independent of colour and focus. | Current detail-driving state stays identifiable beside selected rows and pinned cells. | All active eligible rows | Token/pixel tuning within existing anatomy; no extra column, control, target, or public `active` theme state. |

## Parent and system relationships

- `component:Table` FR16 and DEC-4 own full-dataset identity validation and deduplicated diagnostics. The new-capability path distinguishes function keys `0` and `"0"` with typed internal React keys; activation still emits the original canonical key. Legacy key behavior is unchanged.
- Parent FR17 supplies optional fourth `TableRowContext` to `transformBodyRow`: canonical `key`, `identityStatus`, `kind` (`product`, `synthetic`, `unknown`), `logicalIndex`, `logicalRowCount`, `headerRowCount`, and render context. FR18 owns pre-cell planning/flat admission. Only admitted flat rows have product kind; unsupported structural models disable flat capabilities before transforms and may expose unknown kind. Missing/unknown context or non-product kind leaves activation inert; legacy callbacks remain unchanged.
- Parent optional `rowModel: 'flat' | 'tree' | 'grouped' | 'detail' | 'custom'` and `wholeRowOwner: 'activation' | 'expansion' | 'navigation'` declarations decide admission without names/order. Undeclared custom body modifiers require an explicit parent-compatible declaration. This module does not invent its syntax.
- Parent FR19-FR21 and DEC-5 own the shared both-axis viewport, virtual full logical metadata, and sole paint coordination. Required source changes remain unimplemented evidence targets, not proof from existing parallel selection writers.
- V1 flat selection, sorting, filtering, sticky columns, context menus, and row indices compose; infinite loading and windowing compose jointly only after the relevant module and parent contracts receive actual owner approval. Non-flat legacy plugins retain their own behavior outside activation admission.
- Shared modality, public API, theming, and `spec:AST-009` evidence rules retain the owners listed in frontmatter. This draft does not approve any parent addition.

## Verification map

Every entry below is a required verification target, not completed implementation
evidence; the frontmatter file list retains those targets without claiming they exist or pass.

| Contract                    | Verification                                                                                             | Representative states                                                                                                                                                                     | Mutation or failure expectation                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1-FR4, FR11-FR12, PR1-PR4 | Pending activation unit suite and `Table.perf.test.tsx`: identities, counts, controlled state, lifetime. | Null/missing/invalid/duplicate keys; property `"42"` versus `42`; function `0` versus `"0"`; eligibility flips; recycle.                                                                  | Churn, coercion, multiple active duplicates, ineligible presentation, unrelated rerenders, more than two key-only mutations, or leaks fail. |
| FR5-FR9, ORD1-ORD7          | Pending unit/browser composition and shipped interaction-path tests.                                     | Primary/auxiliary click, Enter/Space/repeat; readonly/editable/portal controls; selection ranges anchored outside but intersecting the row; unrelated selection; cancellation.            | Replacing handlers, duplicate requests, repeated Space scrolling, nested activation, anchor-only suppression, or lost prior `-1` fails.     |
| FR10, DD1, AR5-AR6          | Pending canonical visual coverage and browser evidence.                                                  | All six matrix rows, both update orders, highlight toggles, hover/focus, light/dark/forced-colors, LTR/RTL, normal/pinned.                                                                | Order-dependent wash, hidden/colour-only marker, focus used as active cue, or pinned mismatch fails.                                        |
| AR1-AR7                     | Pending `TableActivation.a11y.chromium.spec.ts`, DOM/tree, axe, browser keyboard/touch.                  | Small/large flat tables; default, roving, programmatic focus; controls; active/null/ineligible/removed key, single current-state exposure, incompatible pre-existing current-state owner. | False roles/state, unavailable shortcuts, incoherent focus order, or descendant activation fails.                                           |
| Plugin composition          | Pending focused integration plus existing selection/sort/filter/sticky/context-menu suites.              | Both plugin orders; flat load/window combination; non-flat and custom modifiers; competing owners.                                                                                        | Admission by names/order, unsupported new capability, or lost legacy handlers/props fails.                                                  |
| Public API and docs         | Pending compile fixture, inventory, `.doc.mjs`, Storybook, and recipe.                                   | Three-field generic controlled config; explicit identity; all press paths.                                                                                                                | A second extractor, public mode/theme state, missing export, or hover promise fails.                                                        |
| Structural ownership        | `pnpm check:knowledge` structural check; implementation evidence is separate.                            | Draft module, parent backlink, schema 3/template 4.                                                                                                                                       | Missing, orphaned, duplicate, wrong-kind, or misnamed record must fail.                                                                     |

## Decision log

### DEC-1 — Controlled canonical identity and eligibility

**Reference:** `module:Table/useTableActivation/DEC-1`
**Decider:** pending owner review

One caller-owned active key matches and emits the parent's validated canonical key
strictly. Eligibility controls both requests and presentation without changing the
caller key. Missing, invalid, unknown, and duplicate identity is inert.
Rejected: a second extractor, index fallback, activation-side coercion, or deriving active state from selection/focus.

### DEC-2 — Native rows support press activation

**Reference:** `module:Table/useTableActivation/DEC-2`
**Decider:** pending owner review

Eligible rows retain native semantics, default sequential focus only when no earlier
focus owner exists, and composed Enter/Space shortcuts. Focus remains independent.
Rejected: row button/link roles, pointer-only operation, `aria-current="page"`, or inferred selection attributes.

### DEC-3 — Selection-dominant fill and a separate active marker

**Reference:** `module:Table/useTableActivation/DEC-3`
**Decider:** pending owner review

The six-state matrix fixes fill precedence; active state has an inline-start
non-colour marker and matching `aria-current="true"` on the native row. The same
controlled key drives both visual and computed semantic exposure, even when
selection wins the fill. One parent resolver coordinates selection, activation and
pinned overlays in either update order. No public `active` theme state is admitted
in v1. Navigation-specific current values and selection state remain independent.
Rejected: competing imperative paint writers, a focus-only active cue, or a new activation target/column.

### DEC-4 — Earlier handlers and gesture boundaries precede activation

**Reference:** `module:Table/useTableActivation/DEC-4`
**Decider:** pending owner review

Non-owning handlers run first and may cancel. Shared interactive guards, portal
containment, and selected-range intersection gate primary-click and Enter/Space.
Rejected: hover activation, copied selector catalogs, whole-navigation-hook imports, or anchor-only selection checks.

### DEC-5 — Flat admission and declarative ownership

**Reference:** `module:Table/useTableActivation/DEC-5`
**Decider:** pending owner review

The parent context and declarations admit flat product rows with one whole-row
owner. Non-flat, unknown custom-body, and competing-owner combinations neutralise
activation deterministically while preserving legacy plugin behavior.
Rejected: inferring row kind/ownership from plugin names, insertion order, key prefixes, or DOM markers.

## Open questions

None. The choices above remain draft and require actual owner review; this is not
an approval record. All implementation and behavior evidence remains pending.

## Content boundary

This record links rather than duplicates consumer examples, parent protocol, shared modality/theming rules, audit results, implementation plans, or product selection/navigation/detail/loading ownership.
