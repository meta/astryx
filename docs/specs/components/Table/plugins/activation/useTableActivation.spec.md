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

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | Candidate `useTableActivation<T>` hook returning one `TablePlugin<T>` from controlled `activeKey`, `onActivate`, and optional row eligibility. V1 has one press interaction model and consumes Table's canonical resolved row key rather than introducing a second extractor.                                                                                                                                                                                      |
| Behavior                | Eligible rows request activation from a primary pointer click or Enter/Space after earlier row handlers run. Cancellation, nested or portalled controls, repeated keys, and competing whole-row owners do not trigger duplicate activation; native row semantics remain intact.                                                                                                                                                                                    |
| End-user impact         | People can keep one current row visually anchored while it drives adjacent detail or preview content, without losing cell controls or other Table behavior.                                                                                                                                                                                                                                                                                                        |
| Builder impact          | Builders own the active key and response to activation. The plugin owns row-state reflection and one whole-row activation path; it does not own routing, detail content, or selection.                                                                                                                                                                                                                                                                             |
| Compatibility/readiness | Additive, unreleased module. This draft is not implementation authority. Canonical row identity, competing activation-owner enforcement, ineligible active-state treatment, and active-state paint require owner decisions before promotion.                                                                                                                                                                                                                       |
| Review checks           | Reject selection coupling, a second row-key extractor, duplicate keys activating multiple rows, implicit navigation, button/link roles on `<tr>`, default `aria-current`, hover activation, non-primary or repeated activation, missing Enter/Space metadata, clobbered or uncancellable handlers, activation from nested/portalled controls or an in-row selection gesture, active paint that fails on pinned cells, and plugin identity churn for stable inputs. |
| Governing rules         | `component:Table` FR9-FR12 and ORD1-ORD4 own plugin composition; `architecture:interaction-modality` owns shared input-modality rules; `architecture:public-component-api` and `spec:AST-002` own public caller burden; `spec:AST-009` owns accessibility-evidence escalation.                                                                                                                                                                                     |

This table is a review projection; the body below is authoritative.

## Intent

`useTableActivation` gives a data-driven Table one controlled current product-row state
for master-detail, preview, and inspector layouts. It consumes identity through the
parent dependency in OQ6, requests activation, reflects active state, composes with
existing row behavior, and keeps state visually coherent through pinned cells.

Activation means “this row currently drives adjacent product state.” It is not a
selected-set operation, a navigation promise, or focus ownership. Those distinctions
are part of the module contract rather than left to each product implementation.

## Compatibility and migration

- Released default preserved: `yes`; Table behavior remains unchanged unless the new plugin is supplied.
- Compatibility class: additive public hook, types, documentation, and examples.
- Migration decision: `module:Table/useTableActivation/DEC-1` after the remaining identity, ownership, eligibility, and active-presentation decisions are approved.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The public `useTableActivation` hook, its configuration, and the controlled active-row contract.
- Consumption of Table's canonical resolved row key, row eligibility, activation request boundaries, and active-state reflection.
- Composition with existing row handlers and first-party Table plugins, including existing-handler-first cancellation through `preventDefault`.
- Suppression of accidental activation from nested or portalled interactive content, non-primary clicks, repeated key presses, and active text selection.
- Primary-pointer and Enter/Space parity while preserving native row semantics, prior focus ownership, and visible focus.
- One whole-row activation owner; selection, expansion, tree controls, and other non-owning row behavior may compose without duplicate activation.
- Active-row paint, pinned-cell coherence, accessibility, performance, and evidence.

**Does not own / non-goals**

