---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:layer-runtime
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-08-30
owners: [cixzhang, imdreamrunner]
applies_to:
  [
    packages/core/src/Layer/,
    packages/core/src/Popover/,
    packages/core/src/Dialog/,
    packages/core/src/Drawer/,
    packages/core/src/DropdownMenu/,
    packages/core/src/ContextMenu/,
    packages/core/src/Tooltip/,
    packages/core/src/HoverCard/,
    packages/core/src/Toast/,
    packages/core/src/CommandPalette/,
    packages/core/src/hooks/useFocusTrap.ts,
    packages/core/src/hooks/useMenuHover.ts,
  ]
verified_by:
  [
    packages/core/src/Layer/useLayer.test.tsx,
    packages/core/src/Layer/layerViewportInset.test.ts,
    packages/core/src/Layer/LayerProvider.test.tsx,
    packages/core/src/Layer/layerHost.test.ts,
    packages/core/src/Layer/anchorName.test.ts,
    packages/core/src/Layer/useLayerDismissal.test.tsx,
    packages/core/src/Layer/layerDismissalInvariants.test.tsx,
    packages/core/src/Popover/Popover.test.tsx,
    packages/core/src/DropdownMenu/DropdownMenu.test.tsx,
    packages/core/src/ContextMenu/ContextMenu.test.tsx,
    packages/core/src/DropdownMenu/DropdownMenuSubMenu.test.tsx,
    packages/core/src/BottomSheet/BottomSheetSwitcher.test.tsx,
    packages/core/src/CommandPalette/CommandPalette.test.tsx,
    packages/core/src/hooks/useFocusTrap.test.tsx,
    packages/core/src/hooks/useMenuHover.test.tsx,
    packages/core/src/Toast/ToastViewport.test.tsx,
    packages/core/src/Toast/ToastViewport.modalHost.test.tsx,
  ]
deciding_specs: [spec:AST-038, spec:AST-059]
---

