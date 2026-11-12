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
    packages/core/src/Layer/useLayerKeyboardClearance.test.tsx,
    packages/core/src/Layer/LayerProvider.test.tsx,
    packages/core/src/Layer/toastHost.test.tsx,
    packages/core/src/Layer/toastHost.lateRegistration.test.tsx,
    scripts/layer-toast-bundle.test.mjs,
    packages/core/src/Layer/layerHost.test.ts,
    packages/core/src/Layer/anchorName.test.ts,
    packages/core/src/Layer/useLayerDismissal.test.tsx,
    packages/core/src/Layer/layerClickBoundary.test.tsx,
    packages/core/src/Layer/layerDismissalInvariants.test.tsx,
    packages/core/src/Layer/layerExitCopy.test.ts,
    packages/core/src/Layer/presentationHold.test.tsx,
    packages/core/src/Layer/__tests__/layerExitCopy.interaction.browser.spec.ts,
    packages/core/src/Layer/layerEntranceSide.test.ts,
    packages/core/src/Layer/__tests__/LayerEntranceSide.interaction.browser.spec.ts,
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
    packages/core/src/Tooltip/__tests__/TooltipClosedTriggerAnchor.interaction.browser.spec.ts,
    packages/core/src/Layer/gestureCounter.test.ts,
    packages/core/src/Layer/outsidePress.test.ts,
    packages/core/src/Layer/outsidePanClaim.test.ts,
    packages/core/src/Layer/__tests__/LayerPanLightDismiss.interaction.browser.spec.ts,
    packages/core/src/Layer/__tests__/LayerPressTransform.interaction.browser.spec.ts,
  ]
deciding_specs: [spec:AST-038, spec:AST-059]
---