- Aggregate `TablePlugin` protocol, transform order, failure isolation, or plugin-array identity — owned by `component:Table`.
- Selection state, checkbox semantics, or `aria-selected` — owned by `useTableSelection` and its caller.
- Routing, URLs, link semantics, or `aria-current="page"` — owned by a navigation surface, not activation.
- Adjacent detail content, preview loading, prefetching, or focus movement — owned by the product or another module.
- Cell controls. Buttons, links, inputs, editable content, and portalled controls remain independently operable and do not activate their row as a side effect.
- Hover-driven activation. Hover may remain a visual enhancement, but v1 never changes controlled active state from pointer movement alone.
- Children-mode rows. The plugin pipeline applies to data-driven rows only.
- A new public theme target. The active row remains part of the existing `table-row` anatomy unless a separate theming decision proves another owner is necessary.

## Public API and concepts

The candidate public shape is:

```ts
export interface UseTableActivationConfig<T extends Record<string, unknown>> {
  activeKey: string | number | null;
  onActivate: (item: T, key: string | number) => void;
  getIsItemActivatable?: (item: T) => boolean;
}

export function useTableActivation<T extends Record<string, unknown>>(
  config: UseTableActivationConfig<T>,
): TablePlugin<T>;
```

Consumer docs own final signatures, defaults, imports, and examples after promotion.

| Concept              | Closed values or states                                     | Meaning                                                                                                | Default                                            | Owner                             | Stability                      |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | --------------------------------- | ------------------------------ |
| Active key           | Stable unique `string`, `number`, or `null`                 | Matches Table's one validated canonical row key; `null` means no active row.                           | Controlled `null`                                  | Caller through this module        | Candidate                      |
| Row eligibility      | Product row eligible or inert; synthetic group header inert | Distinguishes product activation from grouping controls before applying caller eligibility.            | Every product row eligible; group headers excluded | `module:Table/useTableActivation` | Parent distinction pending OQ7 |
| Activation request   | `(item, key)` callback                                      | Asks the caller to update controlled state; the plugin never mutates `activeKey`.                      | No implicit state update                           | Caller through this module        | Candidate                      |
| Activation inputs    | Primary pointer click, Enter, or Space                      | One press interaction model requests activation; hover and auxiliary clicks never change active state. | All three paths enabled                            | `module:Table/useTableActivation` | Candidate                      |
| Active presentation  | Inactive or active                                          | Reflects controlled state on the existing row anatomy and through pinned cells.                        | Inactive                                           | `module:Table/useTableActivation` | Unsettled                      |
| Selection/navigation | Independent                                                 | Activation neither changes selection nor claims a route, destination, or navigation role.              | Unchanged                                          | Their respective owners           | Required                       |

