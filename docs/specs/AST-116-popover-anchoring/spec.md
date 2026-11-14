---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-116
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [nynexman4464]
affects_architecture: [architecture:layer-runtime]
affects_families: [family:overlay-dismissal]
affects_contributing: []
affects_consumer_docs: [Popover, usePopover, Dialog, DropdownMenu]
---

# Popover anchoring, dismissal veto, modality and layer focus return system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/core/src/Popover/**",
    "packages/core/src/hooks/useFocusTrap.ts",
    "packages/core/src/Layer/useLayer.tsx",
    "packages/core/src/Layer/layerStack.ts",
    "packages/core/src/Layer/outsidePress.ts",
    "packages/core/src/utils/focusReturn.ts",
    "packages/core/src/Dialog/Dialog.tsx",
    "packages/core/src/DropdownMenu/DropdownMenu.tsx"
  ]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A Popover can point at something other than the control that opens it. A
caller anchors the surface to any element, to an element it looks up again when
the page changes, or to a rectangle inside a scrolling region, and the control
that opens the popover keeps its trigger semantics. The caller decides what
happens when the anchor scrolls out of view, which outside presses close the
popover, and whether the popover is modal: a modal popover holds Tab, a
non-modal one (a coachmark, a tour step) lets focus move through the page.

When any layer closes, focus lands somewhere reasonable without the caller
asking. Popover, Dialog and DropdownMenu share one rule: focus that the close
would strand goes to the opener, or to the nearest surviving stand-in for it,
and never to the page body. Focus the person already moved elsewhere stays
where it is.

## Non-goals

- The Tour component and its step model, which compose this contract.
- ContextMenu's point anchor and programmatic opening (`spec:AST-107` FR8).
- A shared layer stack for Escape and outside dismissal across associated
  layers (`spec:AST-003`). FR19 records only which layer opened which.
- Layout-following by script. Every anchored layer follows its anchor through
  CSS anchor positioning (`architecture:layer-runtime` INV21).
- `useLayer`'s own options.
- Focus entry. Each component keeps its own initial focus.
- Equivalent internal implementations remain valid when they satisfy this
  contract.
- Internal modules, files, function names, algorithms, data structures, storage
  layouts, manifests, journals, locks, transaction protocols, and CI job/workflow
  topology belong in architecture or implementation unless callers or
  interoperating systems intentionally depend on that exact mechanism as a public
  protocol.

## Requirements

### Anchor

- **FR1 — The anchor is separate from the trigger.** Popover and `usePopover`
  take an optional `anchor`. When it is set, the layer anchors to the anchor
  and the trigger keeps only its trigger role: its toggle, `aria-haspopup`,
  `aria-expanded` and `aria-controls`. The anchor receives no handler and no
  ARIA attribute. When it is unset, the trigger is the anchor, which is the
  released behavior.
- **FR2 — The anchor may be any element.** `anchor` accepts a React ref to an
  `Element` or a function that returns an `Element` or `null`. The element
  need not be a button, focusable, or interactive.
- **FR3 — A function anchor is resolved again without a remount.** The
  popover reads a function anchor when it opens, after each commit of the
  component that owns the popover while it is open, and when the element it
  last returned leaves the document. A different element becomes the anchor in
  the same frame; the surface does not close, remount, or move focus.
- **FR4 — A rectangle anchor stays in its scrolling region.** `anchor` also
  accepts an object with `getBoundingClientRect()` and an optional
  `contextElement`. The popover anchors to a box of that rectangle's size,
  placed when the popover opens or the object changes, inside `contextElement`
  (else on the page). The box scrolls with its containing block, so CSS anchor
  positioning keeps the layer on it. The box is not focusable, is hidden from
  assistive technology, and receives no pointer events.
- **FR5 — A Popover without a trigger.** A Popover with `anchor` and neither
  children nor `anchorRef` has no trigger. It opens and closes through
  `isOpen`; a dismissal reports `onOpenChange(false)`. Without `isOpen` it
  warns in development and stays closed.
- **FR6 — An unresolved anchor never shows an unanchored surface.** While the
  anchor resolves to nothing, an open popover renders no visible surface. It
  shows on the frame its anchor resolves.

### Anchor out of view

- **FR7 — The caller chooses hold or hide.** `anchorOutOfView` is `hold`
  (default) or `hide`. `hold` is the layer runtime's released behavior
  (`spec:AST-059` FR5). With `hide`, while the anchor is out of view — clipped
  by the viewport or by any scrolling ancestor, or no longer in the document —
  the surface is hidden and takes no pointer input. It stays open: it does not
  report a dismissal, and it shows again in place when the anchor returns.
