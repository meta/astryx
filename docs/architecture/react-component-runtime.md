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
deciding_specs:
  [
    spec:AST-086/DEC-2,
    spec:AST-099/DEC-1,
    spec:AST-099/DEC-5,
    spec:AST-105/DEC-1,
    spec:AST-107/DEC-2,
    component:Markdown/DEC-7,
  ]
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
      "INV13",
      "INV15",
      "INV16",
      "INV17",
      "INV18"
    ]
  },
  "concerns": {
    "effects-listeners-observers": {
      "patterns": [
        "\\buse(?:Layout|Insertion)?Effect\\b",
        "\\b(?:add|remove)EventListener\\b",
        "\\b(?:Mutation|Resize|Intersection)Observer\\b"
      ],
      "claims": ["INV2", "INV3", "INV5", "INV6"]
    },
    "slot-presence": {
      "names": ["isRenderable"],
      "patterns": ["!= null && typeof [\\w.?]+ !==? ['\"]boolean['\"]"],
      "claims": ["INV16"]
    },
    "modality-tracking": {
      "names": [
        "useInteractionModalityTracking",
        "useInteractionModalityTrackingFor",
        "trackInteractionModalityIn"
      ],
      "patterns": ["addEventListener\\(\\s*['\"](?:pointerdown|keydown)['\"]"],
      "claims": ["INV16"]
    }
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
- **INV3 — Effects synchronize external systems.** Interaction logic lives in
  callbacks; no Effect reacts to interaction state. A new or changed Effect MUST
  name the external system it synchronizes. When setup acquires, installs, or
  starts a resource, cleanup MUST release that resource. Synchronization that
  acquires no resource MUST instead be idempotent and safe under dependency
  changes, node replacement, unmount, and StrictMode replay. Ordinary rerender
  synchronization MUST NOT duplicate consumer-visible callbacks or other
  one-time work. A latest-value ref, which event or gesture callbacks read for
  the latest committed prop or callback, goes only through Core's internal
  `useCommittedRef` hook (DEC-3), which writes it in a commit-phase insertion
  Effect: no per-site Effect copy and no render-time `ref.current =` write. Its
  second call shape, `useCommittedRefInto(ref, value)`, writes a ref declared
  earlier, with the same insertion-Effect timing and the same read rule, for
  callbacks declared above the value they read; it writes the ref its caller
  hands over. Such a ref is read only in event and gesture callbacks, never
  during render or in `useMemo`; render reads the value directly. One hook
  decides the timing once, and React has no built-in for it at Core's React
  floor. Where only an Effect calls the callback, `useEffectEvent` replaces it
  once that floor reaches 19.2. INV3 gap: about 45 Core and Lab hooks and
  components keep a latest-value ref in their own Effect, such as
  `useLayerDismissal`, `useHotkeys`, `useGestureRecognizer`, ComplexSelector,
  and Lab's NavigationStack.
- **INV4 — Mutable refs do not become hidden rendered state.** Refs MAY hold general
  non-rendering mutable data. A ref mutation MUST NOT be the sole source for a value
  later read to produce React-rendered output. A callback ref MAY synchronously
  update an owned DOM node when that DOM update is itself the observable operation
  and attach, detach, replacement, and consumer override behavior preserve the
  current contract. Ref-backed coordination MUST preserve the current component,
  family, accessibility, and API contracts. One exception is the owner's
  decision of 2026-11-09 (`component:Markdown/DEC-7`): Markdown's streaming
  fade-in spans MAY start from refs written during render. Text never comes from
  those refs, so a discarded render only shifts the fade spans.
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
- **INV11 — The on-screen keyboard has one owner.** In `@astryxdesign/core`, one
  shared internal hook in the keyboard module (`packages/core/src/keyboard/`)
  measures the on-screen keyboard, keeps the page from panning on focus, and
  dismisses the keyboard when a surface moves (`spec:AST-099`); it is not
  exported. The keyboard height and each keyboard change's transition (start
  time, resting value, curve) reach styles only as the hook's value and live
  only in the hook: each consumer applies them through a StyleX functional style
  on its own element, and no CSS custom property on the document root or a
  shared ancestor carries them. The keyboard module may also write, and remove,
  a CSS `translate` on the nearest fixed-position ancestor of a focused Core
  field when that ancestor does not fill the viewport, its layout box before any
  transform sits at the viewport's bottom edge, its own computed `translate`,
  the value the app sets and not the module's own, is `none`, and no CSS
  transition or animation of the app's own on its position is running when the
  module measures (the module's own ride does not count) (`spec:AST-099` FR9).
  The translate equals the distance from the ancestor's bottom edge as drawn,
  after the app's own lift, to the keyboard's top; the module measures it after
  each keyboard report, including a height change while focus stays in the bar,
  and each focus move, once the page's own listeners have run, so a bar the app
  already lifts gets none; when the moved box would not fit in the room above
  the keyboard, the module writes no translate if a scroller holds the field,
  and otherwise translates only as far as the focused field needs to clear the
  keyboard, never more than the container's own overlap, and rides the hook's
  one transition to that value like every Core rider. The read of that bar is
  the one exception to the hook's single layout read per keyboard change, stated
  below. The `translate` property composes with a `transform` the app sets. The
  module writes nothing on an ancestor whose own `translate` is not `none`, and
  nothing else on app elements. This exception is the owner's decision of
  2026-11-03 (`spec:AST-099/DEC-5`): a field docked in an app's own bottom bar
  rides the keyboard like one in a Core host. The module owns that write as an
  INV5 resource: it removes the translate once the keyboard hides after focus
  leaves the field, or once the field unmounts. A covered field starts its
  keyboard behavior from its focus handler, never from an Effect that reacts to
  focus (INV2), keeps the 10 CSS px clearance `spec:AST-099` FR9 states as the
  module's one `offset` constant, and supplies a scroller's missing scroll range
  as a bottom offset on the field's own element. No Core component keeps its own
  visual-viewport listener for the keyboard. The hook publishes each keyboard
  change as one transition: a start time, a resting value, and a curve. Every
  Core consumer that rides the keyboard rides that transition with compositor
  animations, a translate to the resting value, never JavaScript per frame, and
  the hook makes at most one layout read per keyboard change. A component
  outside Core does not ride; it commits the resting value once. Packages
  outside Core cannot import the hook; a component there that responds to the
  keyboard keeps one listener that measures as `spec:AST-099` FR2 defines, keeps
  focus from panning as FR4 does, blurs as FR5 does, applies the height through
  a functional style on its own elements, and follows INV3 and INV5. The hook
  follows INV3 and INV5.
- **INV12 — Size changes inside a container have one module.** In
  `@astryxdesign/core`, one internal module produces the size-change glide
  `spec:AST-105` defines. It measures the layout before and after a reported
  change and moves shifted content with a compositor-only translate played
  through the shared rectangle morph (`architecture:layer-runtime` INV15;
  `spec:AST-094` FR5) once Core has that morph; until then, the module plays
  its own compositor translate. It never animates height. Its walk visits only
  the changed element's ancestors up to the area and the element siblings on
  either side at each of their levels, through `parentElement`,
  `nextElementSibling` and `previousElementSibling`, descending only into an
  element with `display: contents`, and each level's walk stops at the first
  sibling outside the band the changes in a frame can bring into view (the
  area's visible part plus one viewport, or the changed elements' summed size
  if larger, above and below), so its cost grows with depth plus the
  siblings near the visible part, never with the length of a list. A block
  edge's reveal or conceal also moves the changed element's own child
  elements that the band can show, each on the glide's frames under a fixed
  clip on that element's box, so that cost grows with the changed size, never
  with the length of a list. Where the
  scroll container opts out of scroll anchoring, a change above the band
  walks forward to the band; that cost grows with the distance. In a
  container whose children run across the block direction (multi-column, a
  wrapping column flex box, or a column-flow grid), the walk runs through
  that level, a cost that grows with its children. Changes in
  one area in the same frame are measured together. A
  component reports a change through an internal, non-exported function that
  takes the `useAnimatedLayout` handle, so the handle stays member-free, and
  each moving element is one the page already renders, except a swap's one
  transient copy of the old content (`spec:AST-105` FR8). Two Core components hold their own handle
  for their own change: AppShell's content area and the SideNav rail, during a
  side nav collapse or expand (`component:AppShell` FR17, `component:SideNav`
  FR6), each making its copy through the swap. A resize controller also holds
  its own handle for a LayoutPanel's collapse and open, with no copy
  (`component:Resizable` FR8). Under a coarse pointer, a TreeList with no handle
  from the app holds its own for its own expand and collapse, with no copy
  (`component:TreeList` FR8). The module may also play
  caller-supplied frames on elements the page already renders, on the one
  shared motion, with no copy, releasing them when the motion ends; AppShell's
  content surface uses this to cover an expand's gap when its old wrap is not
  copied. The module also produces `spec:AST-105` FR9's edge reveal, the one
  edge reveal in Core: Collapsible, TreeList and Table's row expansion
  (`component:Table` FR15) use its block-end form, the SideNav rail
  uses its inline-edge two-state form and keeps only its labels' and icons'
  fades of its own, and a resizable LayoutPanel's pane uses it on collapse and
  open, moving the content on its moving edge's side, the resize controller measuring the pane's box before and after its
  collapse state commits and playing from the edge its direction names
  (`component:Resizable` FR8, `component:LayoutPanel` FR7). None of these is public
  (`architecture:component-style-authoring` INV7). The module follows INV3
  and INV5.
- **INV13 — One shared set of internal touch modules.** Core's touch
  behavior comes from one always-present set of internal gesture and touch
  modules: the gesture core, the recognizers, the arena, the animator, and the
  touch press recognizer. The recognizer family (its base, the arena, and the
  host) is the one place these modules use classes, and it uses no
  inheritance checks: a recognizer is told apart by its `kind` field, never by
  `instanceof`. (Implementation gap: recognizers carry no `kind`
  field yet.) Every other module, and every public layer, is built from
  `create…` factories, the velocity tracker included (implementation gap: it is
  still the `VelocityTracker` class), and no internal factory shares a public factory's name
  (`spec:AST-107` FR6). Core and Lab components use `spec:AST-107`'s public
  layer wherever it covers their job and reach these modules directly only for
  these known public-API gaps: press feedback timing; the Reduce Motion
  cross-fade constants; press tracking across a group of actions; the
  selection lock during a gesture; the presentation hold; the input hold;
  lift-from-trigger and the rectangle morph; custom recognizer relationships;
  the gesture host, velocity tracking, rubber band, and haptics; long press,
  which has no public factory yet; the spring and curve helpers and UIKit's
  measured tables; the touch presentation query; layout-change reporting
  (`spec:AST-105` FR1); a pull that a scroll area hands over only at its
  edge (`spec:AST-094` FR14, FR19); a snap-point drag whose release can
  dismiss its surface, judged by the use's measured projection (`spec:AST-094`
  FR36); a drag's own pointer and scroll filter, claim distance and begin
  gate, and a snap-point drag's own model of where a drag draws its element
  and where a release lands (a row's swipe: no mouse drag, UIKit's dead zone,
  tracking spring and release rule for a finger, and a full swipe reached by
  position only, `spec:AST-057` AR2, FR5); a drag drawn into one custom
  property that every part of its component reads (`spec:AST-057` FR2); a
  drag on one element that moves another (a sheet's handle and
  scrolling body move the sheet; its dim is the layer runtime's backdrop
  tint, `architecture:layer-runtime` INV14); the animator's jobs beyond the
  public handle: a motion role other than `springs.stateChange`
  (`spec:AST-094` FR4, `spec:AST-108` FR3), a closed-form curve played with
  retargets, a companion on its clock and a chosen start (`spec:AST-094` FR5,
  FR6), and the Reduce Motion substitution for a move, an entrance or an exit
  (`design:reduced-motion` DR1–DR3); the touch hit-area expansion; and List's
  reorder session, for a collection that adapts the reorderable object to its
  own values or whose rows are not `ListItem`s (`createReorderable`'s
  plain-element `attach`, `spec:AST-103` FR4b, is not built).
  Components import
  them statically, and the bundler
  keeps one copy per page however many components use them. A surface
  revealed by interaction that a component loads with `import()` under
  `architecture:component-import-boundaries` INV1 imports these modules
  statically too; the bundler still keeps one copy per page. That `import()`
  targets the surface module, never one of these modules, and it is not a
  component lazy-loading its own touch code (`spec:AST-080` DEC-5). A touch
  behavior that a caller opts into and that carries a large resource cost
  comes through a public constructor whose module statically imports the
  modules that behavior runs on; the component imports none of those, so
  only an app that imports the constructor ships them
  (`architecture:public-component-api` INV19). `Item`'s swipe actions come
  from `createSwipe` (`spec:AST-057` FR10): `Item` and `ListItem` import
  none of the swipe modules — the gesture core, the animator, the panels'
  rendering, and the row's gesture code — while `Item` keeps using the touch
  modules for its other jobs, such as press feedback. The only swipe code in
  `Item` is its deprecated path, serving its deprecated `swipeActions` and
  `swipeBehavior` props only until they leave in 0.8.0 (`spec:AST-057`
  DEP-0017, CLN-0025): the released loader, the one `import()` of swipe code;
  the released row style; the role gate and the `commit` warning; the bridge
  the loaded layer fills, the click guard, and the event forwarders into that
  bridge; and the coexistence diagnostic. There is no
  install call, no public entry, and no public installed check; tests reset
  the modules through an internal hook only. A component's own touch logic is
  small glue in its own build over these modules. The gesture host attaches for
  every pointer, with no touch-only query; under a fine pointer only a component that
  uses a gesture listens (`spec:AST-094` FR19, FR24, FR43). The gesture host, press feedback, page hold, finger-scroll watch and click guard hear document-wide input through one capture-phase listener per event type on the window, present while a subscriber needs it. They run in subscription order, before any document or element listener; it is passive unless a subscriber cancels the event. The modules are not public exports and are not
  documented for consumers; Core and Lab components reach them through
  `@astryxdesign/core/internal/touch`, a subpath reserved for Astryx's own
  packages: undocumented, outside the compatibility promise, versioned in
  lockstep with Core, and limited by lint to Core and Lab (`spec:AST-017`
  FR21). The finger-scroll watch's hook, `useFingerScroll`, is on that
  subpath: it reports whether a scroller's scroll is a finger's, now or at a
  past time, and, through `onEnd`, when that scroll ends. `timing`, UIKit's
  measured timing table, is on that subpath for Lab components that play the
  same measured motion.