## Behavioral contract

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Basis                                                                    | Draft review state                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| FR1  | One mounted hook instance returns one stable `TablePlugin`, and each mounted row keeps a stable composed activation handler while controlled keys or current callbacks change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `component:Table` FR12 and PR1; existing stable-identity plugin evidence | Settled candidate                                            |
| FR2  | `activeKey` is fully controlled. Activation depends on the unapproved parent contract in OQ6: one explicit stable unique `idKey`, its resolved key and validity available to activation, and duplicate-key rows inert in all builds with one deduplicated development warning. Current Table derives keys but does not validate them or pass them to row transforms. The candidate compares `activeKey` with the resolved key using strict equality and emits that same key: a property-name `idKey` resolves `String(item[idKey])`, so `"42"` matches and `42` does not; a function preserves its returned string or number. Without `idKey`, activation is inert with one deduplicated development warning, not keyed by row index. No second extractor or activation-side coercion is added. | One row identity across parent and module                                | Parent API decision required                                 |
| FR3  | An eligible row whose validated canonical key equals `activeKey` exposes a stable `data-active` state and component-owned active presentation; all other rows remove both. No default `aria-current` or `aria-selected` is inferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Activation/selection/navigation boundary                                 | Settled candidate                                            |
| FR4  | An ineligible product row contributes no activation handler, keyboard affordance, active paint, or active-state attribute even if its key equals the controlled key, subject to OQ5. Synthetic `useTableGroupedRows` headers are always ineligible for product activation, including when an eligibility predicate returns true; their existing group toggle and disclosure button remain independent. Safe product/header distinction is an OQ7 parent dependency; grouped composition is not admitted until that boundary is enforceable.                                                                                                                                                                                                                                                     | Disabled interaction boundary                                            | Verify whether controlled active state should remain visible |
| FR5  | A primary pointer click, Enter, or Space calls `onActivate(item, key)` once. The module runs each earlier accumulated handler first, preserves its side effects, and stops before activation when that handler calls `preventDefault`; it never replaces a handler already present when its transform runs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Parent sequential plugin contract; proven interaction composition        | Settled candidate                                            |
| FR6  | An event originating in a nested button, link, input, select, textarea, editable surface, equivalent interactive role, or portalled control outside the row does not activate the row. Text selection suppresses activation only when the non-collapsed selection associated with that gesture intersects the activated row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Accidental-activation prevention                                         | Settled candidate                                            |
| FR7  | Each eligible row is a sequential focus stop by default and activates on Enter or Space while retaining native `<tr>` semantics and visible focus. An earlier plugin's explicit `tabIndex`, including `-1` for roving focus, remains authoritative; a programmatically focused row still activates. The row advertises `Enter Space` through composed `aria-keyshortcuts` metadata. Promotion evidence covers representative large unvirtualized tables because the default sequential path grows with mounted eligible rows.                                                                                                                                                                                                                                                                   | Proven keyboard model; WCAG 2.2 SC 2.1.1, 2.4.7, and 2.4.11              | Settled candidate                                            |
| FR8  | Only a primary-button click activates; auxiliary clicks remain available to earlier handlers. Keyboard auto-repeat never activates. Repeated Space remains default-prevented so holding it cannot scroll the page, while repeated Enter is ignored without claiming a browser default. Pointer hover never changes `activeKey` in v1.                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Proven press boundary; shared modality rules                             | Settled candidate                                            |
| FR9  | Activation is independent from selection, expansion, tree controls, context menus, sorting, and navigation. Non-owning plugins retain their handlers and controlled state. A product row has at most one whole-row activation owner; expansion configured with `hasRowClickExpansion` and future navigation are competing owners. Synthetic `useTableGroupedRows` headers remain grouping-owned and ineligible under FR4. OQ7 requires parent ownership enforcement and product/header distinction; plugin insertion order must not decide whether a group toggle also calls product `onActivate`.                                                                                                                                                                                              | Module boundary, single ownership, and plugin composition                | Parent enforcement decision required                         |
| FR10 | Active presentation uses a component-owned fallback on existing row anatomy. OQ3 owns the unresolved paint precedence across striping, hover, focus, selection's row wash, `hasRowHighlight`, and active state; no selected-plus-active combination is implementation-ready without that decision. Each admitted combination defines one effective fill/overlay for both normal and pinned cells and a distinguishable active cue independent of colour. `hasRowHighlight=false` continues to disable selection-owned wash, not selection semantics; whether activation replaces the current detail-panel background-reclamation use case remains an OQ3 decision. No theme-authored `active` state is implied.                                                                                 | Current private row overlay and theming-surface boundaries               | Human visual decision                                        |
| FR11 | Children mode, empty state, and rows excluded by upstream transforms remain unchanged. Any module-owned resource usage is bounded by mounted rows, fully released when the owning row or Table detaches, and produces no activation or global side effect after release.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Observable resource limits; implementation freedom                       | Settled candidate                                            |
| FR12 | For valid unique canonical keys, changing only `activeKey` does not replace the plugin array, row handlers, columns, or product data and does not React-rerender unrelated rows. At most the old active and new active mounted rows change their reflected state/presentation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Bounded-update performance requirement and parent row memoisation        | Settled candidate                                            |

### Transformation and precedence order