- **FR8 — Hiding writes no position.** The hide is a visibility state driven by
  the runtime's anchor-visibility observation. It forces no layout per scroll
  frame (`architecture:layer-runtime` INV12) and moves nothing
  (`architecture:layer-runtime` INV21).

### Outside dismissal veto

- **FR9 — The caller may cancel an outside dismissal.** `onOutsidePress`
  receives each press that starts and ends outside the open surface, before
  the popover closes for it. The event names the pressed element and the
  pointer type, and its `preventDefault()` keeps the popover open. Cancelling
  touches only the dismissal: the press itself, its focus change and its click
  reach the page unchanged.
- **FR10 — The anchor is outside.** A press on a separate anchor is an outside
  press. A press on the trigger keeps the released toggle and same-gesture
  rules (`architecture:layer-runtime` INV7) and is not reported.
- **FR11 — The veto applies only to light dismiss.** With
  `hasLightDismiss: false`, no outside press closes the popover and
  `onOutsidePress` is not called. Escape, the fallback close control and
  `hide()` are not outside presses.

### Modality

- **FR12 — `isModal` decides Tab containment and modal semantics together.**
  `isModal` is a boolean, `true` by default.
  - `true`: Tab and Shift+Tab cycle inside the open popover, and a dialog
    popover carries `aria-modal`. This is `component:Popover` DEC-9.
  - `false`: the popover contains nothing and carries no `aria-modal`. Tab and
    Shift+Tab move in the browser's sequential focus order: from the anchor
    (else the trigger) into the popover, and from the popover's last control
    to whatever follows the anchor.
- **FR13 — A Tab from outside is never captured.** Modal or not, a Tab pressed
  while focus is outside the popover moves in the page's own order.
- **FR14 — A role-neutral popup keeps its child's Tab model.** With
  `role: 'none'`, `isModal` sets containment only; a menu still closes on Tab
  and a listbox keeps focus in its input (`component:Popover` DEC-9).
- **FR15 — A non-modal popover takes Escape only while it holds focus.** A
  modal popover keeps the shared topmost Escape (`family:overlay-dismissal`).
  A non-modal popover takes Escape only while focus is inside it or on its
  anchor or trigger; otherwise the press passes to the layer or page beneath.
- **FR16 — The sheet follows `isModal`.** Where `presentation` resolves to a
  sheet, `isModal: true` presents the released modal sheet
  (`component:Popover` DEC-8). `isModal: false` presents a non-modal sheet:
  no scrim, the page stays interactive and focus is not contained. It closes
  by a swipe down, its close control and Escape while it holds focus.

### Layer focus return

These requirements apply to Popover (and every `usePopover` composition),
Dialog and DropdownMenu.

- **FR17 — Focus return acts only on stranded focus.** When a layer closes,
  focus moves only if focus entered the layer while it was open and focus is
  now inside the closing layer or on nothing (the body, or no element). Focus
  that is already outside the closing layer stays where it is, including focus
  a caller moved in its own hide notification.
- **FR18 — There is no off switch.** No input turns focus return off or names
  a value that skips it. A caller that wants a specific element focuses it in
  its hide notification; FR17 then leaves it there.
- **FR19 — A child that takes over inherits the chain.** The runtime records
  which layer opened which. A layer that closes while a layer it opened is
  opening or open moves no focus. The child's chain continues with the
  parent's candidates, so a Dialog opened from a menu row returns focus to the
  menu's trigger when it closes.
- **FR20 — The fallback chain.** Focus goes to the first candidate that is in
  the document, rendered, able to take focus (a temporary tab stop is added to
  an element that cannot) and not inside a closing layer:
  1. the element focused when the layer opened;
  2. the opener resolved again: the layer's current trigger, then the element
     whose `aria-controls` names the layer;
  3. the anchor;
  4. the opener's former place, recorded when the layer opened as its
     container and its index among that container's tab stops: the stop now
     at that index, then the one before, the one after, then the first;
  5. the nearest connected ancestor of the opener that can take focus;
  6. the layer that opened this one, then the page's `main` landmark.
     Focus never returns to the body.
- **FR21 — A failed return is visible in development.** When the chain finds
  no candidate, or focus falls to the body while a layer hides, a development
  warning names the layer.

### Compatibility

