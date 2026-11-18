---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-116
authority: current
archive_reason: null
superseded_by: null
approved_by: nynexman4464
approved_at: 2026-11-17
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

A popover built with `usePopover` can point at something other than the
control that opens it. A caller anchors the surface to any element, to an
element it looks up again when the page changes, and the control that opens the popover keeps its trigger
semantics. The caller decides what happens when the anchor scrolls out of view
and which outside presses close the popover. These are composition inputs: they
live on the hook, and the Popover component keeps its trigger-first props
(DEC-8). Popover and `usePopover` both decide whether the popover is modal: a
modal popover holds Tab, a non-modal one (a coachmark, a tour step) lets focus
move through the page.

When a Popover, Dialog or DropdownMenu closes, focus lands somewhere
reasonable without the caller asking. Popover, Dialog and DropdownMenu share one rule: focus that the close
would strand goes to the opener, or to the nearest surviving stand-in for it,
and never to the page body. Focus the person already moved elsewhere stays
where it is.

## Non-goals

- The Tour component and its step model, which compose this contract.
- ContextMenu's point anchor and programmatic opening (`spec:AST-107` FR8).
- A rectangle or point anchor with no element (DEC-1).
- A shared layer stack for Escape and outside dismissal across associated
  layers (`spec:AST-003`). FR19's record of which layer opened which belongs
  to the overlays' shared focus return, not to the layer runtime.
- Layout-following by script. Every anchored layer follows its anchor through
  CSS anchor positioning (`architecture:layer-runtime` INV21).
- `useLayer`'s own options.
- New Popover component props other than `isModal`'s widened meaning
  (DEC-8).
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

- **FR1 — The anchor is separate from the trigger.** `usePopover` takes an
  optional `anchor`; the Popover component does not (DEC-8). When it is set, the layer anchors to the anchor
  and the trigger keeps only its trigger role: its toggle, `aria-haspopup`,
  `aria-expanded` and `aria-controls`. The anchor receives no handler and no
  ARIA attribute. When it is unset, the trigger is the anchor, which is the
  released behavior.
- **FR2 — The anchor may be any element.** `anchor` accepts a React ref to an
  `Element` or a function that returns an `Element` or `null`. The element
  need not be a button, focusable, or interactive.
- **FR3 — An anchor is read at open and on the caller's refresh.** The popover
  reads a ref anchor when it opens and each time it renders. It reads a
  function anchor when it opens and again when the caller passes a different
  function, which is the caller's refresh, including for a function that
  returned nothing. Nothing watches the page for either. A different element
  becomes the anchor in the same frame; the surface does not close, remount,
  or move focus. An anchor that leaves the document while the popover is open
  is out of view (FR7).
- **FR5 — A popover without a trigger.** A `usePopover` composition with
  `anchor` that attaches no trigger opens and closes only through `show`,
  `hide` and `toggle`; a dismissal reports `onHide`.
- **FR6 — An unresolved anchor never shows an unanchored surface.** While the
  anchor resolves to nothing, an open popover renders no visible surface. It
  shows on the frame a later read (FR3) resolves it.

### Anchor out of view

- **FR7 — The caller chooses stay or hide.** `anchorOutOfViewBehavior` is
  `stay` (default) or `hideWhileOutOfView`. `stay` is the layer runtime's
  released behavior (`spec:AST-059` FR5). With `hideWhileOutOfView`, while the anchor is out of view — clipped
  by the viewport or by any scrolling ancestor, or no longer in the document —
  the surface is hidden: it takes no pointer input and leaves keyboard and
  accessibility navigation, and a modal popover stops containing Tab. It stays
  open: it does not report a dismissal, and it shows again in place, with its
  modality, when the anchor returns.
- **FR8 — Hiding writes no position.** The hide is a visibility state driven by
  the runtime's anchor-visibility observation. It forces no layout per scroll
  frame (`architecture:layer-runtime` INV12) and moves nothing
  (`architecture:layer-runtime` INV21).