- **INV15 — The animator animates a number.** The animator has a value mode:
  it plays a number, such as a count or a chart value, on the same timing as its property channels: theme motion tokens for a program-started change, and measured springs only where `spec:AST-094` FR45 keeps them, and hands the value to an `onUpdate`
  callback each frame for the component to format and write. The component owns
  the change size past which it swaps to the new value instead of counting, so
  a jump from twelve to over a million does not spin. Under reduced motion the
  new value is written at once on any pointer, as an in-place value change
  (`design:reduced-motion` DR2). It
  announces nothing: where the component's own record announces the value,
  only the final value is announced, never the values between. Number formatting stays
  with the caller. The value mode is part of the animator, adds no module, and
  is internal (`spec:AST-017` FR21).
- **INV16 — A shared concern is extended in its owner and called once.** In
  `@astryxdesign/core`, a concern Core already owns in a shared hook or utility
  is extended there; a component calls it once and adds no effect, listener, or
  tracker of its own for that concern. Slot presence is one such concern, owned
  by `isRenderable`: a `ReactNode` slot whose value is `null`, `undefined`,
  `true`, `false`, or `''` renders nothing of its own, with no wrapper, lane,
  border, or separator, exactly as when the slot is omitted, and an element the
  slot would name, such as a tree its header labels, keeps the name it has when
  the slot is omitted. `0` and
  every other value are content and render as React renders them. RichText's
  editor and toolbar slots use the same owner. A component record that fixes a
  different emptiness test for one slot, such as an empty-state rule, governs
  that slot; numeric counts and plain string fields are not slots. (Known
  implementation gaps include: Core slots that still test presence with a
  converted truthiness guard such as `!!value` or `Boolean(value)`, a
  bare nullish check, or a `??` default replacement do not yet follow this
  clause: they may draw a wrapper or lane for `''`, `false`, or `true`, drop
  `0` or render it as a stray `0` outside its slot, or show nothing instead
  of their default for `''`, `false`, or `true`; for example, TopNavItem
  `children` of `''` leaves its link without an accessible name, and an empty
  List `header` or Spinner `label` gives the list or the status an empty name;
  Dialog calls
  `useInteractionModalityTracking()` and also keeps its own Effect that tracks
  modality in a second document; MobileNav keeps its own page scroll lock Effect
  instead of `useScrollLock`; BottomSheet's gestures and mobile keyboard,
  DateInput's month scroller, DropdownMenu's overflow check, Layer positioning,
  Popover, and Table's sticky columns each keep their own `ResizeObserver`
  beside `sharedResizeObserver`; and other Core sites keep their own
  `MutationObserver` beside `sharedMutationObserver`.)