- **ORD1 — Eligibility before state.** Distinguish product rows from synthetic grouped headers through the approved OQ7 parent contract, then resolve product eligibility. Group headers remain ineligible regardless of the caller predicate; ineligible rows return prior accumulated row props unchanged.
- **ORD2 — Controlled state.** The OQ6 dependency supplies one validated canonical key. Compare it with `activeKey` using FR2's strict, type-preserving equality and emit the same key; never derive a second identity or infer active state from focus or a prior event. Missing explicit identity or duplicate-key rows are inert.
- **ORD3 — Existing handler.** Run the accumulated handler for that event before the module's request. A handler that calls `preventDefault` cancels activation without discarding its own side effects.
- **ORD4 — Event boundary.** Nested interactive descendants, portalled events outside the row, and a non-collapsed selection intersecting the activated row suppress the module request without suppressing descendant behavior; an unrelated selection elsewhere does not.
- **ORD5 — Accepted press.** After the prior handler and boundary guards, accept only a primary click or non-repeated Enter/Space. Repeated Space prevents scrolling without activating; hover and auxiliary clicks never activate.
- **ORD6 — Presentation.** Apply inactive or active state after eligibility while preserving prior classes, styles, refs, attributes, and children.
- **ORD7 — Parent pipeline.** Relative order with non-owning plugins remains the order supplied by `component:Table`; this module creates no private second pipeline. Competing whole-row owners follow the OQ7 parent enforcement outcome.

### Performance and resources

- **PR1 — Constant module overhead.** Canonical-key comparison, state reflection, and handler guards add O(1) module-owned work per relevant row update. The module invokes `getIsItemActivatable` at most once when resolving that row update; caller callback complexity is outside the module's guarantee and is measured separately by call count.
- **PR2 — Stable public identities.** The returned plugin object, Table's resolved plugin array, and mounted row activation handlers stay referentially stable across `activeKey`, callback, and eligibility-function changes while still observing their current values.
- **PR3 — Bounded active update.** For valid unique keys, changing only `activeKey` changes reflected state/presentation on at most the old active and new active mounted rows and does not React-rerender unrelated rows.
- **PR4 — Bounded lifetime.** Module-owned retained resources scale no faster than mounted rows, are released when their owning row/Table detaches, and leave no post-release callback or global side effect. Equivalent implementations that meet those observable bounds remain valid.

## Accessibility contract

- **AR1 — Native table semantics.** Body rows retain their native row role; the module does not claim button, link, option, or gridcell semantics it cannot fulfil.
- **AR2 — Keyboard parity.** Eligible rows are focusable by default, preserve an earlier roving-focus `tabIndex`, activate on Enter/Space, compose `aria-keyshortcuts="Enter Space"`, and keep visible unobscured focus without replacing native row semantics (WCAG 2.2 SC 2.1.1, 2.4.7, and 2.4.11).
- **AR3 — Nested and portalled controls.** Interactive descendants and portalled controls remain reachable and operable without activating the row (WCAG 2.2 SC 2.1.1).
- **AR4 — State honesty.** The module does not emit `aria-selected` or default `aria-current`; active presentation alone does not claim selection or navigation semantics.
- **AR5 — Non-colour state.** If active state communicates current position required to use an adjacent view, its focus/current treatment cannot rely on colour alone (WCAG 2.2 SC 1.4.1). The exact representation is blocked on OQ3.
- **AR6 — No hover-only activation.** Hover may enhance row paint, but it never changes active state; pointer, touch, and keyboard users share the press-owned activation outcome (WCAG 2.2 SC 2.1.1 and `architecture:interaction-modality` INV4).
- **AR7 — Proportionate evidence.** Unit, DOM, accessibility-tree, axe, and real-browser keyboard evidence prove static semantics, nested-control isolation, focus, and reflected state. Real AT is added only if an approved outcome depends on announcement, browse/virtual-cursor behavior, or a recorded AT/browser divergence, as required by `spec:AST-009`.

## Design relationships