### Outside dismissal veto

- **FR9 — The caller may cancel an outside dismissal.** `usePopover`'s
  `onOutsidePress` receives each press that the layer runtime counts as an outside press
  (`architecture:layer-runtime` INV7), before the popover closes for it. A
  touch that pans is a gesture, not an outside press, so it is never reported.
  The event names the pressed element and the pointer type, and nothing more:
  it does not expose the native pointer event. Its `preventDefault()` keeps the
  popover open. Cancelling touches only the dismissal: the press itself, its
  focus change and its click reach the page unchanged.
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
    Shift+Tab move in the browser's sequential focus order. The popover's
    controls follow its trigger; with no trigger, they follow the anchor when
    the anchor can take focus; otherwise they sit at the popover's place in
    DOM order. From the popover's last control, Tab moves to whatever follows
    that element.
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
  by a swipe down, its close control and Escape while it holds focus. Either
  sheet returns focus through FR17–FR21, as an anchored Popover does.

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
- **FR19 — A child that takes over inherits the chain.** The overlays' shared
  focus return records which layer opened which. A layer that closes while a
  layer it opened is
  opening or open moves no focus. The child's chain continues with the
  parent's candidates, so a Dialog opened from a menu row returns focus to the
  menu's trigger when it closes.
- **FR20 — The fallback chain.** Focus goes to the first candidate that is in
  the document, rendered, not disabled, not inert, able to take focus (a
  temporary tab stop is added to an element that cannot) and not inside a
  closing layer. The body never qualifies:
  1. the element focused when the layer opened;
  2. the opener resolved again: the layer's current trigger, then the element
     whose `aria-controls` names the layer;
  3. the anchor;
  4. the opener's former place, recorded when the layer opened as its
     container and its index among that container's tab stops: the stop now
     at that index, then the one before, the one after, then the first;
  5. the nearest connected ancestor of the opener that can take focus;
  6. the layer that opened this one, then the page's `main` landmark.
     Focus return never moves focus to the body. When no candidate
     qualifies, focus is left where it is and FR21 applies.
- **FR21 — A failed return is visible in development.** When the chain finds
  no candidate, or focus falls to the body while a layer hides, a development
  warning names the layer.

### Accessibility

- **AR1 — Focus leaves a surface that hides.** When the surface hides under
  `anchorOutOfViewBehavior: 'hideWhileOutOfView'` with focus inside it, focus moves to the anchor if
  it can take focus, else to the trigger, else through FR20's chain. When the
  surface shows again, focus is not moved back.
- **AR2 — A separate anchor is named in the surface.** The anchor carries no
  ARIA attribute (FR1), so a popover whose anchor is separate states what it
  points at in its accessible name or description, from its `dialogLabel` or
  its content. The trigger keeps `aria-controls`; a popover without a trigger is
  reached by the focus it moves in or by AR4's announcement.
- **AR3 — A temporary tab stop changes nothing else.** The tab stop FR20 adds
  to a candidate that cannot take focus is removed when focus leaves it. The
  candidate keeps its role and accessible name, so assistive technology
  announces it as it is, such as the `main` landmark.
- **AR4 — A popover opened from code is announced.** A popover that opens
  without a person's press or key on its trigger, and does not move focus into
  itself, announces its accessible name politely.

### Compatibility

- **FR22 — Defaults are the released behavior, with three named changes.** A
  Popover, and a `usePopover` that sets none of `anchor`,
  `anchorOutOfViewBehavior` and `onOutsidePress`, anchors, stays and dismisses
  as before. Three released behaviors change. Each ships as an accessibility
  fix (`spec:AST-017` FR53), and the release notes name each change and its
  target:
  - `isModal: false` stops containing Tab and scopes its Escape (FR12, FR15):
    a non-modal surface no longer keeps keyboard focus from the page (WCAG 2.2
    SC 2.1.2, No Keyboard Trap; SC 2.4.3, Focus Order).
  - An `isModal: false` popover shown as a sheet is a non-modal sheet (FR16),
    for the same targets.
  - Popover, Dialog and DropdownMenu return focus that used to fall to the body
    (FR17–FR20; SC 2.4.3, Focus Order).
    No input restores a changed behavior: `isModal: true` is the modal behavior,
    and focus return has no off switch (FR18).
