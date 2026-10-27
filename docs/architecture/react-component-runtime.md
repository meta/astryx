---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:react-component-runtime
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
owners: [cixzhang]
applies_to: [packages/core/src/, packages/lab/src/]
verified_by:
  [
    packages/core/src/Layer/useLayer.test.tsx,
    packages/core/src/utils/sharedResizeObserver.test.ts,
  ]
deciding_specs: [spec:AST-086/DEC-2, spec:AST-099/DEC-1, spec:AST-105/DEC-1]
---

# React component runtime architecture

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "react-runtime": [
      "INV1",
      "INV2",
      "INV3",
      "INV4",
      "INV5",
      "INV6",
      "INV8",
      "INV10",
      "INV11",
      "INV12",
      "INV13"
    ]
  }
}
```

## Purpose

Astryx components should preserve their documented behavior through render,
interaction, node replacement, lifecycle replay, and unmount. This record assigns
shared runtime roles to render, handlers, refs, Effects, external resources, and
private behavior seams.

It defines correctness and ownership boundaries. It does not ban React features or
require one implementation pattern whenever several preserve the same contract.

## System model

A component runtime has four distinct roles:

1. **Render derives output.** Props, state, and context determine current rendered
   semantics.
2. **Handlers process discrete intent.** Pointer, keyboard, handle, and other
   commands perform the work caused by one action.
3. **Refs retain non-rendering mutable data.** Refs may hold DOM nodes, resources,
   latest values, or other coordination data that does not itself drive output.
4. **Effects synchronize external systems.** Effects connect React state to
   browser APIs, subscriptions, timers, observers, network activity, and other
   systems whose lifetimes are outside render.

Component and family contracts continue to own public state semantics, controlled
and optimistic behavior, focus, announcements, gestures, and other user-facing
outcomes. This record owns only the shared React lifecycle boundary used to fulfill
those contracts.

## Boundaries and invariants

- **INV1 — Render starts from a valid state.** Rendered output MUST derive from
  current props, state, and context. A component MUST NOT render a known-wrong
  initial state and repair it in a follow-up Effect. State stores information that
  cannot be derived during render or directly from the current interaction. DOM
  nodes and whole DOM collections MUST NOT be stored in React state; store only the
  minimal rendering key or own the node through a ref.
- **INV2 — Discrete intent stays discrete.** Work caused by one user or imperative
  action MUST NOT be deferred to an Effect when the originating handler can perform
  it, including calling a consumer callback such as `onChange`, `onOpenChange`, or
  `onSave`: the callback fires from the handler that caused the change, never from
  an Effect reacting to the resulting state. Using the same state for rendered
  output does not make an Effect-owned copy of the action valid. Deferral MUST NOT
  delay, repeat, or couple the action to unrelated rendering.
- **INV3 — Effects synchronize external systems.** A new or changed Effect MUST
  name the external system it synchronizes. When setup acquires, installs, or
  starts a resource, cleanup MUST release that resource. Synchronization that
  acquires no resource MUST instead be idempotent and safe under dependency
  changes, node replacement, unmount, and StrictMode replay. Ordinary rerender
  synchronization MUST NOT duplicate consumer-visible callbacks or other one-time
  work.
- **INV4 — Mutable refs do not become hidden rendered state.** Refs MAY hold general
  non-rendering mutable data. A ref mutation MUST NOT be the sole source for a value
  later read to produce React-rendered output. A callback ref MAY synchronously
  update an owned DOM node when that DOM update is itself the observable operation
  and attach, detach, replacement, and consumer override behavior preserve the
  current contract. Ref-backed coordination MUST preserve the current component,
  family, accessibility, and API contracts.
- **INV5 — Resource ownership is complete.** Every listener, timer, animation frame,
  observer, request, subscription, and imperative browser resource has one declared
  lifecycle owner. Component- or node-owned resources are removed, aborted, or
  released when disabled, replaced, or unmounted. A document-owned singleton MAY
  persist across consumer gaps when current authority names that lifetime and
  tests prove one shared installation. A persistent singleton without current
  authority is an authority gap, not by itself proof of an implementation leak.
  Optional behavior SHOULD acquire local resources only while enabled.
- **INV6 — Node replacement is a lifecycle event.** A callback ref or other node
  owner handles attachment, `null` detachment, and replacement with another node.
  Cleanup for the old node completes before the new node becomes the active owner.
- **INV7 — Observation preserves one semantic owner.** When JavaScript behavior
  genuinely needs browser geometry, observation stores only the minimal React
  state needed for that behavior and follows INV5–INV6. A repeated row, item, or
  cell path MUST NOT create unbounded observer fan-out when one shared owner can
  provide the same browser fact.
- **INV8 — Behavior stays with its stable lifecycle owner.** Current component,
  family, interaction, and layer authority identifies the behavior owner and the
  documented replacement/composition seams; this record does not choose a new
  owner. A state machine, gesture, timing protocol, or interaction algorithm is
  owned by the component or primitive whose lifetime spans every documented
  replacement and composition seam. Replacing a render prop, slot, child, or
  visual subpart MUST NOT silently remove owner behavior. Internal hook or utility
  extraction is not required by this invariant.
- **INV9 — Broadcast identity follows the broadcast contract.** Context values and
  external-store snapshots MUST NOT change identity while the semantic broadcast
  payload is unchanged when that change would broadcast work to consumers. Public
  hook-result identity remains owned by `architecture:public-component-api` and
  the hook's current contract. Ordinary local objects and callbacks have no shared
  identity promise.
- **INV10 — Own-content announcements live in one module.** In
  `@astryxdesign/core`, announcing a component's own rendered content
  (`spec:AST-086` FR11) is done by one shared internal module, which is not
  exported; making it public needs `spec:AST-002` admission. Packages outside
  core cannot import it and keep one well-behaved Effect per adopter. Core
  adopting components hold no Effect, observer, timer, or
  listener of their own to detect page load, read rendered text, or write that
  announcement. The module follows INV3 and INV5.
- **INV11 — The on-screen keyboard has one owner.** In `@astryxdesign/core`,
  one shared internal hook in the keyboard module (`packages/core/src/keyboard/`)
  measures the on-screen keyboard, keeps the page
  from panning on focus, and dismisses the keyboard when a surface moves
  (`spec:AST-099`); it is not exported. The keyboard height and each keyboard
  change's transition (start time, resting value, curve) reach styles only as
  the hook's value and live only in the hook: each consumer applies them
  through a StyleX functional style on its own element, and no CSS custom
  property on the document root or a shared ancestor carries them. No Core
  component keeps its own visual-viewport listener for the keyboard. The hook
  publishes each keyboard change as one transition: a start time, a resting
  value, and a curve. Every Core consumer that rides the keyboard rides that
  transition with compositor animations, a translate to the resting value,
  never JavaScript per frame, and the hook makes at most one layout read per
  keyboard change. A component outside Core does not ride; it commits the
  resting value once. Packages outside Core cannot import the hook; a
  component there that responds to the keyboard keeps one listener that
  measures as `spec:AST-099` FR2 defines, keeps focus from panning as FR4
  does, blurs as FR5 does, applies the height through a functional style on
  its own elements, and follows INV3 and INV5. The hook follows INV3 and
  INV5.
- **INV12 — Size changes inside a container have one module.** In
  `@astryxdesign/core`, one internal module produces the size-change glide
  `spec:AST-105` defines. It measures the layout before and after a reported
  change and moves shifted content with a compositor-only translate played
  through the shared rectangle morph (`architecture:layer-runtime` INV15;
  `spec:AST-094` FR5); it never animates height. Its walk visits only the
  following element siblings at each ancestor level up to the area, through
  `parentElement` and `nextElementSibling`, descending only into an element
  with `display: contents`, so its cost grows with depth plus following
  siblings. Changes in one area in the same frame are measured together. A
  component reports a change through an internal, non-exported function that
  takes the `useAnimatedLayout` handle, so the handle stays member-free, and
  each moving element is one the page already renders
  (`architecture:component-style-authoring` INV7). The module follows INV3
  and INV5.
- **INV13 — One shared set of internal touch modules.** Core's touch
  behavior comes from one always-present set of internal gesture and touch
  modules: the gesture core, the recognizers, the arena, the animator, and the
  touch press recognizer. Components import them statically, and the bundler
  keeps one copy per page however many components use them. There is no
  install call, no public entry, and no public installed check; tests reset
  the modules through an internal hook only. A component's own touch logic is
  small glue in its own build over these modules. Where the primary pointer
  is fine, no recognizer attaches and no touch listener is registered
  (`spec:AST-094` FR19, FR24). The modules are not public exports and are not
  documented for consumers; Core and Lab components reach them through
  `@astryxdesign/core/internal/touch`, a subpath reserved for Astryx's own
  packages: undocumented, outside the compatibility promise, versioned in
  lockstep with Core, and limited by lint to Core and Lab (`spec:AST-017`
  FR21).

## Authoring guidance

The following are preferred techniques, not independent compatibility promises:

- Use an Effect Event when an external-system Effect needs a stable callback that
  reads the latest props or state without making those reads reactive. Do not use
  an Effect Event to hide a value whose change should resynchronize the system.
- Keep callback refs reference-stable when practical so React does not detach and
  reattach an unchanged node solely because the callback identity changed.
- Prefer CSS for presentational responsiveness. Style authoring owns when container
  queries, media queries, structural selectors, and other CSS mechanisms replace
  JavaScript observation.
- Reuse Astryx's shared observer owner when it supplies the required browser fact.
  Tooling owns the required import and enforcement; INV7 owns the runtime outcome.
- Give a separately nameable state machine, gesture, timing protocol, or
  interaction algorithm a private hook or pure utility when that creates a useful
  focused test seam. Small behavior inseparable from rendering may remain inline;
  do not extract a hook per callback.
- Do not add memoization ceremony without a measured broadcast boundary or a
  current identity contract.

Violating guidance becomes an architecture violation only when it crosses an
invariant above or another current owner.

## Controlled and optimistic state

`architecture:public-component-api`, component records, and family records own
controlled, uncontrolled, and optimistic semantics.

The runtime implementation MUST preserve that current owner:

- a controlled prop is not casually mirrored into a second source of truth;
- a separately named optimistic or pending value follows its current owner's
  applicable settlement and lifetime contract; undefined branches remain with that
  owner;
- callbacks distinguish requested intent from owner-accepted state; and
- whether controlled and uncontrolled ownership may switch after mount remains
  component-owned unless current shared authority says otherwise.

## DOM and imperative API boundary

React state owns rendered semantics. DOM reads are limited to browser-owned facts
such as geometry, focus, selection, event boundaries, native dialog or popover
state, and pointer capture, plus imperative browser operations on an owned node.
Component and API authority owns any narrower composition or introspection rule.

`architecture:public-component-api` also owns public ref admission and naming. A
component may expose both of these distinct surfaces when that authority admits
them:

- `ref` for the documented primary DOM element and its native capabilities; and
- `handleRef` for a component-defined semantic imperative API implemented with
  `useImperativeHandle`.

This runtime record requires only that either surface preserve lifecycle ownership
and current controlled-state semantics. It does not admit a handle, require handle
identity, or decide its members.

## Audit-row routing

This record supplies shared authority for:

- **C5, C6:** derived state and ref-backed hidden state through INV1 and INV4;
- **C19:** complete external-resource cleanup through INV5–INV6; and
- durable runtime outcomes from **C1, C9, C10, C16, C22** through INV1–INV3,
  INV5, and INV8.

It supplies a narrow runtime mechanism boundary informed by **C7–C8** through
INV7, while style authoring and tooling own CSS preference, the shared observer
API, and mechanical enforcement.

Other rows keep their canonical owners:

- **C2, C13:** public API, controlled semantics, public hook identity, and public
  ref/handle contracts belong to `architecture:public-component-api`, families,
  and component records;
- **C3, C17:** focus, announcements, analytics semantics, and focus-preserving
  visibility belong to accessibility, interaction, family, and component records;
- **C4, C11, C18, C21:** callback-ref preference, ref-read purity,
  presentational-component classification, and comment quality remain lint or
  contributor guidance unless a concrete invariant above is violated;
- **C12:** the applicable accessibility, layer, interaction, family, or component
  owner decides which existing primitive must be composed;
- **C14:** this record defines the React/DOM state boundary, while public
  composition and child introspection remain API/component-owned;
- **C15:** each registry or data source keeps its own canonical owner; and
- **C20:** numeric provenance belongs to style, token, component, or interaction
  authority according to the value's purpose.

## Change coupling

Focused runtime review triggers when a change adds or alters:

- an Effect, state mirror, ref mutation, or callback ref;
- a listener, timer, observer, request, subscription, or imperative browser
  resource;
- controlled or optimistic reconciliation mechanics;
- context or external-store broadcast identity; or
- ownership, lifetime, or observable behavior of a state machine, gesture, timing
  protocol, or interaction algorithm.

Review covers initial render, update, interruption, cleanup, node replacement,
unmount, and StrictMode replay where applicable. It also verifies representative
unchanged behavior through the current component, family, API, and accessibility
contracts.

## Owning code

- `packages/core/src/` — stable Core component and hook runtimes.
- `packages/lab/src/` — experimental component runtimes using the same lifecycle
  correctness boundary without receiving stable public API status.
- `packages/core/src/utils/sharedResizeObserver.ts` — current shared Core resize
  observation mechanism; tooling and utility tests own its concrete API.

## Deciding specs

- `spec:AST-086/DEC-2` — own-content announcements behave the same in every
  component that announces its own rendered content (INV10).
- `spec:AST-099/DEC-1` — one keyboard height for every component, kept
  internal and applied through functional styles (INV11).
- `spec:AST-105/DEC-1` — the size-change glide's public shape and behavior
  (INV12).

Component, family, API, accessibility, layer, interaction, and style records
remain authoritative for the other user-facing outcomes delegated above.

## Verification

Lint and focused tests are one-way evidence. A lint failure means the construct
violates the invariant that rule enforces. A passing lint run does not prove the
full runtime contract because many ownership, lifecycle, composition, and
observable-behavior predicates require review or runtime evidence. Likewise, a
focused test proves only its named behavior and mutation expectation; a green
component suite is not blanket conformance with every invariant.

| Invariant        | Evidence                                                                                                                                                                              | Failure signal                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1–INV2        | Initial-render and interaction tests                                                                                                                                                  | Output flashes a known-wrong state, or one action is delayed or repeated through an Effect                                                                                                                                                                                                                                                                                                                             |
| INV3, INV5       | StrictMode setup/cleanup and dependency-change tests                                                                                                                                  | Duplicate callback, leaked work, stale subscription, or missing resynchronization                                                                                                                                                                                                                                                                                                                                      |
| INV1, INV4, INV6 | Ref attach/null/replacement, DOM-in-state rejection, and old-node cleanup-before-new-attach mutations                                                                                 | A DOM node or collection enters state, old node remains active, cleanup misses replacement, or ref mutation changes semantics silently                                                                                                                                                                                                                                                                                 |
| INV7             | Real-browser geometry plus N-consumer observer-instance/subscription mutations                                                                                                        | Geometry is invalid, observer instances grow with repeated consumers, one unsubscribe silences peers, or cleanup removes another subscriber                                                                                                                                                                                                                                                                            |
| INV8             | Owner-observable behavior across documented composition replacement; optional focused internal mechanism tests                                                                        | Behavior disappears or changes owner when a documented subpart is replaced                                                                                                                                                                                                                                                                                                                                             |
| INV9             | Provider/external-store identity and render-count tests                                                                                                                               | Unchanged semantic payload changes identity, or snapshot identity creates a render loop                                                                                                                                                                                                                                                                                                                                |
| INV10            | Shared test over every adopter of the announcement module                                                                                                                             | An adopter holding its own Effect, observer, timer, or listener for its own-content announcement                                                                                                                                                                                                                                                                                                                       |
| INV11            | Source boundary check plus hook tests across StrictMode replay and unmount                                                                                                            | A second keyboard listener or measurement in Core; a consumer reading a CSS custom property on the root or a shared ancestor for the height; an export of the hook; a component outside Core measuring by a rule other than AST-099 FR2, or riding the keyboard; a listener left after unmount; a Core rider driven by JavaScript per frame or by its own transition; or more than one layout read per keyboard change |
| INV12            | Source boundary check plus real-browser tests on a throttled phone profile over a 10-level by 50-sibling tree and two changes in one frame                                            | A per-frame height or layout, a walk past the area or into a subtree other than `display: contents`, an element moved twice for one frame, an added element, or an exported reporting function fails                                                                                                                                                                                                                   |
| INV13            | Source boundary check plus bundle analysis of a page with several touch components, and real-browser tests on a throttled phone profile, under a fine pointer, and on a hybrid device | A second copy of a touch module on one page, a component bundling its own copy of a module's primitive, an `import()` of a module in a component, a public export or doc entry for the modules, an install call or installed check in the public API, a touch listener under a fine primary pointer, or an import of `@astryxdesign/core/internal/*` outside Core and Lab fails                                        |