- **FR22 — Defaults are the released behavior, except FR12's `false`.** A
  Popover or `usePopover` that sets none of `anchor`, `anchorOutOfView` and
  `onOutsidePress` anchors, holds and dismisses as before. `isModal: false`
  stops containing Tab (FR12); this is the one released behavior that changes,
  and its release note says so.
- **FR23 — `anchorRef` keeps its meaning.** `anchorRef` remains a referenced
  trigger and anchor (`component:Popover` AV1). With both `anchorRef` and
  `anchor`, `anchorRef` is the trigger and `anchor` is the anchor.

### Platform support

- Supported feature/engine floor: the layer runtime's CSS anchor positioning
  floor (`architecture:layer-runtime`).
- Unsupported behavior: in the runtime's reduced browser fallback, FR4's box and
  FR7's hide apply as in supported engines; placement follows the fallback. In
  an engine without invoker-based focus order, FR12's non-modal order is the
  DOM order, in which a layer rendered at its JSX position follows the content
  before it.
- Browser evidence: real Chromium, Firefox and WebKit for FR3, FR4, FR7, FR9,
  FR12 and FR17–FR20; jsdom for ARIA, focus order and event ordering.

## Current-state impact

- `component:Popover`: Public concepts gains Anchor, Anchor out of view and
  Outside press rows, and its Modality row says `isModal` sets containment;
  AR3 and DEC-9 name FR12's modal default; AR4 points to FR17–FR20; Current-
  state impact loses "Popover has no viewport-rectangle anchor".
- `component:Dialog` FR4 and AR2 and `component:DropdownMenu` FR6 point to
  FR17–FR20 for the return target and its fallbacks.
- `architecture:layer-runtime`: the anchor-visibility observation also drives
  FR7's hide; the layer stack records which layer opened which (FR19).
- `family:overlay-dismissal`: a non-modal participant scopes Escape to focus
  inside it (FR15).
- Consumer docs: `Popover.doc.mjs`, `usePopover.doc.mjs`, `Dialog.doc.mjs` and
  `DropdownMenu.doc.mjs` document the inputs, `isModal`'s meaning, and that
  focus return has no off switch.
- Callers that set `isModal: false` today: PowerSearch's token editor (a
  dialog popover) and Popover's own tests. The token editor then lets Tab
  leave the editor in page order.

FR1 gap: `anchorRef` must reference a button; any other element warns in
development and the popover never anchors.
FR7 gap: an anchor scrolled out of a scrolling panel leaves the surface held
over unrelated content.
FR9 gap: outside presses close the popover through native light dismiss, which
no caller can cancel.
FR12 gap: focus containment is active whenever the popover is open, whatever
`isModal` says.
FR19 gap: a Dialog opened from a menu row returns focus to the row, which the
closed menu removed, so focus falls to the body.
FR20 gap: a Popover whose opener was removed while it was open leaves focus on
the body.

## Verification

| Contract   | Verification                                                          | Representative states                                                                                                  | Mutation or failure expectation                                                                                        |
| ---------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| FR1, FR23  | `Popover.test.tsx` anchor suite                                       | `anchor` with a trigger; with `anchorRef`; neither                                                                     | ARIA or a handler on the anchor, or the trigger losing ARIA, fails                                                     |
| FR2, FR5   | `Popover.test.tsx` anchor suite                                       | A `div`, a table cell, an SVG element; trigger-less controlled open; trigger-less without `isOpen`                     | A non-button anchor that warns or does not anchor, or a trigger-less popover that opens uncontrolled, fails            |
| FR3, FR6   | `Popover.test.tsx` and a real-browser interaction spec                | Getter switching elements while open; anchor removed and re-added; getter returning `null` at open                     | A remount, a close, a focus move, or a visible surface without an anchor fails                                         |
| FR4        | Real-browser interaction spec                                         | A rectangle inside a scrolling panel, scrolled; without `contextElement`                                               | A box that is focusable, takes pointer input, or does not scroll with the panel fails                                  |
| FR7, FR8   | `useLayer.test.tsx` and a real-browser interaction spec               | Anchor clipped by a panel, by the viewport, removed; `hold` and `hide`                                                 | A dismissal on hide, a hidden surface that takes pointer input, or a layout read in a scroll frame fails               |
| FR9–FR11   | `Popover.test.tsx` outside-press suite and a real-browser spec        | Veto and no veto; press on the anchor and on the trigger; `hasLightDismiss: false`; Escape                             | A vetoed press that closes, a cancelled native event, or a callback for a non-outside close fails                      |
| FR12–FR16  | `useFocusTrap.test.tsx`, `Popover.test.tsx` and a real-browser spec   | Modal and non-modal; Tab at each edge and from the anchor; Tab from outside; role `none`; Escape in and out; the sheet | A non-modal popover that holds Tab, a modal one that leaks it, `aria-modal` on a non-modal one, or a modal sheet fails |
| FR17, FR18 | `focusReturn.test.ts` and the Popover, Dialog and DropdownMenu suites | Focus inside at close; on the body; moved outside before close; moved by the hide notification                         | Focus moved from outside the layer, or left on the body, fails                                                         |
| FR19       | Menu-to-Dialog suite in jsdom and real Chromium                       | A menu row opens a Dialog; the Dialog closes; nested popovers                                                          | Focus on the body or on the removed row fails                                                                          |
| FR20, FR21 | `focusReturn.test.ts` and a real-browser spec                         | Each candidate missing in turn: a tour opened by code, a remounted filter button, a removed opener, no candidate left  | A candidate skipped out of order, a hidden or closing candidate chosen, focus on the body, or no warning fails         |
| FR22       | Existing Popover, Dialog, DropdownMenu and Popover-family suites      | Every released state except `isModal: false` containment                                                               | Any other changed expectation in an existing suite fails                                                               |

