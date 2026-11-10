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
affects_consumer_docs: [Popover, usePopover]
---

# Popover anchoring, dismissal veto, focus region and focus return system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": [
    "packages/core/src/Popover/**",
    "packages/core/src/hooks/useFocusTrap.ts",
    "packages/core/src/Layer/useLayer.tsx",
    "packages/core/src/Layer/outsidePress.ts"
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
popover, whether focus may leave the popover to reach the anchor or the page,
and where focus goes when the popover closes.

These five capabilities let an editor follow the row it edits, a single filter
panel serve every column header, and a coachmark let the person operate the
control it describes, without a second overlay implementation.

## Non-goals

- The Tour component and its step model. `spec:AST-114` owns them and composes
  this contract.
- ContextMenu's point anchor and programmatic opening (`spec:AST-107` FR8).
- A shared layer stack or branch-aware outside dismissal across associated
  layers (`spec:AST-003`).
- Layout-following by script. Every anchored layer follows its anchor through
  CSS anchor positioning (`architecture:layer-runtime` INV21); nothing here
  writes a layer's position from a measured rectangle.
- `useLayer`'s own options. `useLayer` already anchors to any element through
  its `ref`; this spec changes Popover and `usePopover` only.
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
  placed once per resolution inside `contextElement` (else inside the
  document), so the box scrolls with that element's content and CSS anchor
  positioning keeps the layer on it. The box is not focusable, carries no role,
  and receives no pointer events.
- **FR5 — A Popover without a trigger.** A Popover with `anchor` and neither
  children nor `anchorRef` has no trigger. It opens and closes through
  `isOpen`; a dismissal reports `onOpenChange(false)`. Without `isOpen` it
  warns in development and stays closed.
- **FR6 — An unresolved anchor never shows an unanchored surface.** While the
  anchor resolves to nothing, an open popover renders no visible surface and
  takes no focus. It shows on the frame its anchor resolves.

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

### Focus region

- **FR12 — The caller chooses the focus region.** `focusRegion` is `popover`
  (default), `popover-and-anchor`, or `none`.
  - `popover` is `component:Popover` DEC-9: Tab and Shift+Tab cycle inside the
    open popover.
  - `popover-and-anchor` adds the anchor to the cycle. The anchor's tab stops
    (the anchor itself when tabbable, and its tabbable descendants) come before
    the popover's in the cycle. Tab from the last popover control moves to the
    anchor's first stop; Shift+Tab from the anchor's first stop moves to the
    popover's last control.
  - `none` contains nothing. Tab and Shift+Tab move through the page's own
    order, into and out of the popover.
- **FR13 — A Tab from outside the region is never captured.** In every region,
  a Tab pressed while focus is outside the region moves in the page's own order
  (`component:Popover` DEC-9).
- **FR14 — A region other than `popover` is not modal.** `aria-modal` is set
  only with the `popover` region. `isModal` with another region warns in
  development and stamps no `aria-modal`.
- **FR15 — Escape follows the region.** With `popover`, Escape keeps the shared
  topmost dismissal (`family:overlay-dismissal`). With `popover-and-anchor` or
  `none`, the popover takes Escape only while focus is inside its region (for
  `none`, inside the popover); otherwise the press passes to the layer or page
  beneath.
- **FR16 — Focus entry and return do not depend on the region.** Automatic
  focus entry (`component:Popover` FR2) and focus return (FR17) behave the same
  in every region.

### Focus return

- **FR17 — The caller chooses where focus returns.** `returnFocus` is `opener`
  (default), `anchor`, or a function that returns an `HTMLElement` or `null`.
  The return runs on close only when focus was inside the popover's region and
  would otherwise be lost (`component:Popover` AR4).
  - `opener` returns focus to the element focused when the popover opened,
    else to the trigger. This is the released behavior.
  - `anchor` returns focus to the anchor resolved at close, or to its first
    tabbable descendant when the anchor itself is not focusable.
  - A function is read at close. When it returns `null` or an element that is
    not in the document, `opener` applies.

### Compatibility

- **FR18 — Every default is the released behavior.** A Popover or `usePopover`
  that sets none of `anchor`, `anchorOutOfView`, `onOutsidePress`,
  `focusRegion` and `returnFocus` behaves exactly as before.
- **FR19 — `anchorRef` keeps its meaning.** `anchorRef` remains a referenced
  trigger and anchor (`component:Popover` AV1). With both `anchorRef` and
  `anchor`, `anchorRef` is the trigger and `anchor` is the anchor.

### Platform support

- Supported feature/engine floor: the layer runtime's CSS anchor positioning
  floor (`architecture:layer-runtime`).
- Unsupported behavior: in the runtime's reduced browser fallback, FR4's box and
  FR7's hide apply as in supported engines; placement follows the fallback.
- Browser evidence: real Chromium and WebKit for FR3, FR4, FR7, FR9 and FR12;
  jsdom for ARIA, focus order and event ordering.

## Current-state impact