# Layer runtime

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "layering": [
      "INV2",
      "INV5",
      "INV6",
      "INV7",
      "INV11",
      "INV12",
      "INV13",
      "INV14",
      "INV15",
      "INV17",
      "INV18",
      "INV20"
    ],
    "layout": ["INV3", "INV11", "INV12"]
  }
}
```

This record describes the layer runtime shipped on current `main`, except
INV14, INV15, and INV17, which state required ownership the runtime does not
yet meet, and INV22, which some anchored layers do not yet meet;
Current gaps lists where it falls short. Other accepted but unimplemented
changes live in `spec:AST-003`; they are not current architecture.

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

Known limitation: a trigger inside SVG `<foreignObject>` cannot be a CSS
anchor in Chromium, so an anchored surface for it opens at the viewport corner.
Place the trigger in an HTML layer over the SVG, positioned at the node's
coordinates, and keep the SVG for shapes, edges, and labels.

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
edge it meets. A layer that keeps its anchor clear (Tooltip) carries
one combined list from its first frame, in place of the standard list
(`spec:AST-059` DEC-7): the preferred block side at its own size, then the
opposite block side at its own size, then beside the anchor on the inline end,
then on the inline start, at the content's inline size, and only then the
preferred block side and the other, each only while it is the roomier side and
sized to the room there. Every option aligns `unsafe` toward the anchor on the
placement axis, so a box that runs out of room overflows away from the anchor
and no option lets it overlap the anchor. Content that fits on some side keeps
its own size there, and no option is sized to whatever room is left: a browser
keeps an open layer on the option it last used while that option still fits,
so an anchor that moves takes the layer to the side now roomier instead of
shrinking it. Its `overflow-y` is `auto`, with no overscroll containment, so it scrolls
only while its content overflows and a fitting layer has no scroll range;
no read decides it. Chromium
tries no more than five options, so this list replaces the standard list
rather than extending it.
During a scroll, Chromium does not choose a CSS-anchored layer's option again,
on a page or inside a scrolling panel, so the runtime checks the layer once a
scroll stops (`spec:AST-059` DEC-8). Where the box still covers the anchor or,
while the anchor is in view, leaves the viewport on the block axis, the runtime
takes the layer out of rendering for one forced layout in the same task (no
frame paints, the popover stays open, no toggle event fires), and the engine
places it afresh from its list. Leaving rendering cancels the CSS animations
and transitions of the layer and its content: the browser recreates the
animations at their start and the transitions not at all.
`Layer/preserveAnimations.ts` reads every accessor with a setter on each
animation's and effect's prototype chains, the effect's timing and keyframes,
and the play and replace state, before the reset, and writes back whatever
differs on the recreated animation; it resumes each transition with a script
animation in the same state and finishes a recreated animation that had no
predecessor. Script animations are untouched. The Animation and effect objects
of CSS animations and transitions are new (their listeners and promises stay
with the old ones, and the browser fires their cancel and start events), and a
finished animation's start time is counted again from now while its held end
time is kept.
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
count), is read inside `show()` and the
open-remount path right after the popover is shown, and again while it is open
from ResizeObserver callbacks and resize events, all of which run before the
frame paints; the observers move to the replacement when the caller replaces
the anchor element while the layer stays open. The one read after a scroll
runs once each time a scroll of the page or of a scrolling ancestor of the
anchor stops: at `scrollend`, or, where the browser does not fire it, after
150 ms with no `scroll` event on those. It runs in the first frame painted
after the stop: the next frame paints, a task runs after that paint, and the
frame after reads and applies. The scroll listeners subscribe to the window's input stream, and listen on
each shadow root along the anchor's flat-tree path, because `scroll` and
`scrollend` are not composed. A `scroll` only cancels a pending check or
starts the timer, and no handler reads layout. Chromium fires `scrollend` per wheel step, so a long
wheel scroll is checked more than once, never during the scroll itself. Nothing watches an anchor that moves on screen without
resizing: every option keeps the layer clear of its anchor, so the layer never
changes side in the middle of a scroll. Apart from the read after a scroll stops, a layer never
paints at a geometry it is about to correct.

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
`useLayer` records the gesture associated with a browser close, and its `show()`
does not reopen the layer during that same gesture, so every trigger path gets
this guard from `useLayer` (INV7).

`useMenuHover` adds a real native invoker relationship for applicable auto
popovers. It separately suppresses the synthetic `mouseenter` produced when a
closing panel exposes a stationary trigger, while allowing a genuine later hover.

Controls that sit beside an open layer can temporarily gain `popovertarget`
during a press so native light dismissal does not mistake them for outside
interaction. Their click action is cancelled as an invoker toggle so the control
can perform its own action without closing the layer.

A text input cannot be an invoker, so BaseTypeahead's list, DateInput's
calendar, DateTimeInput's time list and ChatComposerInput's trigger menu, which
their text fields own, are manual popovers. A press that starts and ends on the
field's input or its buttons (and DateInput's label), or in the layer, is
inside, judged across open shadow roots; a press that starts and ends anywhere
else closes the layer, a scroll or pinch that starts outside does not, and
Escape stays on the shared stack. Focus leaving the field stays each owner's to
handle (`family:overlay-dismissal` AV4).

### Exit copy

The browser hides a popover the moment it closes, whether by a pick, Escape, or
its own light dismiss. A touch presentation whose close stays on screen plays it
on an exit copy: a static copy of the layer that `placeLayerExitCopy` takes as
the layer closes. The copy is laid out on the layer's own box and carries the
transform and opacity the layer is drawn with, so a copy taken while the layer
is still entering holds where it was drawn. It carries no ids, form names, or
form owner; it is `inert`, hidden from assistive technology, and out of pointer
reach; it keeps the layer's scroll positions. It is shown only in the top layer,
as a manual popover, so a clipping, transformed, or sticky ancestor neither cuts
nor moves it; a fixed box or a larger `z-index` is no substitute
(`spec:AST-027` FR8). Where the browser refuses that show during the closing
popover's own toggle, the copy waits, hidden, and enters the top layer once the
toggle is over: after the script that closed the layer, or in the next frame
before it paints. Where there is no top layer (no popover API), or the browser
still refuses, there is no copy and the close is immediate. The presentation
that placed the copy plays its exit on it (`spec:AST-094` FR7) and removes it
when its close settles.

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
requests. A BottomSheet covered by, or being replaced by, another sheet of its
stack reports itself absent to the shared stack while that lasts
(`component:BottomSheet` FR7): the shared stack stays the one dismissal
registry, and only the order among sheets is the sheet stack's to state. Other family members still use local Escape handling as listed in
`family:overlay-dismissal`.

Outside interaction is not coordinated by the shared stack. Current paths
close their own layers independently:

- auto popovers use native light dismiss;
- BaseTypeahead's list, DateInput's calendar, DateTimeInput's time list and
  ChatComposerInput's trigger menu, manual popovers, use Layer's outside-press
  watch,
  which closes on a press that starts and ends outside the field and the list
  and forgets a cancelled press (a scroll);
- native dialogs handle backdrop clicks locally;
- ContextMenu uses a local outside `mousedown` listener, which skips the
  compatibility mouse events of the finger press that opened the menu;
- Tooltip and HoverCard use hover/focus loss plus a touch-only outside listener;
- sheets own scrim and swipe behavior; and
- dropdown submenus encode their root-close relationship locally through
  `DropdownMenuContext`.

One fact joins these paths, for a modal host's backdrop press
(`family:overlay-dismissal` FR11). The outside-press watch, the touch-only
outside listener, the text fields' blur closes, ContextMenu's `mousedown` close,
and a held Tooltip's focus-out release each record their close in a
per-document count. A Dialog or Drawer backdrop press that sees the count
change, or an auto popover close, between its pointer-down and its click leaves
the host open. The count orders nothing else: each path still closes only its
own layer.

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

LayerProvider supplies Toast configuration and an outlet for ToastViewport.
LayerProvider alone renders no empty viewport; Toast registers its viewport when
imported. The outlet then renders the viewport after the app, on the client
only, and a toast shown before that waits in the outlet. It is not a general
portal host for all layers. Without a provider, `useToast` creates a separate
React root under `document.body` and mirrors root theme attributes onto it.

ToastViewport uses `popover="manual"` for top-layer promotion. Each open modal
Dialog, each open modal Drawer, and each open scrim BottomSheet supplies its
`<dialog>` as an outlet
through the private `Layer/modalOutlet.ts` registry (`spec:AST-003` FR18:
every active native modal supplies one, a covered sheet included); a modal
BottomSheetSwitcher flow supplies its active step's dialog, following each
handoff. The registry orders outlets; it mounts nothing (INV14 names the
mounting the runtime is to own). Which outlet is the latest — the one a
global host renders into — follows the sheet stack's order among sheets, not
the order they were supplied in: the top sheet is the latest, so a toast
lands in the top sheet and never in a covered, inert one, also when the
covered flow beneath it changes step and supplies its new step's dialog
(that supply goes beneath the top sheet); when the top sheet closes the
sheet it reveals is the latest again and takes the host back; a sheet is
raised only among sheet outlets, so a Dialog opened from a sheet and
supplied later stays the latest until it closes. A BottomSheet releases its
outlet when it starts closing: its dialog stays modal through the exit
animation, but inert. A closing BottomSheet with focus inside is not yet inert or hidden (`component:BottomSheet` FR9); it becomes inert and hidden when focus leaves it or its exit ends. A modal Drawer also releases its outlet when it starts closing, so toasts
do not slide out with it. A top-layer viewport renders into a host element
it owns, moves that host into the latest open outlet, returns it to the
viewport's tree position when no outlet is open, and enters the top layer again
after each move. Toasts therefore paint above the modal and stay operable inside
it. Moving the host does not remount the rows, so entries, timers, and focus
handoff survive. The rule is one of order, not of modality, and it reaches
the surfaces that tell the registry they entered the top layer: the modal
outlets, and a non-modal top-layer surface that blocks nothing and announces
itself — a `hasScrim={false}` BottomSheet in the top layer with no backdrop
(while a modal that does not contain it is open it stays beneath that modal,
outside the top layer, and enters — announcing then — once that modal has
gone), and a `hasScrim={false}` Drawer, which announces once its
`showPopover()` has put it in the top layer. How such a surface is put in the
top layer is the component's own today, inside the INV14 gap below; the rule
here is only that it announces its entry through the same registry, and that
the viewport then leaves and re-enters the top layer in place, keeping focus
inside it, so toasts paint above it too. A non-modal surface shown with
`show()` below the Popover API support floor is not in the top layer and
announces nothing. In a stack of scrim BottomSheets the latest
outlet is the top sheet, so toasts paint above the whole stack. Toast state
lives inside the viewport. A viewport rendered with `isTopLayer={false}` stays
in place.

CommandPalette composes native Dialog. Its normal launcher presentation therefore
uses `showModal()`; its documentation/showcase `isInline` path does not. The
modal path delegates Escape to Dialog's shared dismissal registration. Only the
inline preview closes from CommandPalette's local key handler because it is not a
registered layer.

Banner and FieldStatus are in-flow. `useAnnounce` is nonvisual. AlertDialog,
imperative Dialog, Lightbox, and ordinary Popover-family surfaces are
interaction-local. `useKeyboardHint` uses Layer rendering and joins Escape
dismissal while its hint shows. Carousel's control overlay and visual-only
layers use Layer rendering without joining Escape/platform dismissal.

## Boundaries and invariants

- **INV1 — Corrective portals preserve locality.** A context layer stays inline
  when safe and otherwise moves only outside the outermost unsafe ancestor
  (see INV19 for renderer-managed DOM).
- **INV2 — Hosting and promotion are separate.** A React portal moves DOM. Native
  Popover or modal Dialog APIs control top-layer participation and modal
  boundaries.
- **INV19 — A renderer never reconciles a layer's nodes.** A layer whose host
  sits inside DOM a renderer manages (a declared managed root, such as
  RichTextEditor's editable area) portals its surface outside that root, so the
  renderer's reconciliation never meets foreign nodes; a layer nested in
  another layer stays in that layer's root, which the renderer does not
  reconcile, even when that root sits inside the managed root; an inline layer
  that is safe in place never moves; the moved wrapper mirrors the host's
  `dir`. The managed-root declaration is internal: not exported, not a prop.
  (Owner decision, Nov 6 2026 (Cindy).)
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
  suppresses exposure-induced hover. A one-finger touch that starts outside an
  open light-dismiss popover and travels the shared pan distance is a gesture,
  not an outside press, even when the browser reads it as a tap; a tap outside
  still dismisses. An anchored menu instead closes as that pan begins
  (`spec:AST-094` FR32).
- **INV8 — Current Escape delivery follows registered layers.** The shared stack
  uses present `close` and `block` entries in its current depth, containment, and
  stable-registration order.
- **INV9 — Outside channels remain component-owned.** Current backdrop,
  pointer, touch, hover/focus, and swipe handlers act through their owning
  component or browser mechanism rather than one shared branch operation. Their
  one shared fact is the per-document count of outside closes in
  `Layer/outsidePress.ts`: a modal backdrop press reads it, so a press that
  closed a layer above the host does not also close the host
  (`family:overlay-dismissal` FR11).
- **INV10 — LayerProvider is configuration, not a universal layer host.** It
  carries Toast configuration and the app-declared viewport inset.
  LayerProvider alone renders no empty viewport; Toast registers its viewport
  when imported. Trigger-
  associated layers resolve near their JSX position independently of the
  provider; the inset reaches them as a context value each layer carries on
  itself, never by resolving placement through the provider, and a layer with
  no provider renders as one under a provider with the default inset.
- **INV11 — One viewport gutter.** The gutter, the viewport caps, and the
  app-declared inset have one definition in the runtime; every anchor-mode layer
  inherits them, the layer box never exceeds the caps, the toast viewport reads
  the same inset, no consumer defines its own, no size is capped to the span
  beside the trigger, except that a later list for the same query keeps an open
  Typeahead popup on its side and grows it only within the room there
  (`spec:AST-092` FR6); the first list for a query places it normally, and a
  consumer minimum is clamped by the runtime's cap. The software keyboard's cap
  is one of those caps (`spec:AST-059` FR9). While a software keyboard covers
  the bottom of the viewport, an anchor-mode layer whose block-end edge would
  run under it keeps its block-start edge and ends 10 px above the keyboard.
  The keyboard's height is the keyboard module's one height
  (`architecture:react-component-runtime` INV11). Each layer carries its own
  keyboard cap on its own element, folded into its block-axis cap, so a layer
  opened inside a capped layer is never capped by its host. Beside the cap,
  each layer carries the overflow its surface takes under it, so a surface
  that reads it scrolls from the frame the cap lands, and its content never
  paints past the capped box. A layer the keyboard does not reach, a layer
  placed above its trigger, and a layer in custom or fixed mode stay as they
  are. A layer that reads the keyboard inset and was placed while a keyboard is
  reported keeps its top until it closes: when the cap lifts it grows downward
  in place; when the keyboard rises it moves up above it and then holds.
- **INV12 — The first frame is the settled frame.** No input to a layer's
  viewport geometry is measured after paint and then applied, with two
  exceptions. The runtime observes anchor visibility for every layer, and,
  for a layer that keeps its anchor clear, whether it covers its anchor or
  leaves the viewport; each is read before
  first paint and, while the layer is open, from callbacks that run before the
  frame paints. The first exception is the check after a scroll stops
  (`spec:AST-059` DEC-8): once a scroll of the page or of a scrolling ancestor
  of the anchor stops (`scrollend`, or 150 ms with no `scroll` event where
  `scrollend` is missing), the layer is checked once, in the first frame
  painted after the stop, and placed afresh if it fails. No scroll frame and no
  scroll handler checks the box, re-picks or forces layout for a layer, and no
  option of the layer's list overlaps its anchor, so a frame painted during
  the scroll can show the layer past the viewport edge but never over its
  anchor. The
  second exception is the software keyboard's cap (`spec:AST-059` FR10).
  A box's height cannot change on the compositor, so the cap changes once per
  keyboard movement: when a rising keyboard has arrived, at once as a falling
  keyboard starts down, and at once for a keyboard that changes without
  moving. A change that would move the layer under a press in progress inside
  it waits for that press's click. The cap is read from the layer's own box
  without its entrance transform. It is read before the first paint of a layer
  that opens with a keyboard up, when the keyboard moves, and before the first
  paint of a layer element the runtime swaps in while the layer is open.
  Otherwise a layer never paints at a geometry it is about to
  correct, and the runtime polls nothing.
- **INV13 — One exit copy per closing layer.** A layer's close plays on at most
  one exit copy, made by `placeLayerExitCopy`: drawn where the layer was drawn,
  inert, hidden from assistive technology, without ids, form names, or form
  owner, shown only in the top layer, and removed by its owner when the close
  settles. Placing a second copy for the same layer removes the first; another
  layer's copy stays.
- **INV14 — The runtime owns every layer's shared mechanism.** Internally, the layer runtime owns the shared
  mechanism layers use: top-layer mounting, close-request delivery, the
  presentation hold (keeping a layer's chosen presentation from the open until
  the close settles), the one shared exit copy (the single Core mechanism
  `architecture:component-style-authoring` INV7 names), and the backdrop tint,
  drawn with `::backdrop`. A component that needs one of these uses the
  runtime's rather than building its own. Each component still decides when it
  dismisses, how it is hosted, and how it is presented, including the
  backdrop's color and every other visual treatment (INV9;
  `family:overlay-dismissal` AV3, AV4, AV6; `spec:AST-003` FR10). The runtime's
  public exports are unchanged.
- **INV15 — One lift-from-trigger module, opt-in per surface.** Lift-from-trigger presentation lives in one
  internal module separate from the layer runtime: the lift from the trigger,
  using the real trigger or a clone, whichever keeps the motion on the
  compositor (`spec:AST-094` FR5);
  the grow from the trigger's rectangle through the shared rectangle morph
  (one Core animation from one rectangle to another); and
  the exit, played through the runtime's exit copy (INV14). A clone of the
  trigger is the one transient copy `architecture:component-style-authoring`
  INV7 allows: inert, hidden from assistive technology, and removed when the
  lift settles. Surfaces opt in;
  any surface that lifts uses this module and never its own copy, and layers
  that do not lift do not use it. It is internal and unexported
  (`spec:AST-017` FR21).
- **INV17 — A click inside a layer stops at the layer root.** A pointer,
  mouse, touch, or click event that starts inside a layer root (both
  `useLayer` renderers and the Dialog, Drawer, Lightbox, MobileNav,
  BottomSheetPanel, and ToastViewport content roots) runs the handlers inside
  the layer, then stops propagating through the React tree: no bubble-phase
  handler on an ancestor of the layer's JSX position receives it, including a
  caller's own element. An ancestor's capture-phase handler runs before the
  stop and still receives it. A nested
  layer stops at its own root. The native event is not stopped, so document
  and window listeners and light dismiss still receive it. Keyboard, focus,
  input, wheel, and drag events are out of scope.
- **INV18 — Only a shown layer's trigger is an anchor.**
  A trigger carries its CSS anchor name only while its layer is shown; a closed trigger is not an anchor, so a surface that moves around it keeps its transform animation off the main thread.
  A layer that animates out through a CSS transition or keyframe animation it declares for its closed state counts as shown until those animations end; an animation a script starts is not tracked.
- **INV20 — An entrance starts from the side its layer lands on.** On the
  pointer path an anchored layer's entrance slides from, and scales about,
  the side it lands on after any flip. So it never slides onto its trigger.
  It scales about the point where the layer meets its trigger: on the edge
  that faces the trigger, on the trigger's center line. A layer that covers
  its trigger's center has no side: its entrance scales about that center
  and does not slide.

- **INV21 — Script never moves a layer to follow its anchor.** An anchored
  layer follows its anchor through CSS anchor positioning only; no script
  writes a layer's position from a measured rectangle to keep it on its anchor.
  Fixed mode's one-time coordinates, a one-time entrance or exit transform, the
  software keyboard's lift, and the reduced browser fallback do not follow an
  anchor (`spec:AST-059` DEC-9).

- **INV22 — A layer never inherits its trigger's press transform.** Press
  feedback scales only the trigger's own visual; a layer renders outside that
  scaled subtree and anchors to the trigger's untransformed box
  (`spec:AST-059` DEC-10).

This record does not make future eligible-owner, branch-association, global-host,
or browser-support requirements current. It does not own component focus entry or
return, modal semantics, channel admission policy, public controlled/uncontrolled
APIs, visual treatment, or theming anatomy.

## Current gaps and accepted change

Current gaps are observable facts, not current target behavior:

- A caller of the public `useLayer({lightDismiss: true})` gets no outside-pan
  claim; Popover-based layers do (INV7).
- A caller's own Popover whose content has `role="menu"` keeps the outside-pan
  claim, because the layer cannot see its content (INV7).
- In a browser that light-dismisses at the release, a Popover closes when a
  control's own drag that began outside it ends outside it (INV7).
- Some layers anchor to the control that the press scales, so a press moves
  the layer and can narrow it (INV22). DropdownMenu anchors its menu to its
  Button. A finger held on the trigger opens the menu from the pressed box and
  moves it while the menu is open. In WebKit, a mouse press also scales the
  trigger, so the menu that the press opens sits off the unpressed box until
  the release. In Chromium, a mouse press does not scale the trigger, so the
  menu keeps its place. Popover with an `anchorRef` or render-prop trigger
  anchors to the caller's control, which a Button scales on press.
  MultiSelector and ComplexSelector anchor to their own control. Ghost and
  secondary Selector place a list that opens on a press from the trigger's
  pressed box, so the list sits off by the trigger's press scale.
- Tooltip currently consumes Escape ahead of an associated Popover, menu, or
  Dialog instead of acting as passive information.
- There is no distinction between active, blocking, passive, and visual-only
  registration roles.
- Outside interaction cannot resolve a whole associated menu/submenu branch or a
  nested child branch through shared infrastructure.
- Backdrop, manual outside, touch, and swipe paths do not share the existing
  gesture claim or one association model.
- Toast's root and fallback hosts remain behind the other native modals:
  Lightbox and MobileNav.
- The reduced browser fallback is not documented as non-equivalent.
- Existing tests simulate Popover `toggle` and DOM nesting; they do not prove
  native pointer light dismissal, top-layer/modal ordering, real anchor geometry,
  SSR parser repair, or nested portal behavior in supported browsers.

`spec:AST-003` is the accepted, unimplemented change that owns requirements,
migration, verification, and completion criteria for these gaps. This record must
be updated only as that work ships.

`spec:AST-003` does not cover INV21 or INV22; `spec:AST-059` DEC-9 and DEC-10
govern them. It does not cover the INV7 gaps either.

INV14 and INV15 are not met yet, and `spec:AST-003` does not cover them. The
runtime owns the shared exit copy (INV13, `placeLayerExitCopy`) and the shared
presentation hold (`Layer/presentationHold.ts`), which Popover uses for its
sheet and anchored presentations; no runtime backdrop tint or lift module
exists, and Dialog, Drawer, BottomSheet, Lightbox, MobileNav, ToastViewport,
and Selector each build their own top-layer mounting, exit, backdrop, or
presentation hold.
BottomSheet's own includes its sheet stack's mounting — the re-show that
keeps a document's sheets in open order, a step dialog's modal present, and
the non-modal sheet's popover host — alongside its scrim; the ordering rules
above are the stack's, the mounting under them is this gap's.

INV17 is met through one seam, `Layer/layerClickBoundary.ts`, which every
listed root spreads; BottomSheetPanel's root is the BottomSheet dialog that
hosts it, so a BottomSheetSwitcher's forwarded handlers there still receive
presses on sheet content (`component:BottomSheetSwitcher` FR9); Dialog's
inline rendering mode layers nothing and is not a layer root. The per-component Tooltip and HoverCard guards
(`component:Tooltip` FR11, `component:HoverCard` FR11) remain beside it until
they are removed. Compatibility: the owner ruled on 2026-11-01 that the
boundary ships as a patch `[fix]` (`spec:AST-017` FR5's fix class) for every
caller no released record covered: no record promised that a press inside a
layer reaches the layer's JSX ancestors, and a handler that needs those presses
belongs on the layer content. The one released promise is
`component:SelectableCard` FR2, whose caller `onClick` also runs for clicks
that do not toggle, including a click inside an open Tooltip or HoverCard
surface. Until the next minor, SelectableCard keeps it by calling the caller's
`onClick` from a capture-phase handler on the card root for a click that starts
inside a layer within the card, so before the layer's own handlers; the change
is staged as `[breaking]` (`spec:AST-017` FR32) and `component:SelectableCard`
`CLN-0026` removes that handler.

Tooltip, HoverCard and ContextMenu's entrance layout is a performance gap. They
play their entrance on the anchored layer itself. Tooltip and HoverCard's layer
is their themed surface: it carries the theme class and the caller's `xstyle`,
`className` and `style`. Chromium lays an anchored element out again each time
its own style changes. On a page with work on every frame, each frame of their
150 ms entrance therefore runs two to four layouts. A Tooltip entrance runs
about 14 to 18 layouts. The other components that play `layerAnimations` play
it on the surface inside the layer and run no layout while it plays.

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
- A software keyboard cap change verifies the cap's timing (a rising keyboard
  that arrives, a falling one, one that changes at once, and a press in
  progress inside the layer), a layer opened with the keyboard up in its first
  frame, capped and with its content clipped, a layer element swapped in while
  open, a pinch zoom, and the layers it leaves alone:
  one clear of the keyboard, one placed above its trigger, and one in another
  positioning.
- A Popover lifecycle change verifies programmatic and browser closes, controlled
  state, temporary invoker association, and same-gesture trigger behavior.
- A dismissal-stack change updates `family:overlay-dismissal` when membership or
  Escape/platform delivery changes.
- A local outside, backdrop, touch, hover, or swipe change preserves the owning
  component's policy and verifies interactions with nested surfaces.
- A change to a layer content root or to the INV17 seam verifies that a press
  inside each kind of root reaches no ancestor bubble-phase handler and still reaches
  document listeners and light dismiss.
- A Toast host change preserves queued and visible toasts, timers, focus handoff,
  theme context, and ordering.
- A CommandPalette host change preserves native modality, search state, focus
  entry/return, and controlled close behavior.
- A browser fallback change updates public `useLayer` and Popover docs and tests
  for both the native path and actual fallback.
- An exit-copy change verifies, where each can be observed: the copy's reach,
  accessibility and form exclusion in jsdom; its top-layer show (from script
  and by light dismiss), its place mid-entrance, and that a layer keeps one
  copy, in jsdom and in Chromium and WebKit; and the refused show's wait in
  jsdom and on Chromium 150 and later, the engines that refuse a show during
  another popover's toggle (Chromium 149 accepts it).

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
- `Layer/useLayerKeyboardClearance.ts` owns the software keyboard's cap on an
  open anchor-mode layer; the runtime imports it through `Layer/LayerTouch.ts`,
  its one touch module. `Layer/layerKeyboardClearance.ts` holds the clearance
  and the cap's arithmetic. `Layer/settledBox.ts` reads a layer's box without
  its entrance transform, for the fallback order, the keyboard's cap and the
  exit copy.
- `Layer/preserveAnimations.ts` owns carrying the CSS animations and
  transitions of a layer and its content across the re-placement's display
  reset.
- `Layer/gestureCounter.ts` owns physical pointer/key gesture identity.
- `Layer/layerClickBoundary.ts` owns the INV17 seam: the React-tree stop every
  layer content root spreads, with the layer-root mark that
  `privateAttributes/layerRoot.stylex.ts` owns.
- One shared seam in the layer runtime owns INV17's stop on every layer content
  root. It stops propagation through the React tree only. React's
  `stopPropagation()` also stops the native event in React 19, which would
  break ContextMenu's outside `mousedown`, Typeahead's pending click, and the
  layer's keep-open `pointerup`, so the seam never stops the native event.
- `Layer/layerExitCopy.ts` owns the exit copy a touch presentation's close plays
  on.
- `Layer/presentationHold.ts` owns the presentation hold: a layer's chosen
  presentation, held from the open until its close settles (INV14).
- `Layer/layerStack.ts`, `Layer/useLayerDismissal.ts`, and
  `Layer/LayerDepthContext.tsx` own current registration, presence, ordering, and
  Escape/platform routing. The stack, the modal outlet registry, the gesture
  counter and the per-document outside-press and popover-operation records
  live under versioned keys, one per page, so every copy of Core on the page
  orders, routes and dismisses through the same records (`spec:AST-110` FR3).
- `Popover/usePopover.tsx` owns focus-trap composition and default native light
  dismiss for Popover-family surfaces.
- `hooks/useFocusTrap.ts` adapts dismissible traps into current shared
  registration; it does not own component focus policy.
- `hooks/useMenuHover.ts` owns hover-open confirmation, native invoker wiring,
  menu focus, and exposure-induced re-hover suppression.
- `Layer/useTouchTrigger.ts` owns touch trigger classification and the current
  touch-only outside listener for Tooltip/HoverCard.
- `Layer/outsidePress.ts` owns the outside-press watch for a text field's
  manual layer, used by BaseTypeahead, DateInput, DateTimeInput and
  ChatComposerInput's trigger menu, and the per-document count of outside
  closes that a modal backdrop press reads (`family:overlay-dismissal` FR11).
- `DropdownMenuContext` and `DropdownMenuSubMenu` own the current local
  menu-cascade parent-close chain.
- Dialog families own native modal/backdrop presentation and their local channel
  policies.
- Drawer owns modal `showModal()` and non-modal `showPopover()` hosting while the
  shared dismissal stack owns Escape and platform close routing.
- `Layer/toastHost.tsx` owns `ToastContext`, Toast's viewport registration, and
  the toast queue that LayerProvider's outlet and `useToast`'s fallback root
  both use. The viewport registration lives under a versioned key, one per
  React, so every copy of Core on one React renders the same registered
  viewport (`spec:AST-110` FR3). `LayerProvider`, `useToast`, and `ToastViewport` own current
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
app-declared inset. Its DEC-7 and DEC-8 govern the anchor-clear list and the
one check after a scroll stops.

`spec:AST-059` DEC-9 governs INV21: script never moves a layer to follow its
anchor. Its DEC-10 governs INV22: a layer never inherits its trigger's press
transform.

`spec:AST-003` is accepted but unimplemented. It defines the approved next
runtime and must move to `shipped` before its requirements are incorporated into
this current architecture record.

## Verification

| Invariant    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Failure signal                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1, INV2   | `useLayer.test.tsx` and `layerHost.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Invalid DOM, stale host, lost theme/writing context, or portal mistaken for top-layer promotion                                                                                                                                                                                                                                                                                                                              |
| INV19        | `layerPortalBoundary.test.ts`, `RichTextEditor.portalHost.test.tsx`, and `LayerBoundary.a11y.browser.spec.ts`, `TooltipDecorator.a11y.browser.spec.ts` and `DecoratorPortal.a11y.browser.spec.ts` in Chromium and WebKit                                                                                                                                                                                                                                                                                                                                                                                                                       | A corrected layer whose host is inside an editor-managed root, and that has no nearer layer root, rendered inside that root; a nested layer moved out of its parent layer's root; a layer that is safe inline moved; a moved wrapper whose `dir` differs from its host's                                                                                                                                                     |
| INV3–INV5    | `useLayer.test.tsx` and `anchorName.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | A mode leaks geometry, RTL resolves from the wrong context, fallback clips, or a sibling anchor is lost                                                                                                                                                                                                                                                                                                                      |
| INV11        | `layerViewportInset.test.ts`, `useLayer.test.tsx`, and the `Core/Layer` viewport-inset stories under the story play guard at a desktop and a phone viewport; `BaseTypeahead.incremental.test.tsx` and the Typeahead incremental-results stories for the `spec:AST-092` FR6 exception                                                                                                                                                                                                                                                                                                                                                           | A second gutter definition, a `100%`-of-span cap, a layer narrower than its explicit size, a layer box wider than the viewport, a layer inside the gutter, or a layer that slides toward an off-screen anchor; for an open Typeahead popup, a later list for the same query that flips it to the other side or grows it past the room on its side, or a first list for a query that is capped to the span beside the trigger |
| INV12        | The `Core/Layer` viewport-inset stories' first-frame comparison, and `useLayer.test.tsx`'s synchronous anchor read; for the check after a scroll stops, `useLayer.test.tsx`'s `scrollend` and 150 ms fallback cases (one check, in the first painted frame after the stop, with no read in the scroll handler) and the Tooltip suites' scroll-edge cases; a Chromium trace at 4× CPU of a wheel scroll that carries a Tooltip's trigger to the scroll edge counts the forced layouts per scroll before and after DEC-8: page scroll 27–42 → 5, a scrolling panel 7 → 5, the Slider value bubble 12–22 → 5                                      | A layer whose first painted rectangle differs from its settled one; a box check, a re-pick or a forced layout for a layer in a scroll frame or a scroll handler; a re-pick before the first painted frame after a scroll stops, or more than one per stop; a painted frame that shows a layer that keeps its anchor clear over its anchor                                                                                    |
| INV11, INV12 | The software keyboard's cap: `useLayerKeyboardClearance.test.tsx` for its rule, its timing, its read before first paint, and the inset's hold; the `PopoverKeyboard`, `keyboardCappedLists` and `SelectorKeyboardInset` browser specs for its rendered geometry                                                                                                                                                                                                                                                                                                                                                                                | A layer that runs under the keyboard, or is capped though the keyboard does not reach it; a cap that changes more than once per keyboard movement or under a press; a layer opened with the keyboard up whose first frame is uncapped or paints its content past its box; a layer that reads the inset and moves down when the keyboard report ends                                                                          |
| INV13        | `layerExitCopy.test.ts` and `layerExitCopy.interaction.browser.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | A copy with an id, a form name, a form owner, or pointer reach; a copy off the layer's drawn box; a copy outside the top layer; a second copy for one layer                                                                                                                                                                                                                                                                  |
| INV6, INV7   | `useLayer.test.tsx`, `Popover.test.tsx`, `DropdownMenu.test.tsx`, `useMenuHover.test.tsx`, `gestureCounter.test.ts`, `outsidePress.test.ts` and `outsidePanClaim.test.ts`; `LayerPanLightDismiss.interaction.browser.spec.ts` in Chromium for a touch that pans outside an open light-dismiss popover of the Popover family (Popover, Selector's list) and outside the anchored menus built on it (DropdownMenu, TabMenu, the Breadcrumbs, TopNav and SideNav menus) and ContextMenu, with and without `pointercancel`, including a pan that the browser reads as a tap, and for a resize handle and a swipe row dragged under an open Popover | Duplicate close callback or the same press/re-hover reopens a surface; a pan outside that light-dismisses an open Popover-family popover, a tap outside that leaves it open, or a page control's drag that the popover takes                                                                                                                                                                                                 |
| INV8         | `useLayerDismissal.test.tsx`, `layerDismissalInvariants.test.tsx`, and `useFocusTrap.test.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current top registered layer is skipped, two layers close, or a blocker leaks through                                                                                                                                                                                                                                                                                                                                        |
| INV9         | Representative Dialog, ContextMenu, Tooltip/HoverCard, and BottomSheet source/tests; `useBackdropPress.test.tsx`; `outsidePress.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | A current local channel silently changes ownership or policy                                                                                                                                                                                                                                                                                                                                                                 |
| INV10        | `LayerProvider.tsx`, `toastHost.tsx`, `LayerProvider.test.tsx`, `toastHost.test.tsx`, `toastHost.lateRegistration.test.tsx`, `useToast.tsx`, `ToastViewport.test.tsx`, `ToastViewport.modalHost.test.tsx`, and `scripts/layer-toast-bundle.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                           | Provider begins relocating ordinary layers, Toast fallback loses its current lifecycle, a default provider renders differently from no provider, a Layer import loads a Toast module, or a toast added before Toast loads is lost                                                                                                                                                                                            |
| INV14, INV15 | Source boundary check over Core for top-layer hosts, exit copies, backdrop elements, lift, and rectangle-morph code outside the runtime and the lift module                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | A component building its own copy of a mechanism INV14 lists (top-layer mounting, close-request delivery, hold, exit copy, or backdrop element), or re-implementing the lift or the grow                                                                                                                                                                                                                                     |
| INV17        | One runtime suite over every kind of layer root: a `useLayer` layer, inline and portaled, and the Dialog, Drawer, Lightbox, MobileNav, BottomSheetPanel, and ToastViewport content roots, each inside a plain `onClick` wrapper and a Core clickable container; nested layers                                                                                                                                                                                                                                                                                                                                                                  | A click inside a layer root that reaches an ancestor bubble-phase handler, a caller's wrapper included; an outer layer's handler that receives an inner layer's press; or a document listener or light dismiss that no longer receives it                                                                                                                                                                                    |
| INV18        | `useLayer.test.tsx` (a closed trigger has no anchor-name, and the trigger of a shown or fading layer does) and `TooltipClosedTriggerAnchor.interaction.browser.spec.ts` in Chromium and WebKit                                                                                                                                                                                                                                                                                                                                                                                                                                                 | A closed trigger with an anchor-name, a shown or fading layer placed away from its anchor, or a surface around a closed trigger that stops while the main thread is busy                                                                                                                                                                                                                                                     |
| INV18        | `useLayer.test.tsx`: a closed state that declares a discrete `display` transition or a keyframe animation keeps the trigger's anchor name until those animations end, read from the closed state's style; a layer whose closed state declares neither is not read for animations at the close                                                                                                                                                                                                                                                                                                                                                  | A layer with such a closed-state exit placed away from its anchor while it fades, or an animation read on the close of a layer whose closed state declares no exit                                                                                                                                                                                                                                                           |
| INV20        | `layerEntranceSide.test.ts` for the side and the meeting point, and `LayerEntranceSide.interaction.browser.spec.ts` in Chromium and WebKit for the first frame of each anchored layer that flips                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| INV21        | A source check over Core for a scroll, resize, observer or animation-frame handler that writes a layer's `top`, `left`, `inset`, `translate` or `transform` from a measured rectangle, excluding the keyboard lift; a performance trace of a page scroll with an open Popover, counting script position writes                                                                                                                                                                                                                                                                                                                                 | A script write of a layer's position during a scroll, or a handler outside DEC-9's four uses that moves a layer toward its anchor                                                                                                                                                                                                                                                                                            |
| INV22        | `LayerPressTransform.interaction.browser.spec.ts`: a browser case per layer that opens from a pressable trigger (Popover, DropdownMenu, Selector, MultiSelector, ComplexSelector, ContextMenu), by mouse and by finger: during and after a press, the layer's rectangle, layout box and computed transform match an unpressed open, and a layer that opens on the press is placed from the untransformed box in its first frame.                                                                                                                                                                                                               | A layer whose rectangle, size or computed transform changes while its trigger is pressed                                                                                                                                                                                                                                                                                                                                     |

Current unit coverage proves emitted styles, reducers, state transitions, and DOM
placement. Native Popover, `<dialog>`, focus, top-layer ordering, and rendered
anchor geometry require real Chromium and WebKit evidence when changed. The
device safe-area term of the gutter is not reproducible in Chromium emulation;
it is proven on a device.