| Anatomy or state     | Design requirement                                                                   | Representation authority                                           | Module contract    |
| -------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------ |
| Activatable row      | Communicates availability without replacing native table structure or cell controls. | This module plus `architecture:interaction-modality`               | FR5-FR9, AR1-AR3   |
| Active row           | Remains visually traceable through normal and pinned cells.                          | Component-owned fallback; public theme-state admission remains OQ3 | FR3, FR10, AR4-AR5 |
| Focused row          | Shows keyboard focus independently from controlled active state.                     | Shared focus rules and existing row anatomy                        | FR2, FR7, AR2, AR5 |
| Nested cell control  | Keeps its own interaction, focus, and semantic contract.                             | The nested component                                               | FR6, FR9, AR3      |
| Selection/navigation | Never inferred from activation.                                                      | Selection or navigation owner                                      | FR2, FR3, FR9, AR4 |

The default contract adds no public theme target or theme-authored `active` state. The module owns a component fallback and must propagate its effective overlay to pinned cells. OQ3 may admit an `active` state on the existing `table-row` target only if it defines the fallback, guaranteed paint properties, state precedence, and pinned-overlay projection required by `architecture:component-theming-surface`. A separate direct target still requires another theming decision.

## Parent and system relationships

- `component:Table` owns the aggregate `TablePlugin` protocol, canonical ordering, sequential transforms, failure isolation, and stable plugin-array identity. Its current contract does not promise validated canonical identity or key delivery to activation. OQ6 requires a separately approved parent addition for explicit stable unique `idKey` validation, resolved-key equality, and duplicate-key inertness; OQ7 requires a separately approved ownership and product/header distinction contract. This module neither supplies nor approves those missing parent contracts.
- `architecture:interaction-modality` owns cross-component keyboard/pointer modality rules; this module owns only their row-activation projection.
- `architecture:public-component-api` and `spec:AST-002` own additive API discipline and caller burden. The module exposes controlled product state rather than routing or data-fetching dependencies.
- `spec:AST-009` owns accessibility-evidence escalation. This module uses lower-layer semantic and browser evidence unless an approved outcome depends on assistive-technology behavior.
- `useTableSelection`, tree, expansion, context-menu, sticky-column, and future navigation modules retain their independent state and semantics.

## Verification map

| Contract                     | Verification                                                                                                                                                                                              | Representative states                                                                                                                                                                                                         | Mutation or failure expectation                                                                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1-FR4, FR11-FR12, PR1-PR4  | Public plugin/handler identity, controlled render/mutation/callback counts, invalid-key fallback, and resource-lifetime tests                                                                             | Active, inactive, `null`, eligible, ineligible, missing `idKey`, property-key `"42"` versus numeric `42`, function-returned numeric keys, duplicate resolved keys, grouped headers, callback/key changes                      | Plugin/handlers churn, duplicate-key rows activate, unrelated rows rerender, more than two valid-key rows mutate, callbacks overrun, or resources leak.                                                                                                     |
| FR5-FR9, ORD1-ORD7           | Unit/browser interaction tests with earlier handlers and selection, grouped-row headers, control-only expansion, `hasRowClickExpansion`, tree, sticky, context-menu, navigation-owner, and custom plugins | Primary/auxiliary pointer, Enter/Space, auto-repeat, prior `tabIndex`, grouped headers and product rows in both plugin orders, eligibility override, nested/portalled controls, in-row/unrelated text selection, cancellation | Handlers are replaced, callbacks fire twice, auxiliary/repeated/hover input activates, Space repeat scrolls, earlier focus ownership is lost, unrelated selection blocks activation, nested/portalled controls activate rows, or two whole-row owners fire. |
| FR10, AR5-AR6                | Real-browser screenshots in light/dark, striped, hover, pinned-column, keyboard-focus, touch emulation, and forced-colors states                                                                          | OQ3's complete selection/activation/`hasRowHighlight` matrix, selection-first and activation-first updates, focus/hover, light/dark, and normal/pinned cells                                                                  | Component fallback or approved theme state disappears under pinned cells, relies on colour alone, loses focus indication, or hover changes active state.                                                                                                    |
| AR1-AR7                      | Unit/DOM/accessibility-tree tests, axe, and real-browser keyboard automation; real AT only for an adopted AT-dependent outcome                                                                            | Native traversal in representative small and large unvirtualized tables, default/roving/programmatic focus, Enter/Space metadata and activation, nested link/button/input, portalled control, state update                    | Row semantics are replaced, Enter/Space is undiscoverable or unavailable, focus order becomes incoherent at representative scale, earlier focus ownership is lost, nested controls activate, or selection/navigation semantics are falsely exposed.         |
| Plugin composition           | Focused integration matrix plus existing Table selection/tree/expansion/sticky/context-menu suites                                                                                                        | Every supported first-party combination and custom row handler order                                                                                                                                                          | Enabling activation breaks another plugin, changes column order, or loses accumulated row props.                                                                                                                                                            |
| Public API and documentation | Public-subpath compile fixture including required explicit `idKey` and parent-supplied validated canonical row key, generated inventory, `.doc.mjs`, Storybook, and one recipe                            | Generic row type, controlled update, eligibility, duplicate keys, primary click, Enter/Space                                                                                                                                  | A second extractor or mode switch appears, duplicate behavior is undefined, the hook/types are unavailable, or docs imply hover activation.                                                                                                                 |
| Performance                  | Extend `Table.perf.test.tsx` with plugin/handler identity, render and DOM-mutation counts, eligibility-callback counts, stable no-op, and adjacent valid-key changes                                      | Large representative data, same key, adjacent key, callbacks changed                                                                                                                                                          | One key change replaces the plugin path, rerenders unrelated rows, mutates more than old/new rows, over-invokes eligibility, or exceeds budgets.                                                                                                            |
| Structural ownership         | `pnpm check:knowledge`                                                                                                                                                                                    | Draft module and parent backlink                                                                                                                                                                                              | A missing, orphaned, misnamed, wrong-kind, or duplicate module record passes validation.                                                                                                                                                                    |