- **FR23 — The trigger inputs keep their meaning.** Popover's `anchorRef`
  remains a referenced trigger and anchor (`component:Popover` AV1). With
  `usePopover`, the element given to `triggerRef` is the trigger, and `anchor`,
  when set, is the anchor.

### Platform support

- Supported feature/engine floor: the layer runtime's CSS anchor positioning
  floor (`architecture:layer-runtime`).
- Unsupported behavior: in the runtime's reduced browser fallback, FR7's hide
  applies as in supported engines; placement follows the fallback. In
  an engine without invoker-based focus order, FR12's non-modal order is the
  DOM order, in which a layer rendered at its JSX position follows the content
  before it.
- Browser evidence: real Chromium, Firefox and WebKit for FR3, FR7, FR9,
  FR12, FR17–FR20 and AR1; jsdom for ARIA, focus order, event ordering and
  AR2–AR4.

## Current-state impact

- `component:Popover`: Public concepts gains Anchor, Anchor out of view and
  Outside press rows, available on `usePopover` only, and its Modality row
  says `isModal` sets containment.
  DEC-9's rule that every Popover is a focus region, modal or not, and its
  rejection of "no Tab containment for non-modal popovers", are superseded for
  `isModal: false` (DEC-5); DEC-9 keeps its text and gains an amendment line,
  and still governs the modal default. AR3, the Tab row, the AR3 and DEC-9
  verification row and Open questions narrow containment to the modal
  default. DEC-8's modal, always light-dismissing sheet is superseded for
  `isModal: false` (FR16), with an amendment line. AR4 and the close state row
  follow FR20's order. The Trigger binding and side-effect lines and FR9 name
  the anchor, the trigger unless `usePopover` names another element. The
  "no viewport-rectangle anchor" line stays and names `usePopover`'s element
  anchor. Released default preserved notes the FR22 changes.
- `component:Dialog` FR4 and AR2 and `component:DropdownMenu` FR6 point to
  FR17–FR20 for the return target and its fallbacks. Dialog's AV4 and its
  "modal close" state follow FR20 when the invoker is gone, its FR4 fallback
  clause is a gap until it ships (FR19 and FR20 gaps), and its Released default
  and Migration decision lines note the FR22 change.
- `component:BottomSheet` keeps its own `finalFocusRef` rule (FR11); FR17–FR21
  do not cover a BottomSheet used directly.
- `architecture:layer-runtime`: the anchor-visibility observation also drives
  FR7's hide. INV18, INV20 and INV22 say "trigger" for the element a layer
  anchors to; with a separate anchor they read "anchor", and the trigger keeps
  only its trigger role (FR1). INV7's move to another trigger applies only when
  no separate anchor is named, and INV20's centered case and the touch growth
  use the anchor's center.
- `family:overlay-dismissal`: its rule that Escape closes the topmost
  participant gains one exception: a non-modal participant takes Escape only
  while focus is inside it or on its anchor or trigger (FR15). A platform close
  request follows the same presence rule (FR3).
- Consumer docs: `usePopover.doc.mjs` documents the anchoring inputs;
  `Popover.doc.mjs`, `usePopover.doc.mjs`, `Dialog.doc.mjs` and
  `DropdownMenu.doc.mjs` document `isModal`'s meaning and that focus return has
  no off switch.
- Callers that set `isModal: false` today, and what changes for each: Tab
  leaves in page order, and Escape works only while focus is inside the
  popover or on its anchor or trigger.
  - PowerSearch's token editor (a dialog popover) and its role-`none` adding
    popup, which share one `usePopover` call.
  - The rich text editor's link form, a dialog popover in a published package.
  - The `LayerSamePress` story and Popover's own tests.