# Layer runtime

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "layering": ["INV2", "INV5", "INV6", "INV7", "INV11", "INV12"],
    "layout": ["INV3", "INV11", "INV12"]
  }
}
```

This record describes the layer runtime shipped on current `main`. Accepted but
unimplemented changes live in `spec:AST-003`; they are not current architecture.

## Purpose

Layered UI must escape clipping, stay positioned against its trigger, preserve
nearby theme and writing context, and reconcile browser-owned visibility with
React state.

This record separates DOM hosting, browser top-layer promotion, positioning, and
current dismissal plumbing. A component does not inherit every behavior merely
because it uses one of those mechanisms.

## System model

### Browser hosts and corrective portals

A browser host determines whether and how a surface enters the browser's top
layer:

- `popover="auto"` provides native top-layer promotion, light dismissal, close
  requests, and the browser's auto-popover stack;
- `popover="manual"` provides top-layer promotion without native light dismissal
  or auto-popover exclusivity;
- `dialog.showModal()` provides a native modal boundary, backdrop, inert outside
  content, and platform close requests;
- `dialog.show()` provides a non-modal dialog in its containing context; and
- ordinary DOM rendering provides none of those browser guarantees.

A React portal changes DOM placement. It is not itself a top-layer host and
cannot use `z-index` to outrank a native modal dialog.

`useLayer` keeps a context layer at its JSX position when that position is safe.
When parsing, interactive-content, or inline-formatting constraints make that
position unsafe, it portals only beyond the outermost unsafe ancestor. A
persistent `<template>` marker preserves the intended position so the host can be
resolved again when the render call moves. The nearest safe host preserves live
CSS custom-property inheritance; direction and writing mode are copied only when
the portal would otherwise lose them.

A normal React portal retains React context. `architecture:theme-application`
owns Theme provider behavior; this record owns where a layer's DOM is hosted.

### Positioning

`useLayer` has three positioning modes:

- **context / anchor:** the trigger receives a unique CSS `anchor-name`; the
  surface receives `position-anchor`, logical `position-area`, and ordered
  fallback positions;
- **context / custom:** the trigger and `position-anchor` relationship remain,
  while the caller owns geometry, fallback, offset, and direction handling; and
- **fixed:** the caller supplies viewport `x` and `y` coordinates and receives no
  CSS-anchor geometry.

Anchor names form a list so several layers may share one trigger without
clobbering one another. Standard placement uses the `self-*` logical keyword
family so inherited direction controls RTL behavior. Every anchored placement
can flip across either axis. Centered placements also gain span fallbacks so the
surface can move along the alignment axis near viewport edges. Clearance is
applied to both edges of the placement axis so a flip retains the gap.

#### Viewport inset

Anchor mode owns the viewport inset (`spec:AST-059`). Every anchor-mode layer
keeps a gutter from each viewport edge equal to `max(--spacing-4,
env(safe-area-inset-<edge>))` plus the inset the app declares for that edge as
`inset` on `LayerProvider` (`blockStart`, `blockEnd`, `inlineStart`,
`inlineEnd`; zero by default; app configuration, not a theme value). The
provider publishes the declaration through its context; `useLayer` reads it
and writes it inline on the layer element as the custom properties
`--astryx-layer-inset-<logical-edge>` the gutter expressions read, and the
toast viewport writes the same properties on itself from the provider's prop.
Because the value travels by context and not by CSS inheritance, a corrective
portal cannot lose it, and a layer with no provider — nothing written, every
property reading `0px` — renders exactly as one under a default provider. A
hand-written property is an unsupported escape hatch. The inline gutter reads
the larger of the two physical safe-area insets so a flipped layer still clears
a notch. `Layer/layerViewportInset.stylex.ts` holds the one definition. The
gutter is a margin, so the margin box is what must fit a position option and
what the browser's overflow shift keeps inside the viewport: a layer that would
end inside the gutter or under a declared bar does not fit there and the next
option is tried. On the placement axis the gutter rides the far edge beside
the anchor clearance on the near edge; on the alignment axis it rides the far
edge of an aligned layer — one on the anchor-facing edge would push the layer
off its anchor — and both edges of a centered one. The flip tactics swap the
margins with the area, so the clearance stays on the anchor side and the gutter
on the far side, and the placement-axis gutter is one value for both edges —
the larger of the two block gutters — so a bar declared on one block edge keeps
a layer the same distance from the opposite edge.

The layer box is capped to the viewport minus both gutters on both axes, never
to the span of viewport beside the trigger, and never exceeds that cap. An
explicit size renders at its size up to the cap; a content-sized layer wraps to
the room beside its trigger when its content can wrap and keeps its size up to
the cap when it cannot. Content that cannot fit the cap overflows inside the
layer box, where the composing component scrolls or clips it (Popover scrolls
once it measures overflow); the box itself stays on screen. A consumer caps its
painted surface with the same definition and clamps any minimum of its own
(trigger matching, an explicit width or `menuWidth`) with the runtime's cap
expression, because a CSS minimum otherwise wins over a maximum.

The fallback order is the runtime's: preferred position; flip across the
placement axis; flip across the alignment axis; both; then, while the anchor is
in view, the slide: named `@position-try` options (`Layer/layerSlideRules.ts`)
whose area spans the whole alignment axis, same side of the trigger first,
opposite side second, each carrying the gutter on both alignment-axis edges and
the clearance-and-gutter pair of the side it lands on, which the browser's
overflow alignment shifts the least distance that brings the margin box inside
the viewport. Centered layers keep their one-sided spans ahead of the full
span. The slide is its own option because a layer wider than the room on either
side of its trigger overflows every flipped option on the alignment axis, and
the browser would otherwise keep the base option and never move the layer to
the side of the trigger with room on the placement axis. The rules are one
static style sheet the runtime installs in the layer's document head before
the layer's first paint — never inside the layer, where a role-bearing layer's
text would name them to assistive technology, and never beside it, where they
would change a parent's last child.
Content taller than the placement axis can hold on either side is capped to the
viewport minus both gutters and shifted into the viewport by the browser; its
margin box stays inside the viewport, so it keeps its anchor clearance from the
edge it meets. A layer that keeps its anchor clear (Tooltip) carries a second
list beside the first: when it finds the first list settled the box over the
anchor or, while the anchor is in view, past the viewport on the block axis
(Chromium shifts a box that fits no option over the anchor; WebKit leaves it on
its preferred side, partly off-screen), it switches to beside the anchor on the
inline end, then the inline start, at the content's inline size, then the
opposite block side at its own size, and only then the preferred block side and
the other, each only while it is the roomier side and sized to the room there;
it keeps that list until it next opens, and scrolls only while its content
overflows. Content that fits on some side keeps its own size there, and no
option is sized to whatever room is left: a browser keeps an open layer on the
option it last used while that
option still fits, so an anchor that moves takes the layer to the side now
roomier instead of shrinking it. A browser also keeps a laid-out layer on its
last option when its list changes, so when a switch does not take effect at
once the runtime takes the layer out of rendering for one forced layout in the
same task (no frame paints, the popover stays open, no toggle event fires), and
the engine places it afresh from the new list; a later read that finds it
failing again does the same, since no engine re-runs the list when a scroll
carries the anchor. Leaving rendering cancels the CSS animations and
transitions of the layer and its content: the browser recreates the animations
at their start and the transitions not at all. `Layer/preserveAnimations.ts`
reads every accessor with a setter on each animation's and effect's prototype
chains, the effect's timing and keyframes, and the play and replace state,
before the reset, and writes back whatever differs on the recreated animation;
it resumes each transition with a script animation in the same state and
finishes a recreated animation that had no predecessor. Script animations are
untouched. The Animation and effect objects of CSS animations and transitions
are new (their listeners and promises stay with the old ones, and the browser
fires their cancel and start events), and a finished animation's start time is
counted again from now while its held end time is kept.
Chromium tries no more than five
options, so the second list replaces the first rather than extending it.
Once the anchor has left the viewport the runtime pins the layer's
self-alignment `unsafe` toward the anchor, so the layer holds the position its
flips give it and holds its size rather than sliding to the edge. Components
pass no fallbacks of their own to an anchor-mode layer.

Every one of these inputs is resolved by the browser's style and layout in the
same frame as the render that produced it; apart from the one case below, the
runtime measures nothing after paint to apply them. Anchor visibility is read
synchronously in a layout effect before the layer's first paint and then
observed while the layer is open, so a layer opened with its anchor already out
of view holds from its first frame. Whether a layer that keeps its anchor clear
covers its anchor or leaves the viewport, judged from its box without its own
transform (so an entry animation that starts it closer to the anchor does not
count), and whether its content overflows, is read inside `show()` and the
open-remount path right after the popover is shown,
and again while it is open from ResizeObserver callbacks and resize events, all
of which run before the frame paints; the observers move to the replacement when
the caller replaces the anchor element while the layer stays open. An anchor
that moves on screen without resizing, in layout or by a scroll, is reported
only by an intersection observer on the anchor, whose root is the viewport
shrunk to the anchor's rectangle and which re-reads and re-arms on each report
that differs from its threshold, a fresh observer's first report included, so
an anchor that keeps moving, as through a smooth scroll, is followed frame by
frame. A report that finds an anchor which has not moved wholly outside that
rectangle means a scrolled container clips it; re-arming then would report the
same every frame, so a second intersection observer, rooted at the viewport
with a threshold of 0, waits for the anchor to come back into view and then
re-reads and re-arms. No timer runs.
It reports after paint, so on that one path at most one painted frame shows
the layer over its anchor before it is corrected. Scroll events are not read: one fires before
the layer has followed its anchor. Apart from that, a layer never paints at a
geometry it is about to correct.

### Current browser support behavior

Native Popover API plus CSS Anchor Positioning provide the complete behavior
implemented by the main path: top-layer promotion, native light dismiss,
auto-popover stacking and association, logical anchor geometry, and browser
fallback placement.

When `showPopover` or `hidePopover` is unavailable, `useLayer` falls back to
changing `display`. Explicit component controls can still show and hide mounted
content, callbacks and React state still update, and fixed coordinates still
apply. This fallback does not reproduce top-layer promotion, native outside or
close-request behavior, auto-popover exclusivity or nesting, invoker focus order,
anchored geometry, or collision fallbacks.

Public docs do not yet state this reduced behavior as a support boundary. The
accepted support contract and documentation change are owned by `spec:AST-003`.

### Current Popover lifecycle and light dismissal

Public `useLayer` defaults to `popover="manual"`; Popover-family APIs normally
select `popover="auto"`. Browser-initiated closes are observed through the queued
`toggle` event. The browser may already have hidden the surface before `isOpen`,
`onHide`, or controlled-state synchronization catches up.

`gestureCounter` identifies the physical pointer or keyboard gesture in flight.
`useLayer` records the gesture associated with a browser close and
`wasJustDismissed()` prevents that same press from reopening a trigger.
DropdownMenu and Selector-family trigger paths consume this guard.

`useMenuHover` adds a real native invoker relationship for applicable auto
popovers. It separately suppresses the synthetic `mouseenter` produced when a
closing panel exposes a stationary trigger, while allowing a genuine later hover.

Controls that sit beside an open layer can temporarily gain `popovertarget`
during a press so native light dismissal does not mistake them for outside
interaction. Their click action is cancelled as an invoker toggle so the control
can perform its own action without closing the layer.

### Current dismissal plumbing

`family:overlay-dismissal` owns the shipped Escape/platform-close membership
contract. The current shared stack registers present layers with `close` or
`block` behavior and orders them by logical depth, DOM containment, then stable
active-cycle registration sequence. `useFocusTrap` adapts an active trap with `onEscape` into
that stack.

Tooltip, HoverCard, Dialog, Drawer, Popover, DropdownMenu, ContextMenu,
Lightbox, MobileNav, BottomSheet, and BottomSheetSwitcher all register with the shared
stack. Tooltip and HoverCard report current DOM presence; Popover and
DropdownMenu register through `useFocusTrap`; Dialog, Lightbox, MobileNav,
BottomSheet, BottomSheetSwitcher, and Drawer additionally ask
`shouldDismissOnCloseRequest()` before acting on native platform close
requests. Other family members still use local Escape handling as listed in
`family:overlay-dismissal`.

Outside interaction is not coordinated by the shared stack. Current paths are
independent:

- auto popovers use native light dismiss;
- native dialogs handle backdrop clicks locally;
- ContextMenu uses a local outside `mousedown` listener;
- Tooltip and HoverCard use hover/focus loss plus a touch-only outside listener;
- sheets own scrim and swipe behavior; and
- dropdown submenus encode their root-close relationship locally through
  `DropdownMenuContext`.

The shared stack exposes `isTopmostLayer()`, but current outside, backdrop, touch,
and swipe paths do not use it. There is no shared interaction-owner role,
association graph, branch registry, or outside-branch resolution operation on
current `main`.

### Layer content boundary — AST-038 implementation projection

[AST-038](../specs/AST-038-layer-text-boundary/spec.md) owns the reading baseline
and surface/group boundary. This implementation resets layer-root text, whole
React contexts carrying surface/group membership, and named structural custom
properties; structural CSS isolation covers only the channels it names.

The shared private text baseline is applied in both `useLayer` renderers and the
Dialog, Drawer, Lightbox, MobileNav, BottomSheetPanel, and ToastViewport content
roots. Component and caller styling remains stronger. Existing padding
normalization, hosting, theme inheritance, and writing context remain unchanged.

`createLayerScopedContext` creates surface-scoped contexts whose complete default
value is provided by `LayerContentBoundary`. Membership-owned disabled state,
selection, callbacks, and labels stop together with presentation defaults.
Existing context shapes and public hooks are unchanged. Content-local providers
remain owners; consumers requiring a group need its complete provider inside the
new surface. Menus already establish their own content-local owner and close
chain. Unrelated application state, collection protocols, semantic DOM selection,
and interaction coordination continue through ordinary React contexts.

Each boundary snapshots its provider chain at mount so later lazy imports cannot
remount live content or discard state/focus. Existing native depth-provider seams
retain their original depth values; raw Layer, sheet panels, and toast content
use the private content boundary directly. Toast page children stay outside it.

The private structural reset sits beside the text baseline on the same content
roots and stops each structural custom property it names by setting it to
`initial`. It names `--step-connector-gap`, so an inner Stepper in a layer opened
from `Step.children` content starts from the connector's 0px fallback; a value
set on that Stepper, through its `stepper` target, or by a caller style on the
layer root still applies. It never resets by prefix, so theme tokens and writing
context keep inheriting. A structural channel it does not name still inherits
into layer content.

Existing component behavior checks cover membership exit, explicit inner owners,
unrelated context continuity, and state/focus retention. Browser evidence covers
text inheritance and visual appearance.

### Current global and nonparticipating surfaces

LayerProvider supplies Toast configuration and mounts ToastViewport. It is not a
general portal host for all layers. Without a provider, `useToast` creates a
separate React root under `document.body` and mirrors root theme attributes onto
it.

ToastViewport uses `popover="manual"` for top-layer promotion. Each open modal
Dialog and each open scrim BottomSheet supplies its `<dialog>` as an outlet
through the private `Layer/modalOutlet.ts` registry. A BottomSheet releases its
outlet when it starts closing: its dialog stays modal through the exit
animation, but inert. A top-layer viewport renders into a host element
it owns, moves that host into the latest open outlet, returns it to the
viewport's tree position when no outlet is open, and enters the top layer again
after each move. Toasts therefore paint above the modal and stay operable inside
it. Moving the host does not remount the rows, so entries, timers, and focus
handoff survive. Toast state lives inside the viewport. A viewport rendered with
`isTopLayer={false}` stays in place.

CommandPalette composes native Dialog. Its normal launcher presentation therefore
uses `showModal()`; its documentation/showcase `isInline` path does not. The
modal path delegates Escape to Dialog's shared dismissal registration. Only the
inline preview closes from CommandPalette's local key handler because it is not a
registered layer.

Banner and FieldStatus are in-flow. `useAnnounce` is nonvisual. AlertDialog,
imperative Dialog, Lightbox, and ordinary Popover-family surfaces are
interaction-local. `useKeyboardHint`, Carousel's control overlay, and visual-only
layers use Layer rendering without joining Escape/platform dismissal.

## Boundaries and invariants

- **INV1 — Corrective portals preserve locality.** A context layer stays inline
  when safe and otherwise moves only outside the outermost unsafe ancestor.
- **INV2 — Hosting and promotion are separate.** A React portal moves DOM. Native
  Popover or modal Dialog APIs control top-layer participation and modal
  boundaries.
- **INV3 — Positioning modes do not leak.** Anchor mode owns logical placement,
  fallbacks, and the viewport inset; custom mode owns its geometry; fixed mode
  owns explicit coordinates.
- **INV4 — Shared anchors compose.** One layer adding or removing its anchor name
  does not overwrite names belonging to sibling layers.
- **INV5 — Logical placement remains direction-aware.** Standard anchored
  placement derives from the surface's inherited writing direction and keeps
  clearance after a fallback flip.
- **INV6 — Native close reconciliation is single-fired.** Programmatic hide and
  browser close do not double-fire state or `onHide` updates.
- **INV7 — Existing native-light-dismiss guards identify gestures.** The same
  physical press that closes a Layer cannot immediately reopen it; menu-hover also
  suppresses exposure-induced hover.
- **INV8 — Current Escape delivery follows registered layers.** The shared stack
  uses present `close` and `block` entries in its current depth, containment, and
  stable-registration order.
- **INV9 — Outside channels remain component-owned and uncoordinated.** Current
  backdrop, pointer, touch, hover/focus, and swipe handlers act through their
  owning component or browser mechanism rather than one shared branch operation.
- **INV10 — LayerProvider is configuration, not a universal layer host.** It
  carries Toast configuration and the app-declared viewport inset. Trigger-
  associated layers resolve near their JSX position independently of the
  provider; the inset reaches them as a context value each layer carries on
  itself, never by resolving placement through the provider, and a layer with
  no provider renders as one under a provider with the default inset.
- **INV11 — One viewport gutter.** The gutter, the viewport caps, and the
  app-declared inset have one definition in the runtime; every anchor-mode layer
  inherits them, the layer box never exceeds the caps, the toast viewport reads
  the same inset, no consumer defines its own, no size is capped to the span
  beside the trigger, and a consumer minimum is clamped by the runtime's cap.
- **INV12 — The first frame is the settled frame.** No input to a layer's
  viewport geometry is measured after paint and then applied, with one
  exception. The runtime observes anchor visibility for every layer, and,
  for a layer that keeps its anchor clear, whether it covers its anchor or
  leaves the viewport and whether its content overflows; each is read before
  first paint and, while the layer is open, from callbacks that run before the
  frame paints. The exception is a same-size anchor that moves on screen, in
  layout or by a scroll, which only an intersection observer reports, after
  paint: at most one painted frame shows the layer over its anchor before the
  correction. Otherwise a layer never paints at a geometry it is about to
  correct, and the runtime polls nothing: an anchor that a scrolled
  container hides is followed again when an intersection observer reports it
  back in view.

This record does not make future eligible-owner, branch-association, global-host,
or browser-support requirements current. It does not own component focus entry or
return, modal semantics, channel admission policy, public controlled/uncontrolled
APIs, visual treatment, or theming anatomy.

## Current gaps and accepted change

Current gaps are observable facts, not current target behavior:

- Tooltip currently consumes Escape ahead of an associated Popover, menu, or
  Dialog instead of acting as passive information.
- There is no distinction between active, blocking, passive, and visual-only
  registration roles.
- Outside interaction cannot resolve a whole associated menu/submenu branch or a
  nested child branch through shared infrastructure.
- Backdrop, manual outside, touch, and swipe paths do not share the existing
  gesture claim or one association model.
- Toast's root and fallback hosts remain behind the other native modals:
  Lightbox, MobileNav, and a scrim BottomSheetSwitcher.
- The reduced browser fallback is not documented as non-equivalent.
- Existing tests simulate Popover `toggle` and DOM nesting; they do not prove
  native pointer light dismissal, top-layer/modal ordering, real anchor geometry,
  SSR parser repair, or nested portal behavior in supported browsers.

`spec:AST-003` is the accepted, unimplemented change that owns requirements,
migration, verification, and completion criteria for these gaps. This record must
be updated only as that work ships.

## Change coupling

- A change to `useLayer` hosting or lifecycle verifies safe inline placement,
  corrective portals, host relocation, show/hide reconciliation, theme
  inheritance, writing context, and reduced-browser behavior.
- A positioning change verifies all placement/alignment combinations in LTR and
  RTL, viewport-edge fallbacks, offsets after flips, shared anchors, custom mode,
  and fixed mode; and, through the `Core/Layer` viewport-inset stories in real
  Chromium at a desktop and a phone viewport, an explicit size near an edge,
  content that fits and content that does not fit beside the trigger, a trigger
  where neither side fits, a layer wider than the viewport, an anchor that
  leaves the viewport or is already out of view, an app-declared inset arriving
  or changing, and the first painted frame against the settled one.
- A Popover lifecycle change verifies programmatic and browser closes, controlled
  state, temporary invoker association, and same-gesture trigger behavior.
- A dismissal-stack change updates `family:overlay-dismissal` when membership or
  Escape/platform delivery changes.
- A local outside, backdrop, touch, hover, or swipe change preserves the owning
  component's policy and verifies interactions with nested surfaces.
- A Toast host change preserves queued and visible toasts, timers, focus handoff,
  theme context, and ordering.
- A CommandPalette host change preserves native modality, search state, focus
  entry/return, and controlled close behavior.
- A browser fallback change updates public `useLayer` and Popover docs and tests
  for both the native path and actual fallback.

## Owning code

- `Layer/useLayer.tsx` owns Popover API lifecycle, state reconciliation,
  anchor/fixed/custom rendering, trigger source, and current same-gesture memory.
- `Layer/layerHost.ts` owns safe inline versus nearest corrective portal placement.
- `Layer/anchorName.ts` owns composition of anchor names on one trigger.
- `Layer/layerTextReset.stylex.ts` owns the text baseline and
  `Layer/layerStructureReset.stylex.ts` owns the named structural custom-property
  reset applied on layer content roots.
- `Layer/layerViewportInset.stylex.ts` owns the gutter and the viewport caps;
  `Layer/layerSlideRules.ts` owns the slide options' `@position-try` rules
  and the anchor-clear list's beside and fit rules;
  `LayerProvider` publishes the declared inset through `LayerContext`, and
  `Layer/layerInset.ts` owns the `--astryx-layer-inset-*` properties a layer or
  the toast viewport writes on itself to carry it; `Layer/clampInlineSize.ts`
  owns the clamp a consumer applies to a size of its own.
- `Layer/preserveAnimations.ts` owns carrying the CSS animations and
  transitions of a layer and its content across the re-placement's display
  reset.
- `Layer/gestureCounter.ts` owns physical pointer/key gesture identity.
- `Layer/layerStack.ts`, `Layer/useLayerDismissal.ts`, and
  `Layer/LayerDepthContext.tsx` own current registration, presence, ordering, and
  Escape/platform routing.
- `Popover/usePopover.tsx` owns focus-trap composition and default native light
  dismiss for Popover-family surfaces.
- `hooks/useFocusTrap.ts` adapts dismissible traps into current shared
  registration; it does not own component focus policy.
- `hooks/useMenuHover.ts` owns hover-open confirmation, native invoker wiring,
  menu focus, and exposure-induced re-hover suppression.
- `Layer/useTouchTrigger.ts` owns touch trigger classification and the current
  touch-only outside listener for Tooltip/HoverCard.
- `DropdownMenuContext` and `DropdownMenuSubMenu` own the current local
  menu-cascade parent-close chain.
- Dialog families own native modal/backdrop presentation and their local channel
  policies.
- Drawer owns modal `showModal()` and non-modal `showPopover()` hosting while the
  shared dismissal stack owns Escape and platform close routing.
- `LayerProvider`, `ToastContext`, `useToast`, and `ToastViewport` own current
  notification state, dispatch, and viewport rendering; the viewport sits at
  the provider's inset on each edge unless its own `toast.inset` overrides that
  edge.
- CommandPalette owns command search and selection; Dialog owns its native modal
  host.
- `family:overlay-dismissal` owns Escape/platform-close membership.
  `architecture:interaction-modality` owns last-input modality.
  `architecture:public-component-api` owns public component and hook contracts.
  `architecture:theme-application` owns provider and portal theme context.

## Deciding specs

`spec:AST-038` governs the layer content boundary projected above. It does not
change the hosting runtime described here.

`spec:AST-059` governs the viewport inset projected above: the gutter, the
caps, the fallback order and its anchor-visibility condition, and the
app-declared inset.

`spec:AST-003` is accepted but unimplemented. It defines the approved next
runtime and must move to `shipped` before its requirements are incorporated into
this current architecture record.

## Verification

| Invariant  | Evidence                                                                                                                                                    | Failure signal                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1, INV2 | `useLayer.test.tsx` and `layerHost.test.ts`                                                                                                                 | Invalid DOM, stale host, lost theme/writing context, or portal mistaken for top-layer promotion                                                                                                               |
| INV3–INV5  | `useLayer.test.tsx` and `anchorName.test.ts`                                                                                                                | A mode leaks geometry, RTL resolves from the wrong context, fallback clips, or a sibling anchor is lost                                                                                                       |
| INV11      | `layerViewportInset.test.ts`, `useLayer.test.tsx`, and the `Core/Layer` viewport-inset stories under the story play guard at a desktop and a phone viewport | A second gutter definition, a `100%`-of-span cap, a layer narrower than its explicit size, a layer box wider than the viewport, a layer inside the gutter, or a layer that slides toward an off-screen anchor |
| INV12      | The `Core/Layer` viewport-inset stories' first-frame comparison, and `useLayer.test.tsx`'s synchronous anchor read                                          | A layer whose first painted rectangle differs from its settled one                                                                                                                                            |
| INV6, INV7 | `useLayer.test.tsx`, `Popover.test.tsx`, `DropdownMenu.test.tsx`, and `useMenuHover.test.tsx`                                                               | Duplicate close callback or the same press/re-hover reopens a surface                                                                                                                                         |
| INV8       | `useLayerDismissal.test.tsx`, `layerDismissalInvariants.test.tsx`, and `useFocusTrap.test.tsx`                                                              | Current top registered layer is skipped, two layers close, or a blocker leaks through                                                                                                                         |
| INV9       | Representative Dialog, ContextMenu, Tooltip/HoverCard, and BottomSheet source/tests                                                                         | A current local channel silently changes ownership or policy                                                                                                                                                  |
| INV10      | `LayerProvider.tsx`, `LayerProvider.test.tsx`, `useToast.tsx`, `ToastViewport.test.tsx`, and `ToastViewport.modalHost.test.tsx`                             | Provider begins relocating ordinary layers, Toast fallback loses its current lifecycle, or a default provider renders differently from no provider                                                            |

Current unit coverage proves emitted styles, reducers, state transitions, and DOM
placement. Native Popover, `<dialog>`, focus, top-layer ordering, and rendered
anchor geometry require real Chromium and WebKit evidence when changed. The
device safe-area term of the gutter is not reproducible in Chromium emulation;
it is proven on a device.