## Decision log

### DEC-1 — Activation is controlled and independent

**Reference:** `module:Table/useTableActivation/DEC-1`
**Decider:** pending owner approval

Activation represents one caller-owned current product row. It depends on OQ6's parent validation and key projection, not a validation guarantee in current Table. The candidate requires explicit stable unique `idKey`, compares the resolved key with `activeKey` as specified in FR2, and emits the same key; missing identity and duplicate-key rows remain inert. Grouped headers do not become product rows under an eligibility override. The module never owns product state, selection, routing, focus, detail content, or prefetching.

Rejected: a second activation-specific key extractor, deriving activation from selection or focus, storing an internal fallback key, or combining row navigation and activation into one hook.

### DEC-2 — Preserve native row semantics

**Reference:** `module:Table/useTableActivation/DEC-2`
**Decider:** pending owner approval

Whole-row convenience keeps native semantic table-row structure. Eligible rows are focusable by default, preserve an earlier roving-focus `tabIndex`, advertise Enter/Space through `aria-keyshortcuts`, and activate from primary click, Enter, or Space without claiming button or link semantics.

Rejected: `role="button"` or `role="link"` on `<tr>`, pointer-only activation, and
implicit `aria-selected` or `aria-current`.

### DEC-3 — Active state uses existing row anatomy

**Reference:** `module:Table/useTableActivation/DEC-3`
**Decider:** pending owner approval

The module reflects active state through existing row anatomy, with one effective fill/overlay reaching normal and pinned cells. OQ3 owns the exact representation and precedence, including selection's wash and `hasRowHighlight`; neither selected-plus-active precedence nor a replacement for the detail-panel background-reclamation path is implied. A second target is not justified. Theme-authored `active` state is admitted only if OQ3 defines fallback, properties, precedence, and pinned projection.

Rejected: styling only transparent row backgrounds that disappear under pinned cells, implying that the current `table-row` target already accepts an undeclared `active` state, and adding a public `table-row-activation` target without an independent theme-author need.

### DEC-4 — Press owns activation and earlier handlers may cancel

**Reference:** `module:Table/useTableActivation/DEC-4`
**Decider:** pending owner approval

