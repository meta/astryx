---
schema_version: 1
template_version: 1
kind: architecture
id: architecture:interaction-modality
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-25
owners: [cixzhang]
applies_to:
  [
    packages/core/src/utils/interactionModality.ts,
    packages/core/src/utils/focusOutline.stylex.ts,
    packages/core/src/hooks/useFocusReturnVisibility.ts,
    packages/core/src/hooks/useIndicatorFocusRing.tsx,
    packages/core/src/Layer/useTouchTrigger.ts,
    packages/core/src/,
  ]
verified_by:
  [
    packages/core/src/CheckboxInput/CheckboxInput.test.tsx,
    packages/core/src/DropdownMenu/DropdownMenu.test.tsx,
    packages/core/src/Selector/Selector.test.tsx,
    packages/core/src/Slider/Slider.test.tsx,
  ]
deciding_specs: [spec:AST-100/DEC-1]
---

# Interaction modality architecture

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "interaction": ["INV1", "INV2", "INV3", "INV4", "INV7", "INV8", "INV11"]
  }
}
```

## Purpose

Astryx components behave predictably when people move between keyboard, pointer,
touch, pen, and programmatic focus. Essential actions remain perceivable and
reachable while their controlled state or task context is presented, and newer user
intent remains authoritative over stale work, and every Core and Lab gesture of one kind, dragged or scrolling, reads the
same release velocity, and scroll-linked motion reads one scroll progress. This record defines those shared interaction invariants, the
one gesture velocity source, the one scroll-progress source, the shared modality state, the boundary between modality and
component focus ownership, and the evidence required when any of them changes.

It does not define focus-ring appearance, hover paint, press treatment, or new
component APIs. Those remain with Design Conventions, theme tokens, and the
owning component family.

## System model

Astryx tracks the last input modality as one shared state:

- a key press without Meta, Alt, or Control held sets `keyboard`;
- a pointer press, including mouse, touch, or pen, sets `pointer`;
- a key press with Meta, Alt, or Control held does not change modality; and
- before any input, the state is `keyboard` so initial or restored focus remains
  perceivable.

Programmatic focus does not create a new modality. Its focus indicator follows
the last input modality: it is hidden after pointer input and shown after
keyboard input. Components use the browser's `:focus-visible` behavior together
with the shared modality state where `:focus-visible` alone cannot distinguish
the initiating input.

Modality answers **whether the shared focus indicator should be visible**.
Component ownership answers **which element paints it**. The semantic focus
owner may paint on itself, delegate paint to an owning wrapper, or paint on a
visual proxy when the focusable element is intentionally hidden. That ownership
does not change the modality state.

Hover capability is separate from modality history. Hover behavior is available
only to hover-capable pointers and remains an enhancement over keyboard, click,
and touch paths. Touch and pen presses participate in pointer modality even when
a family gives them different gesture behavior.

Disabled, busy, read-only, intentionally hidden, and intentionally unavailable
semantics are separate from modality. Their current component, family, or system
contracts decide whether an action is present, focusable, or operable; modality only
controls the focus indicator on an eligible focus owner.

An action is **essential for a supported state and modality** when it is the only
supported control that can continue, reverse, dismiss, or change the component-owned
context at the point where that context is offered for interaction. Layout and
composition may move or proxy that action, but MUST NOT remove or separate every
supported path from that interaction point. This does not require an action to remain
continuously onscreen, sticky, or visually prominent. Ordinary scrolling is valid
unless the supported composition keeps the controlled context at the interaction
point while stranding its sole action.

Current component and family contracts define accepted intent, owner replacement,
pending presentation, and which close, cancellation, disablement, or unmount
transitions supersede the same interaction outcome. Once that owner defines
supersession, completion of older pending, deferred, or asynchronous work MUST NOT
change the current outcome's content, selection, status or announcement, visibility,
focus, or activation. This rule does not cancel or reassign unrelated background
work.

## Boundaries and invariants

- **INV1 — Last input owns programmatic focus visibility.** Programmatic focus
  preserves the current modality. After pointer input it does not show the shared
  focus indicator; after keyboard input it does.
- **INV2 — Modality and focus ownership stay separate.** Shared modality decides
  visibility. Each component family decides the semantic focus owner and the
  element that paints on its behalf.
- **INV3 — One focus move has one owning indicator.** A wrapper or visual proxy
  may paint for the semantic owner, but sibling controls paint their own focus
  and replacement content cannot silently remove the owner's indicator.
- **INV4 — Every modality has an operable path.** Keyboard, pointer, and touch or
  pen can reach each supported interaction. Hover is never the only discovery or
  activation path. A tooltip's scrolling overflow is the one exception, as
  `spec:AST-025` FR12 records: a tooltip never takes focus under the ARIA
  tooltip pattern, so content too tall for the viewport scrolls inside it with
  no keyboard path; its full content stays available to assistive technology
  through the trigger's accessible description, and long or essential content
  belongs in a HoverCard or Popover.
- **INV5 — Existing state semantics win.** Disabled controls do not become
  interactive because of modality. Read-only and busy controls preserve their
  documented focus and activation behavior.
- **INV6 — Modality remains internal.** Components derive modality from shared
  browser input state. A public focus-visibility or modality prop requires a
  separate public-API decision.
- **INV7 — Essential actions remain reachable.** At the interaction point where a
  component offers an essential action's controlled context, every supported
  modality has a perceivable and operable path to that action. Layout, scrolling,
  overflow, reflow, responsive composition, replacement content, or a
  custom-renderer seam MUST NOT separate every path from that context. This does not
  require continuous visibility, sticky behavior, or increased prominence. A
  current component, family, or system contract MAY intentionally hide, disable, or
  make the action unavailable in a named state.
- **INV8 — Newer owner-accepted intent owns the current outcome.** Current component
  and family contracts define intent acceptance, pending presentation, and
  supersession for the same interaction outcome. Once superseded, completion of
  older work MUST NOT change the current outcome's content, selection, status or
  announcement, visibility, focus, or activation. Unrelated background work keeps
  its existing owner and lifetime.
- **INV9 — Interaction findings require observable harm.** A shared interaction
  violation requires concrete user harm in a reproducible supported state and
  modality. Evidence names the lost or stale outcome and verifies representative
  normal or legacy paths remain unchanged by the remedy. Aesthetic preference,
  speculative unsupported states, and a claim that an action merely could be easier
  to discover do not establish an interaction violation. This does not bar a visual
  correction already settled by current component, family, design, theme, or
  objective accessibility authority; that correction uses rendered-pixel evidence
  and its direct owner rather than being recast as interaction reachability.
- **INV10 — Gesture velocity has one owner.** In `@astryxdesign/core`, one
  internal velocity tracker owns a gesture's pointer samples and reports
  velocity, and its one release filter is the only lift velocity a Core
  component reads (`spec:AST-100`). The filter is iOS's measured blend: a
  pan's velocity is 0.2 times the newest interval's velocity plus 0.8 times
  the previous interval's, updated on each moved sample, and a scrolling
  surface's release is 0.25 times the newest pan value plus 0.75 times the
  previous one; a contact
  still for longer than the stillness interval before lifting reads 0. It is not exported. No Core component keeps its own sample
  buffer, velocity math, or alternative release filter; a component's flick
  threshold compares the tracker's release velocity. Lab keeps no copy of
  it: no Lab component has its own sample buffer, velocity math, or release
  filter, so Lab reports the same velocity as Core for the same motion.
- **INV11 — Hover intent is a recognizer setting.** The hover recognizer,
  `HoverGestureRecognizer`, takes `intent: {enterMs, exitMs, group}`: an entry delay
  against brush-over, which an owner's record may set to zero, an exit guard, and a
  group across which a pointer moving from one open trigger to the next shows
  the next at once. Keyboard focus shows at once, and a finger is never gated
  or served by it: intent answers mouse and pen hover only. The hover recognizer attaches only for hover-capable
  pointers, since a finger cannot hover, and registers no touch listener. `useTooltip`,
  `useHoverCard`, and `useMenuHover` take their hover timing from it;
  `useContainerReveal` keeps its CSS-only dwell (`component:Thumbnail` PR1) and
  takes only its delay values from the owner's intent. Enter and exit animation, hover tint, and the default delay
  itself stay with their owners. The setting adds no module and is internal
  (`spec:AST-017` FR21).

- **INV12 — Native scroll reports progress.** The native-scroll module also
  reports progress: `progress(range)` turns a scroll position into a value from
  0 to 1 over a range, an element's span or a distance, with its edges, and a
  subscription delivers it off the render path to the animator or a CSS custom
  property, never React state. Native `animation-timeline: scroll()` is
  preferred where the platform supports it, with this as the fallback. Progress
  still reports under reduced motion, and travel it drives stops there on every
  path, through the animator or a CSS custom property alike. Scroll snapping and momentum stay native. It adds no
  module and is internal (`spec:AST-017` FR21).

## Allowed variation

Component families keep their shipped interaction models:

- actions may paint the shared outline on the focusable action;
- bordered fields may paint their established field-focus treatment on an owning
  wrapper;
- hidden native inputs may have owner code paint on the visible indicator;
- menus may move focus with mouse hover so pointer and keyboard share one
  highlighted item; and
- spatial controls may move focus during a pointer gesture without showing the
  keyboard focus indicator.

These are ownership and behavior choices, not alternate modality definitions.
A new visual representation still requires design review; this record does not
authorize one.

## Restorative-change routing

`architecture:knowledge-contracts` alone defines change disposition. INV7 and INV8
may supply the current outcome a change restores, but they do not authorize another
observable public delta. New APIs, exceptions, defaults, interaction models, icon or
control sizing, sticky behavior, caller-owned layout, and new visual representations
remain with their direct current owner unless evidence proves that exact mechanism is
necessary to restore the invariant and representative unaffected paths remain
unchanged. A separable delta is removed or split before this interaction restoration
is asked to carry a new decision.

## Change coupling

- A change to modality tracking, focus-return visibility, shared focus styles, or
  visual-proxy ownership updates the relevant representative tests in the same
  pull request.
- Moving a component's semantic focus owner or paint owner verifies keyboard
  order, programmatic focus after both modalities, one-indicator ownership, and
  disabled, busy, and read-only behavior where applicable.
- Adding pointer-dependent behavior verifies mouse, touch, and pen as applicable,
  including a non-hover path.
- Moving, hiding, clipping, replacing, or asynchronously updating an essential
  action verifies each supported modality in the affected state, close and
  supersession where applicable, and a representative unaffected state.
- A change presented as an interaction restoration inventories every additional
  public behavior delta. Layout, sizing, API, default, and exception changes that
  are not proven necessary remain separately routed.
- Changing focus appearance remains coupled to Design Conventions and theme
  verification. Exposing modality through public API remains coupled to
  `architecture:public-component-api`.

## Owning code

- `utils/interactionModality.ts` — records and exposes the shared last-input
  modality.
- `utils/focusOutline.stylex.ts` and focus tokens — provide the shared focus
  indicator mechanics and theme seam without choosing component ownership.
- `hooks/useFocusReturnVisibility.ts` — applies last-input visibility when focus
  returns from adaptive surfaces.
- `hooks/useIndicatorFocusRing.tsx` — lets the semantic owner guarantee paint on
  a replaceable visual indicator.
- Current component and family records define focus destination, keyboard and pointer
  behavior, essential-action availability, accepted intent, supersession, pending
  lifetimes, and focus-paint ownership.
- `architecture:react-component-runtime` owns shared lifecycle and resource
  mechanisms. This record owns only the cross-cutting modality-path,
  no-stale-interaction-outcome, gesture-velocity-source, hover-intent
  (INV11), and scroll-progress-source (INV12) requirements.
- The Core velocity tracker and its release filter (INV10) — the one source of
  gesture velocity for Core components; not exported.
- The hover recognizer, `HoverGestureRecognizer`, and its `intent` setting
  (INV11) — the one source of hover-show timing for Core components; not
  exported.
- The native-scroll module's progress and its subscription (INV12) — the one
  source of scroll progress for Core components; not exported.

## Deciding specs

`spec:AST-100/DEC-1` decides one release velocity per kind of surface (INV10).
Otherwise no separate specification changes this record. The last-input rule was approved as
a system architecture decision by `cixzhang` on 2026-08-30. Essential-action
reachability, newer-intent precedence, and the evidence/scope guard were approved by
`cixzhang` on 2026-09-10.

## Verification

| Invariant  | Evidence                                                                                                                                                                                                                                       | Failure signal                                                                                                                                                                                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1, INV2 | Programmatic-focus cases after keyboard and pointer input in representative component tests                                                                                                                                                    | Programmatic focus invents a modality, or pointer history paints the keyboard indicator                                                                                                                                                                                                                     |
| INV3       | Direct-owner, wrapper-owner, replaceable-indicator, and nested-action cases                                                                                                                                                                    | No indicator, two indicators, or replacement content can opt out                                                                                                                                                                                                                                            |
| INV4       | Keyboard, mouse, touch, and pen browser paths where applicable                                                                                                                                                                                 | Hover-only behavior, sticky touch hover, or unreachable action                                                                                                                                                                                                                                              |
| INV5       | Disabled, busy, and read-only DOM and activation assertions                                                                                                                                                                                    | Inactive control reacts, eligible control loses focus, or state changes with modality                                                                                                                                                                                                                       |
| INV6       | Public API review and representative source inspection                                                                                                                                                                                         | A component adds caller-controlled modality without a separate API decision                                                                                                                                                                                                                                 |
| INV7       | Rendered-browser affected-state checks across geometry, clipping, scrolling, hit testing, built-in and custom-renderer paths                                                                                                                   | At an offered interaction point one modality loses every essential path, or evidence substitutes class equality for reachability/perceptibility                                                                                                                                                             |
| INV8       | Owner-defined intent order, pending, close, cancellation, disablement, and unmount mutations                                                                                                                                                   | Older work changes current content, selection, status or announcement, visibility, focus, or activation after owner-defined supersession                                                                                                                                                                    |
| INV9       | Concrete-harm reproduction, representative normal/legacy/no-new-prop paths, and coincident public-delta inventory                                                                                                                              | Unsupported or aesthetic preference is treated as harm, unaffected behavior changes, or an API, layout, sizing, default, sticky, or exception delta escapes direct authority                                                                                                                                |
| INV10      | Source boundary check over Core and Lab, a Lab-to-Core comparison on one recorded stream, and release-filter unit tests over recorded iOS pan and scroll-view streams                                                                          | A Core component with its own sample buffer, velocity math, or release filter; a Lab component with its own sample buffer, velocity math, or release filter; a Lab component reporting a different velocity than Core for the same stream; an export of the tracker; a non-zero release after a still pause |
| INV11      | Evidence gap: not implemented yet; the shared hover recognizer and its adopters' move onto it are pending. Then: unit tests of the hover recognizer's intent and browser tests of its adopters with a mouse, a pen, a finger, and the keyboard | A show without the owner's entry delay, a missed handoff within a group, a delayed keyboard show, a hover-shown surface that closes before the pointer reaches it, a finger served by it, or a second hover-timing implementation fails                                                                     |
| INV12      | Unit tests of native scroll's progress and real-browser proofs of its adopters                                                                                                                                                                 | Progress routed through React state, a missing edge, travel under Reduce Motion, use where native scroll-driven animation is supported, or a public export fails                                                                                                                                            |

Real-browser evidence is required when the behavior depends on
`:focus-visible`, pointer capability, touch or pen synthesis, rendered focus
ownership, scrolling, clipping, hit testing, or whether an essential control remains
perceivable in the supported presentation. Unit tests prove event routing, DOM state,
and deterministic intent ordering but do not replace those browser outcomes.

A composed editor surface is the record's verification benchmark: it covers
keyboard-owned editor focus, pointer suppression, clearing an existing keyboard
indicator on pointer press, and keeping internal action focus owned by the
action. The benchmark also verifies programmatic editor focus after both
keyboard and pointer input before the behavior is treated as complete. A
benchmark demonstrates the invariants; it does not carry authority for them.