- **INV17 — Render stays pure.** A component never writes `ref.current` during
  render, except a lazy one-time initialization. A render React discards would
  otherwise leave an uncommitted value. A latest-value ref uses
  `useCommittedRef` or its `useCommittedRefInto` call shape (INV3, DEC-3).
  Exception: Markdown's streaming fade-in refs (`component:Markdown` DEC-7,
  INV4) stay render-time writes. INV17 gap: three sites read a latest-value ref
  during render or in `useMemo` instead of the value. INV17 gap:
  `useTableSortable`'s header reads the current sort from a ref, because its
  plugin is documented and tested as referentially stable; fixing it needs a
  Table API choice. INV17 gap: about 70 components write a latest-value ref
  during render, such as ChatComposerInput, Slider, and `useTooltip`. INV17 gap:
  about 18 render-time reads of a previous value; these are not latest-value
  refs. ToastViewport renders ToastRefSync, which writes through
  `useCommittedRefInto`, before a fragment that holds its children, so a child's
  layout cleanup, an unmount's included, reads the committed list. INV17 gap:
  ToastViewport writes its toast list during render.
- **INV18 — Layout is read as little as possible.** Placement uses CSS
  (anchor positioning, container queries, logical properties) instead of
  measuring in JS, as `architecture:component-style-authoring` INV2 prefers. A
  per-frame, scroll or resize path reads no layout, except a read a current
  clause requires there: `architecture:layer-runtime`'s placement re-reads,
  INV11's keyboard read, INV12's and `component:Resizable` FR8's
  before-and-after measurement, and the reorder drag's scroll read: during a
  reorder drag, the engine reads its scroller's scroll offset once per frame
  after a scroll it didn't cause, before its writes. Each such read happens
  in one batched measurement pass per change, never interleaved with writes.
  A read is one
  measurement pass: a remaining read names its reason in a comment and happens
  once per change, not per frame, or as the before-and-after pair a current
  clause requires. INV11's keyboard hook, which makes at most one layout read
  per keyboard change, is one instance. (Known implementation gaps include: the
  chat stream scroll hook reads scroll geometry on every scroll event, and
  about 49 Core source files that call `getBoundingClientRect` are not yet
  checked against this rule.)

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
- `packages/core/src/hooks/useCommittedRef.ts` — one internal hook with two call
  shapes, beside the internal `useIsomorphicLayoutEffect` (INV3, INV17, DEC-3).
  `useCommittedRef<T>(value: T): { readonly current: T }` returns a read-only
  ref whose `current` is written only in a commit-phase insertion Effect.
  `useCommittedRefInto(ref, value)` writes a ref declared earlier, with the same
  insertion-Effect timing and the same read rule, for callbacks declared above
  the value they read; it writes the ref its caller hands over. Its comment
  reads: "Stores values only. Refs to DOM nodes are not attached yet when this
  runs." Internal: never in `hooks/index.ts` or the package entry; Lab imports
  both from `@astryxdesign/core/internal/committed-ref`, as it reaches other
  Core internals.