FR1 gap: `usePopover` anchors to its trigger only; Popover's `anchorRef` must
reference a button, and any other element warns in development and never
anchors.
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

| Contract   | Verification                                                          | Representative states                                                                                                  | Mutation or failure expectation                                                                                                                              |
| ---------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR1, FR23  | `PopoverAnchor.test.tsx`                                              | `anchor` with a trigger; with no trigger; Popover `anchorRef`                                                          | ARIA or a handler on the anchor, or the trigger losing ARIA, fails                                                                                           |
| FR2, FR5   | `PopoverAnchor.test.tsx`                                              | A `div`, a table cell, an SVG element; a trigger-less popover opened by `show()` and dismissed                         | A non-button anchor that warns or does not anchor, or a trigger-less dismissal without `onHide`, fails                                                       |
| FR3, FR6   | `PopoverAnchor.test.tsx` and a real-browser interaction spec          | A new function passed while open; anchor removed and re-added; function returning `null` at open                       | A remount, a close, a focus move, or a visible surface without an anchor fails                                                                               |
| FR7, FR8   | `PopoverAnchorOutOfView.test.tsx` and a real-browser interaction spec | Anchor clipped by a panel, by the viewport, removed; `stay` and `hideWhileOutOfView`                                   | A dismissal on hide, a hidden surface that takes pointer input, or a layout read in a scroll frame fails                                                     |
| FR9–FR11   | `PopoverOutsidePress.test.tsx` and a real-browser spec                | Veto and no veto; press on the anchor and on the trigger; a touch pan; `hasLightDismiss: false`; Escape                | A vetoed press that closes, a reported pan, a native event on the callback, or a callback for a non-outside close fails                                      |
| FR12–FR16  | `useFocusTrap.test.tsx`, `Popover.test.tsx` and a real-browser spec   | Modal and non-modal; Tab at each edge and from the anchor; Tab from outside; role `none`; Escape in and out; the sheet | A non-modal popover that holds Tab, a modal one that leaks it (FR14's role-neutral popups excepted), `aria-modal` on a non-modal one, or a modal sheet fails |
| FR17, FR18 | `focusReturn.test.ts` and the Popover, Dialog and DropdownMenu suites | Focus inside at close; on the body; moved outside before close; moved by the hide notification                         | Focus moved from outside the layer, or left on the body, fails                                                                                               |
| FR19       | Menu-to-Dialog suite in jsdom and real Chromium                       | A menu row opens a Dialog; the Dialog closes; nested popovers                                                          | Focus on the body or on the removed row fails                                                                                                                |
| FR20, FR21 | `focusReturn.test.ts` and a real-browser spec                         | Each candidate missing in turn: a tour opened by code, a remounted filter button, a removed opener, no candidate left  | A candidate skipped out of order, a hidden or closing candidate chosen, focus on the body, or no warning fails                                               |
| FR22       | Existing Popover, Dialog, DropdownMenu and Popover-family suites      | Every released state except FR22's two named changes                                                                   | Any other changed expectation in an existing suite fails                                                                                                     |
| AR1        | Real-browser interaction spec                                         | Focus inside a surface whose anchor scrolls out, with a focusable anchor, a trigger only, neither                      | Focus left in a hidden surface, or moved back when it shows, fails                                                                                           |
| AR2–AR4    | `Popover.test.tsx` accessibility suite                                | A trigger-less popover with a separate anchor; a fallback without a tab stop; a popover opened by code                 | An ARIA attribute on the anchor, a tab stop left behind, or an unannounced code-opened popover fails                                                         |

## Decision log

### DEC-1 — One `anchor` input for every anchor shape

**Reference:** `spec:AST-116/DEC-1`
**Decider:** `nynexman4464`, `2026-11-17`

Every shape `anchor` accepts answers one question — which box the layer sits
on — so one input carries all of them. A ref names a stable element, a
function names an element the page replaces. The trigger stays a separate concept with its own
inputs.

Rejected: widening `anchorRef` to non-buttons, because it would change what a
released input does to the element it names; and a rectangle anchor with no
element, because every consumer holds an element.

### DEC-3 — Hiding with the anchor is a state, not a dismissal

**Reference:** `spec:AST-116/DEC-3`
**Decider:** `nynexman4464`, `2026-11-17`

A popover whose anchor is out of view under `hideWhileOutOfView` stays open.
The value names a temporary state, because `hide()` and `onHide` mean close. Closing it would
lose the caller's state and fire `onOpenChange` for something the person did
not do.

### DEC-4 — The veto is a callback with a cancellable event

**Reference:** `spec:AST-116/DEC-4`
**Decider:** `nynexman4464`, `2026-11-17`

`onOutsidePress` runs before the dismissal and its event's `preventDefault()`
cancels it, following the callback cancellation rule in the API conventions.
The event is the popover's own and carries no native pointer event, so
cancelling it can never cancel the press itself.

Rejected: a boolean predicate prop, which names no event and cannot grow a
target or pointer type later.

### DEC-5 — `isModal` is the modality switch, and non-modal means page order

**Reference:** `spec:AST-116/DEC-5`
**Decider:** `nynexman4464`, `2026-11-17`

Containment is a modality policy, not a separate concept: one boolean names
whether the popover is modal. A modal popover
contains Tab and says so with `aria-modal`; a non-modal popover does neither,
and Tab follows the browser's order: the popover's controls come after its
trigger, or after the anchor when there is no trigger (FR12). A coachmark or tour step is non-modal so the person can reach the control
it describes. This supersedes `component:Popover` DEC-9 and AR3 for
`isModal: false`, and DEC-8's modal, always light-dismissing sheet for an
`isModal: false` sheet (FR16), and adds FR15's exception to
`family:overlay-dismissal`'s topmost Escape; DEC-9 and DEC-8 still govern the
modal default.

Rejected: a separate focus-region input with a value that cycles through the
popover and its anchor, which would be a second name for modality and a trap
the platform does not have.

### DEC-6 — One focus return rule for Popover, Dialog and DropdownMenu, with no off switch

**Reference:** `spec:AST-116/DEC-6`
**Decider:** `nynexman4464`, `2026-11-17`

Losing focus strands keyboard and screen reader users, so Popover, Dialog and
DropdownMenu return stranded focus through the same chain, and no caller can
opt out. The chain
prefers the opener, then the elements that stand for it after a remount or a
removal, and ends at the page's main region rather than the body. Focus the
person or the caller already placed outside the layer is never moved.

Rejected: a `returnFocus` input with a value that skips the return.

### DEC-7 — A function anchor is read, not watched

**Reference:** `spec:AST-116/DEC-7`
**Decider:** `nynexman4464`, `2026-11-17`

A function anchor is read when the popover opens and when the caller passes a
new function. The caller knows when its page replaced the element; the
popover does not watch the page or re-run the function on every render, which
keeps the cost of an open popover fixed.

Rejected: re-reading the function after every commit and observing the page
for the element's removal.

### DEC-8 — Anchoring inputs live on `usePopover`, not on Popover

**Reference:** `spec:AST-116/DEC-8`
**Decider:** `nynexman4464`, `2026-11-17`

`anchor`, `anchorOutOfViewBehavior` and `onOutsidePress` serve compositions
such as a tour, a popover shared between table rows, or a filter that moves
between column headers. `usePopover` is the public layer for composition, so
the inputs live there. The Popover component keeps its trigger-first props, so
its common use stays small. The out-of-view input follows the `<thing>Behavior`
naming of `architecture:public-component-api` INV2.

Rejected: the same inputs on Popover, which grows the component for few
callers; and a `BasePopover` component, which would share `usePopover`'s job
(`architecture:public-component-api` INV21).

## Open questions

None. Anchoring, modality and focus return stay in one record.
