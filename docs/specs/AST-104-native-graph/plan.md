---
schema_version: 1
template_version: 1
kind: implementation-plan
id: plan:AST-104
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
spec: spec:AST-104
owners: [humbertovirtudes]
---

# Native Flow implementation plan

## Phases

### Phase 0 - Native contract and admission

- [x] Record complete native ownership and no XYFlow dependency.
- [x] Enumerate the fixed reference component/hook/utility/type closure.
- [x] Choose Astryx-idiomatic naming rather than source compatibility.
- [x] Check the current record inventory and open work for owner/ID collisions.
- [x] Map every reference capability and supporting type to a native owner.
- [ ] Validate and publish the complete native specification for owner review.
- [ ] Obtain exact-head approval before treating the contract as current.

### Phase 1 - State, geometry and public types

- [ ] Create `@astryxdesign/flow` without any XYFlow dependency.
- [ ] Author the admitted node, edge, connection, viewport, instance, change and
      event types with locally owned generics and consumer contracts.
- [ ] Implement change application, traversal, bounds, coordinates and all edge
      paths test-first from native behavioral requirements.
- [ ] Implement one controlled/uncontrolled runtime and subscription model.
- [ ] Prove no-op identity, replacement/deletion and concurrent-render safety.

### Phase 2 - Canvas and renderer family

- [ ] Implement `Flow`, `FlowProvider`, native node/edge renderers and registries.
- [ ] Implement handles, labels, markers, groups, connection lines and portals.
- [ ] Preserve custom renderer/data/event extensibility and layering.
- [ ] Verify static rendering and hydration with explicit geometry.

### Phase 3 - Connections, gestures and viewport

- [ ] Implement connect, validate, reconnect, completion and cancellation.
- [ ] Implement drag, pan/zoom, wheel/pinch, snapping, selection and viewport
      constraints, fit/bounds/center helpers and controlled viewport feedback.
- [ ] Cover capture loss, interrupted gestures, protected child controls,
      teardown and modality changes without stale state or leaked resources.

### Phase 4 - Complete native component family

- [ ] Implement all admitted controls, minimap/background/panel, node/edge toolbar,
      resize-control and edge-rendering variants.
- [ ] Compose existing Astryx primitives and shared interaction/focus behavior.
      Reuse the imperative announcement owner. Do not turn Calendar's regular
      grid focus model or DateInput's mouse-only wheel drag into a graph engine.
- [ ] Cover custom content, options, disabled states and same-instance ownership.

### Phase 5 - Complete hooks, utilities and type surface

- [ ] Implement every admitted hook against the native runtime, including
      `useFlow` imperative access and scoped reactive subscriptions.
- [ ] Implement all utilities and locally owned supporting type shapes.
- [ ] Preserve every required capability despite idiomatic name/type changes.
- [ ] Keep experimental APIs explicitly experimental and avoid redundant aliases
      whose only purpose is retaining a deprecated upstream name.
- [ ] Account for every reference identity with executable native evidence.

### Phase 6 - Independent release verification

- [ ] Run a packed consumer with no XYFlow package installed anywhere in its
      runtime, peer, dev/test, optional or transitive closure.
- [ ] Run positive/negative consumer type checks and mutation-sensitive tests
      through the shipped native entry points.
- [ ] Capture canonical visual and real keyboard/pointer/touch evidence.
- [ ] Verify themes/modes/nesting, accessibility, zoom, reduced motion,
      forced colors, server rendering and hydration.
- [ ] Measure small/large graph rendering, updates, subscriptions, geometry and
      viewport behavior; resolve measured regressions explicitly.
- [ ] Require zero missing, inert or unverifiable required capabilities before
      declaring the full system complete.

## Verification

| Phase | Contract                   | Evidence                                                                 |
| ----- | -------------------------- | ------------------------------------------------------------------------ |
| 0     | spec:AST-104/FR2, FR3      | Complete native mapping and exact-head admitted contract                 |
| 1     | spec:AST-104/FR1, FR4, FR8 | Dependency closure, native state/subscription, geometry and types        |
| 2     | spec:AST-104/FR5           | Actual native renderer and explicit-geometry server/hydration fixtures   |
| 3     | spec:AST-104/FR6           | Native connection, gesture, cancellation and viewport interactions       |
| 4     | spec:AST-104/FR7, FR9      | Complete component interaction and Astryx presentation evidence          |
| 5     | spec:AST-104/FR2, FR3, FR8 | Every required hook/utility/type mapped and independently tested         |
| 6     | spec:AST-104/FR10          | Packed consumer, browser/accessibility and two-size performance evidence |

## Status

- Current phase: 0.
- Naming direction is decided; the complete mapping and exact-head approval are
  still required before implementation.
- Delivery milestones partition the full system; they do not reduce its scope.
- No native implementation, complete parity, release or merge is claimed.