## Deciding specs

- `spec:AST-086/DEC-2` — own-content announcements behave the same in every
  component that announces its own rendered content (INV10).
- `spec:AST-099/DEC-1` — one keyboard height for every component, kept
  internal and applied through functional styles (INV11).
- `spec:AST-099/DEC-5` — every Core field that brings up the keyboard stays
  above it with no prop, and a field docked at the bottom rides it, moving an
  app's bottom-docked fixed container too (INV11).
- `spec:AST-105/DEC-1` — the size-change glide's public shape and behavior
  (INV12).
- `spec:AST-107/DEC-2` — factories under every hook, the class and
  public-name rules, and the known public-API gap list (INV13).
- `component:Markdown/DEC-7` — Markdown's streaming fade-in spans may start
  from refs written during render (INV4).

### DEC-3 — Latest-value refs use one shared internal hook

**Decider:** `cixzhang`, `2026-11-11`

The owner chose option A, "one shared internal hook (useCommittedRef)":
latest-value refs use one shared internal hook, `useCommittedRef<T>(value: T): {
readonly current: T }`, in `packages/core/src/hooks/`. It returns a read-only
ref updated to the committed value whose `current` is written only in a
commit-phase insertion Effect, never during render. Its second call shape,
`useCommittedRefInto(ref, value)`, writes a ref the caller declared earlier,
with the same timing (INV3). One hook gives every component the same commit-safe
timing, and one place to adopt `useEffectEvent` at React 19.2 for callbacks that
only an Effect calls. No existing module does this: `useIsomorphicLayoutEffect`
only picks the Effect, and the per-component copies it replaces each write the
ref in their own Effect or during render.