The module has one press interaction model. It runs the accumulated handler first, treats `preventDefault` as cancellation, and then accepts only a primary click or non-repeated Enter/Space outside nested or portalled controls and intersecting text selection. Repeated Space prevents page scrolling without activation. A product row has at most one whole-row activation owner; grouped headers remain grouping-owned and ineligible. OQ7 owns the missing parent distinction and enforcement contract.

Rejected: hover activation, replacing earlier handlers, activating after cancellation, and activating from auxiliary clicks or key auto-repeat.

## Open questions

- **OQ3 — How is required current state communicated?** (`human-design`) Decide the component-owned fallback, focus-versus-active precedence, non-colour cue, and any admitted `active` state on the existing `table-row` target. The decision must specify every state in the matrix below, including whether selected-plus-active uses selection-dominant fill with a distinct active cue or active-dominant fill with a persistent selection cue. `hasRowHighlight=false` removes selection wash while preserving selection semantics; it is not an activation disable flag. Decide whether an active row driving detail content replaces the current background-reclamation use case or needs another explicit caller choice. Each outcome must define the same effective paint on normal and pinned cells, including selection/active changes in either order. No active or selected-plus-active paint is admitted while this question remains open. An opt-in caller-supplied `aria-current` value, if warranted for genuine current-item sets, is a separate decision; default selection/navigation semantics remain forbidden.

  | Selection  | Activation | `hasRowHighlight` | Required outcome before admission                                                                                                                |
  | ---------- | ---------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
  | Unselected | Inactive   | Either            | Existing striping, hover, and focus treatment.                                                                                                   |
  | Selected   | Inactive   | `true`            | Existing selection wash and selection semantics on normal and pinned cells.                                                                      |
  | Selected   | Inactive   | `false`           | No selection-owned wash; selection semantics remain.                                                                                             |
  | Unselected | Active     | Either            | OQ3 defines active fill, non-colour cue, and focus/hover precedence independently of the selection flag.                                         |
  | Selected   | Active     | `true`            | OQ3 chooses selection-versus-active fill precedence and preserves distinguishable selection, active state, and focus on normal and pinned cells. |
  | Selected   | Active     | `false`           | OQ3 defines active paint without reintroducing selection wash; selection semantics remain.                                                       |

- **OQ5 — Should an ineligible product row matching `activeKey` remain visibly active?** (`human-api`) Decide whether caller eligibility governs interaction only or both interaction and controlled presentation for real product rows. This decision does not relax FR4's exclusion of synthetic grouped headers.
- **OQ6 — How does Table expose validated canonical row identity?** (`human-api`) Approve the missing parent-owned validation and key-delivery contract. Current Table resolves an index when `idKey` is omitted, `String(item[idKey])` for a property name, or the function's returned key; it does not validate uniqueness or deliver the key to `transformBodyRow`. The activation candidate requires explicit stable unique identity, FR2's strict resolved-key equality and same-key callback, inert missing/duplicate identity in all builds, and deduplicated development diagnostics. The approved parent record must own these additions and their compatibility; this module adds no activation-specific extractor or coercion.
- **OQ7 — How does Table enforce whole-row ownership and product eligibility?** (`human-api`) Approve the missing parent contract for distinguishing caller product rows from synthetic `useTableGroupedRows` headers and enforcing FR4's default header ineligibility. Group headers keep their grouping-owned click and disclosure-button paths; `hasRowClickExpansion` and future navigation compete with activation on product rows. Define deterministic rejection or neutralisation, development diagnostics, and production fallback for every admitted combination without making plugin insertion order select an owner. Grouping integration remains unsupported until its distinction and ownership boundary are enforceable; key prefixes or private marker inspection are not caller obligations.

## Content boundary

This record does not duplicate consumer signatures/examples, the parent Table plugin
protocol or ordering, shared input-modality rules, current usage audits, implementation
steps, or navigation/selection/prefetch contracts. It links to their canonical owners.