- `component:Popover`: Public concepts gains Anchor, Anchor out of view,
  Outside press, Focus region and Focus return rows; AR3 and DEC-9 name the
  `popover` region as the default; Current-state impact loses "Popover has no
  viewport-rectangle anchor".
- `architecture:layer-runtime`: the anchor-visibility observation (FR5's hold)
  also drives FR7's hide.
- `family:overlay-dismissal`: an Escape participant may scope itself to focus
  inside its region (FR15).
- Consumer docs: `Popover.doc.mjs` and `usePopover.doc.mjs` document the five
  inputs.

FR1 gap: `anchorRef` must reference a button; any other element warns in
development and the popover never anchors.
FR7 gap: an anchor scrolled out of a scrolling panel leaves the surface held
over unrelated content.
FR9 gap: outside presses close the popover through native light dismiss, which
no caller can cancel.
FR12 gap: focus containment is active whenever the popover is open.
FR17 gap: focus return targets are not reachable from the public surface.

## Verification

| Contract  | Verification                                                       | Representative states                                                                                       | Mutation or failure expectation                                                                               |
| --------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| FR1, FR19 | `Popover.test.tsx` anchor suite                                    | `anchor` with a trigger; with `anchorRef`; neither                                                          | ARIA or a handler on the anchor, or the trigger losing ARIA, fails                                            |
| FR2, FR5  | `Popover.test.tsx` anchor suite                                    | A `div`, a table cell, an SVG element; trigger-less controlled open; trigger-less without `isOpen`          | A non-button anchor that warns or does not anchor, or a trigger-less popover that opens uncontrolled, fails   |
| FR3, FR6  | `Popover.test.tsx` and a real-browser interaction spec             | Getter switching elements while open; anchor removed and re-added; getter returning `null` at open          | A remount, a close, a focus move, or a visible surface without an anchor fails                                |
| FR4       | Real-browser interaction spec                                      | A rectangle inside a scrolling panel, scrolled; without `contextElement`                                    | A box that is focusable, takes pointer input, or does not scroll with the panel fails                         |
| FR7, FR8  | `useLayer.test.tsx` and a real-browser interaction spec            | Anchor clipped by a panel, by the viewport, removed; `hold` and `hide`                                      | A dismissal on hide, a hidden surface that takes pointer input, or a layout read in a scroll frame fails      |
| FR9–FR11  | `Popover.test.tsx` outside-press suite and a real-browser spec     | Veto and no veto; press on the anchor and on the trigger; `hasLightDismiss: false`; Escape                  | A vetoed press that closes, a cancelled native event, or a callback for a non-outside close fails             |
| FR12–FR16 | `useFocusTrap.test.tsx` and `Popover.test.tsx` focus-region suites | Each region; Tab and Shift+Tab at each edge; Tab from outside; Escape with focus inside, on the anchor, out | A Tab captured from outside, a cycle that skips or traps the anchor, or Escape taken with focus outside fails |
| FR17      | `Popover.test.tsx` focus-return suite                              | `opener`, `anchor` (focusable and not), function returning an element, `null`, a detached element           | Focus landing elsewhere, or a return that steals focus the user moved, fails                                  |
| FR18      | Existing Popover, usePopover and Popover-family suites unchanged   | Every released state                                                                                        | Any changed expectation in an existing suite fails                                                            |

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

A rectangle anchor is placed once, as a box inside its context element, and
the browser keeps the layer on it. This keeps `architecture:layer-runtime`
INV21: no script follows a moving rectangle.

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
target or pointer type later without a new input.

### DEC-5 — The focus region is a closed axis whose default is DEC-9

**Reference:** `spec:AST-116/DEC-5`
**Decider:** pending owner review

`component:Popover` DEC-9 stays the default. A caller whose popover describes a
control on the page (a coachmark, a tour step, an inline editor) widens the
region to its anchor or removes it. A region other than `popover` is not modal,
and Escape follows the region so a popover that does not hold focus does not
take Escape from the page.

## Open questions

- **OQ1 — Is `none` admitted, or only `popover-and-anchor`?**
  (`human-api`) `component:Popover` DEC-9 rejects a popover with no Tab
  containment. `popover-and-anchor` serves a coachmark or tour step whose
  person must reach the anchored control. `none` also serves a popover that
  annotates page content the person keeps working in.
  - Admit both: FR12 as written.
  - Admit only `popover-and-anchor`: FR12 drops `none`; a caller that needs no
    containment stays on `useLayer`.
- **OQ2 — Input names.** (`human-api`) `anchor`, `anchorOutOfView`,
  `onOutsidePress`, `focusRegion` and `returnFocus` are proposed names for the
  five concepts.
- **OQ3 — Is the rectangle anchor in scope?** (`human-api`) FR4 serves a caller
  that holds a rectangle and no element. Every consumer that holds an element
  can use a function anchor instead.
  - Keep FR4.
  - Drop FR4: `anchor` accepts a ref or a function only.