The owner asked whether it is safe under concurrent rendering. It is: a
commit-phase write survives a render React drops, a render-phase write does not,
and `useEffectEvent` needs React 19.2 or later. The insertion Effect runs before
every layout-Effect setup in the same commit, so each of those reads the new
value (a descendant's layout-Effect cleanup runs earlier, the case INV17's
ToastRefSync placement note covers); server rendering keeps the initial value;
and it works on React 18 and later. It runs before refs attach, so it stores
values only, never DOM nodes.

Rejected: a one-line Effect per component, which repeats the same code in every
component and keeps the render-time writes INV17 forbids easy to reintroduce.

Component, family, API, accessibility, layer, interaction, and style records
remain authoritative for the other user-facing outcomes delegated above.

## Verification

Lint and focused tests are one-way evidence. A lint failure means the construct
violates the invariant that rule enforces. A passing lint run does not prove the
full runtime contract because many ownership, lifecycle, composition, and
observable-behavior predicates require review or runtime evidence. Likewise, a
focused test proves only its named behavior and mutation expectation; a green
component suite is not blanket conformance with every invariant.

| Invariant             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Failure signal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1–INV2             | Initial-render and interaction tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Output flashes a known-wrong state, or one action is delayed or repeated through an Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| INV3, INV5            | StrictMode setup/cleanup and dependency-change tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Duplicate callback, leaked work, stale subscription, or missing resynchronization                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| INV3 (ref sync)       | `pnpm review:pre` item j flags an Effect that only copies a value into a ref; review accepts a latest-value ref only through `useCommittedRef` or `useCommittedRefInto`, read in an event or gesture callback, never during render or in `useMemo`. Item j also flags a committed ref read during render or in `useMemo`, with tests in `scripts/lib/pre-review-findings.test.mjs`                                                                                                                                                                                                                                             | A per-site Effect or render-time write that keeps a latest-value ref in place of `useCommittedRef`, or a read of one during render or in `useMemo`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| INV1, INV4, INV6      | Ref attach/null/replacement, DOM-in-state rejection, and old-node cleanup-before-new-attach mutations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | A DOM node or collection enters state, old node remains active, cleanup misses replacement, or ref mutation changes semantics silently                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| INV7                  | Real-browser geometry plus N-consumer observer-instance/subscription mutations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Geometry is invalid, observer instances grow with repeated consumers, one unsubscribe silences peers, or cleanup removes another subscriber                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| INV8                  | Owner-observable behavior across documented composition replacement; optional focused internal mechanism tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Behavior disappears or changes owner when a documented subpart is replaced                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| INV9                  | Provider/external-store identity and render-count tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Unchanged semantic payload changes identity, or snapshot identity creates a render loop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| INV10                 | Shared test over every adopter of the announcement module                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | An adopter holding its own Effect, observer, timer, or listener for its own-content announcement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| INV11                 | Source boundary check plus hook tests across StrictMode replay and unmount                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A second keyboard listener or measurement in Core; a consumer reading a CSS custom property on the root or a shared ancestor for the height; an export of the hook; a component outside Core measuring by a rule other than AST-099 FR2, or riding the keyboard; a listener left after unmount; a translate left on an app element after the keyboard hides once focus has left the field, or after the field unmounts; any other write on an app element; a translate on a container whose layout box is not at the bottom edge, that fills the viewport, or whose own `translate` is not `none`; a translate on a container whose position the app is animating with CSS when the module measures; on a docked container too tall to fit above the keyboard once moved (a full-height side drawer, a pane below a fixed header), a translate when a scroller holds the field or one larger than the focused field needs to clear the keyboard; a translate measured before the page's own keyboard listeners run; a covered field deciding its keyboard behavior in an Effect that reacts to focus; a Core rider driven by JavaScript per frame or by its own transition; or more than one layout read per keyboard change beyond the docked bar's one read INV11 names |
| INV12                 | Source boundary check plus real-browser tests on a throttled phone profile over a 10-level by 50-sibling tree and two changes in one frame                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A per-frame height or layout, a walk past the area or into a subtree other than `display: contents`, an element moved twice for one frame, an added element other than a swap's one transient copy, that copy left after the swap ends, an exported reporting function, a slide that moves a child outside the band, or a moving clip on an element whose parts slide fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| INV13                 | Source boundary check plus bundle analysis of a page with several touch components, and real-browser tests on a throttled phone profile, under a fine pointer, and on a hybrid device                                                                                                                                                                                                                                                                                                                                                                                                                                          | A second copy of a touch module on one page, a component bundling its own copy of a module's primitive, an `import()` whose target is one of these modules, other than `Item`'s released loader for its deprecated swipe props, a swipe module (the gesture core, the animator, the panels' rendering, the row's gesture code) imported by `Item` or `ListItem`, swipe code in `Item` other than its deprecated path (that loader, the released row style, the role gate, the `commit` warning, the bridge, the click guard, the event forwarders, and the coexistence diagnostic), or any of it outside the deprecated path, a public export or doc entry for the modules, an install call or installed check in the public API, a gesture listener in a component that uses no gesture, or an idle document listener outside a press other than the one shared press controller and the one stray-click swallower, an import of `@astryxdesign/core/internal/*` outside Core and Lab, a class outside the recognizer family, an `instanceof` check on a recognizer, an internal factory with a public factory's name, or a direct module import for a job the public layer covers fails                                                                                 |
| INV15                 | Unit tests of the animator's value mode and real-browser proofs of its adopters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | A value off its channels' timing (the theme's tokens for a program-started change, a spring only where `spec:AST-094` FR45 keeps one), a count past the component's swap size, a count or cross-fade under reduced motion with a coarse or a fine pointer, an intermediate value announced, or a public export fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| INV16                 | Review of each Core component that handles a concern Core owns in a shared hook or utility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A Core component that keeps its own effect, listener, or tracker for that concern fails, whether or not it also calls the hook or utility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| INV16 (slot presence) | `no-nullish-jsx-guard` strict lint over Core and RichText, with no baseline, and `no-truthy-jsx-guard` strict lint over Core, with no baseline; both catch inline guards only, so review also checks for a presence test hoisted into a variable, converted (`!!value`, `Boolean(value)`), made by an early return or a `??` default, or passed through a prop spread, which the lints pass; empty-slot tests that pass `''`, `false`, `true`, and `null` and compare with an omitted slot, plus `0` as content, in Item, MetadataList, ChatSystemMessage, TreeList, TopNavMegaMenu, RichTextEditor, and RichTextEditorToolbar | A slot given `''`, `true`, or `false` draws a wrapper, lane, border, or separator that an omitted slot does not, an element loses the name it has without the slot, `0` does not render, or a new bare nullish or truthiness presence test, inline or hoisted, a truthiness guard past the baseline, a baseline entry added, or a hand-written copy of the check lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| INV17                 | Review of every `ref.current` assignment reached during render, plus StrictMode double-render tests where a ref feeds later behavior. `pnpm review:pre` item j flags an added render-time ref write, except lazy initialization and the exceptions this record names, with tests in `scripts/lib/pre-review-findings.test.mjs`; `useTableSortable`'s config ref is exempt as this invariant's named gap until the owner decides                                                                                                                                                                                                | A `ref.current` write in a component or hook body outside a lazy one-time initialization or an exception INV17 names, or behavior outside those exceptions that reads a value written by a render React discarded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| INV18                 | Review of every added read that forces layout: `getBoundingClientRect`, `getClientRects`, `offset*`, `client*`, `scroll*` (`scrollTop`, `scrollHeight`, and the rest), `inner*` and `outer*`, `visualViewport` geometry, and `getComputedStyle` (evidence gap: no automated finding yet)                                                                                                                                                                                                                                                                                                                                       | A layout read in a per-frame, scroll or resize path that no current clause requires there, a read interleaved with writes, a read without a comment that names its reason, more than one measurement pass per change beyond the before-and-after pair a current clause requires, or JavaScript measurement where CSS placement serves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| INV18 reorder         | Browser tests of a mouse drag in a reorderable List while a wheel scrolls its scroller: one checks the preview, the drop line and the drop, and one traces layout and counts the offset reads                                                                                                                                                                                                                                                                                                                                                                                                                                  | A wheel scroll mid-drag that leaves the drop line or the preview off the pointer, a drop away from the pointer, a layout the read forces, or more than one read in a scrolled frame                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