## Decision log

### DEC-1 — One `anchor` input for every anchor shape

**Reference:** `spec:AST-116/DEC-1`
**Decider:** pending owner review

Every shape `anchor` accepts answers one question — which box the layer sits
on — so one input carries all of them. A ref names a stable element, a
function names an element the page replaces, and a rectangle names a place
inside a scrolling region. The trigger stays a separate concept with its own
inputs.

Rejected: widening `anchorRef` to non-buttons, because it would change what a
released input does to the element it names.

### DEC-2 — A rectangle anchor becomes a box inside its context

**Reference:** `spec:AST-116/DEC-2`
**Decider:** pending owner review

A rectangle anchor is placed once per opening, as a box inside its context
element, and the browser keeps the layer on it. This keeps
`architecture:layer-runtime` INV21: no script follows a moving rectangle.

Rejected: re-reading `getBoundingClientRect()` on scroll to move the layer,
which INV21 forbids.

### DEC-3 — Hiding with the anchor is a state, not a dismissal

**Reference:** `spec:AST-116/DEC-3`
**Decider:** pending owner review

A popover whose anchor is out of view under `hide` stays open. Closing it would
lose the caller's state and fire `onOpenChange` for something the person did
not do.

### DEC-4 — The veto is a callback with a cancellable event

**Reference:** `spec:AST-116/DEC-4`
**Decider:** pending owner review

`onOutsidePress` runs before the dismissal and its event's `preventDefault()`
cancels it, following the callback cancellation rule in the API conventions.
The event is the popover's own, so cancelling it never cancels the native
pointer event.

Rejected: a boolean predicate prop, which names no event and cannot grow a
target or pointer type later.

### DEC-5 — `isModal` is the modality switch, and non-modal means page order

**Reference:** `spec:AST-116/DEC-5`
**Decider:** `nynexman4464` (direction, 2026-11-10), pending owner review

One boolean names one concept: whether the popover is modal. A modal popover
contains Tab and says so with `aria-modal`; a non-modal popover does neither,
and Tab follows the browser's order through the anchor, the popover and the
page. A coachmark or tour step is non-modal so the person can reach the control
it describes. This supersedes `component:Popover` DEC-9 for `isModal: false`;
DEC-9 still governs the modal default.

Rejected: a separate focus-region input with a value that cycles through the
popover and its anchor, which would be a second name for modality and a trap
the platform does not have.

### DEC-6 — One focus return rule for every layer, with no off switch

**Reference:** `spec:AST-116/DEC-6`
**Decider:** `nynexman4464` (direction, 2026-11-10), pending owner review

Losing focus strands keyboard and screen reader users, so every layer returns
stranded focus through the same chain, and no caller can opt out. The chain
prefers the opener, then the elements that stand for it after a remount or a
removal, and ends at the page's main region rather than the body. Focus the
person or the caller already placed outside the layer is never moved.

Rejected: a `returnFocus` input with a value that skips the return.

## Open questions

- **OQ1 — Input names.** (`human-api`) `anchor`, `anchorOutOfView` and
  `onOutsidePress` are proposed names for their concepts.
- **OQ2 — Is the rectangle anchor in scope?** (`human-api`) FR4 serves a caller
  that holds a rectangle and no element. Every consumer that holds an element
  can use a function anchor instead.
  - Keep FR4.
  - Drop FR4: `anchor` accepts a ref or a function only.
