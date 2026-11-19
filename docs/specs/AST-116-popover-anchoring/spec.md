---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-116
authority: current
archive_reason: null
superseded_by: null
approved_by: nynexman4464
approved_at: 2026-11-18
phase: accepted
owners: [nynexman4464]
affects_architecture: [architecture:layer-runtime]
affects_families: [family:overlay-dismissal]
affects_contributing: []
affects_consumer_docs: [Popover, usePopover, Dialog, DropdownMenu]
---

# Popover anchoring, modality and layer focus return system spec

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
control that opens it. A caller anchors the surface to any element through
`anchorRef`, and the control that opens the popover keeps its trigger
semantics. The position-only anchor is a composition input: it lives on the
hook, and the Popover component keeps its trigger-first props (DEC-8). A caller that shows an open popover again from another place moves
it there, and the press that asked does not close it. Popover and
`usePopover` both decide whether the popover is modal: a modal popover holds
Tab, a non-modal one (a coachmark, a tour step) lets focus move through the
page.

When a Popover, Dialog or DropdownMenu closes, focus lands somewhere
reasonable without the caller asking. Popover, Dialog and DropdownMenu share one rule: focus that the close
would strand goes to the opener, or to the nearest surviving stand-in for it,
and never to the page body. Focus the person already moved elsewhere stays
where it is.

## Non-goals

- The Tour component and its step model, which compose this contract.
- ContextMenu's point anchor and programmatic opening (`spec:AST-107` FR8).
- A rectangle or point anchor with no element, and a function that returns
  the anchor (DEC-1).
- What a layer does while its anchor is out of view. Every anchored layer
  follows the layer runtime's rule (`spec:AST-059` FR5), and `usePopover` has
  no input for it.
- A veto for an outside dismissal. No input provides one (OQ1).
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
  optional `anchorRef`, which names the element the popover sits on and
  nothing else; the Popover component has no such input (DEC-8, FR23). When
  it is set, the layer anchors to that element and the trigger keeps only its
  trigger role: its toggle, `aria-haspopup`, `aria-expanded` and
  `aria-controls`. The anchor receives no handler and no ARIA attribute. When
  it is unset, the trigger is the anchor, which is the released behavior.
- **FR2 — The anchor may be any element.** `anchorRef` is a React ref to an
  `Element`. The element need not be a button, focusable, or interactive; it
  is an element that generates a CSS box, so an SVG shape inside an `<svg>` is
  not an anchor, and its `<svg>` element is. A shape passed as an anchor warns
  in development.
- **FR3 — The anchor is read at open, on each render and on each `show()`.**
  The popover reads `anchorRef` when it opens, each time the component that
  calls `usePopover` renders, and each time the caller calls `show()`. Nothing
  watches the page for a new element; the runtime's anchor observation reports
  the current one leaving the document (FR6). A different element becomes the anchor in the same
  frame; the surface does not close, remount, or move focus.
- **FR5 — A popover without a trigger.** A `usePopover` composition with
  `anchorRef` that attaches no trigger opens and closes only through `show`,
  `hide` and `toggle`; a dismissal reports `onHide`.
- **FR6 — A missing anchor never shows an unanchored surface.** While an
  `anchorRef` the caller passed holds no element, or holds one that is not in
  the document, an open popover renders no visible surface, whether or not a person is using
  it (AR1). It shows on the frame a later read (FR3) finds an anchor in the
  document.

### Showing an open popover again

- **FR9 — A `show()` in the same press moves the popover.** When a press
  outside an open popover that sets `anchorRef` runs a handler that calls
  `show()` in the same gesture, the popover stays open: it does not close for
  a frame, remount, or move focus, and it reports no `onHide` and no
  open-state change. It reads `anchorRef` again (FR3) and moves to the element
  it holds, or stays in place when that element is unchanged. A caller that
  moves a popover between rows or column headers sets `anchorRef.current`
  before it calls `show()`. Every other outside press closes a
  light-dismissing popover, and a press on the separate anchor is an outside
  press. A press on the trigger, and a popover that sets no `anchorRef`, keep
  the released toggle and same-gesture rules (`architecture:layer-runtime`
  INV7).

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
- **FR15 — A non-modal popover takes Escape only while focus is in its scope.** A
  modal popover keeps the shared topmost Escape (`family:overlay-dismissal`).
  A non-modal popover takes Escape only while focus is inside it, or on or
  inside its anchor or trigger; otherwise the press passes to the layer or page beneath.
- **FR16 — The sheet follows `isModal`.** Where `presentation` resolves to a
  sheet, `isModal: true` presents the released modal sheet
  (`component:Popover` DEC-8). `isModal: false` presents a non-modal sheet:
  no scrim, the page stays interactive and focus is not contained. It closes
  by a swipe down and by Escape under FR15; its fallback close stays
  hidden (`component:Popover` DEC-8), and a press on the page does not close
  it. Either
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
- **FR19 — A child that takes focus inherits the chain.** The overlays' shared
  focus return records which layer opened which. A layer that closes while a
  layer it opened holds focus, or is opening and takes focus as it opens,
  moves no focus. The child's chain continues with the parent's candidates,
  so a Dialog opened from a menu row returns focus to the menu's trigger when
  it closes. A layer whose open child holds no focus and takes none, such as
  a typeahead's result list or a popover that focus has left, returns focus
  itself (FR17, FR20).
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
  no candidate, a development warning names the layer.

### Accessibility

- **AR1 — Focus leaves a surface that loses its anchor.** When FR6 hides an
  open popover while focus is inside it, focus moves to the trigger, else
  through FR20's chain. When the surface shows again, focus is not moved
  back. FR6's hide is the only one that can strand focus: a layer whose
  anchor is out of view stays (`spec:AST-059` FR5).
- **AR2 — A separate anchor is named in the surface.** The anchor carries no
  ARIA attribute (FR1), so a popover whose anchor is separate states what it
  points at in its accessible name or description, from its `dialogLabel` or
  its content. The trigger keeps `aria-controls`; a popover without a trigger is
  reached by the focus it moves in or by AR4's announcement.
- **AR3 — A temporary tab stop changes nothing else.** The tab stop FR20 adds
  to a candidate that cannot take focus is removed when focus leaves it. The
  candidate keeps its role and accessible name, so assistive technology
  announces it as it is, such as the `main` landmark.
- **AR4 — A popover opened from code is announced.** A dialog popover that
  opens without a person's press or key on its trigger, and does not move focus
  into itself, announces its accessible name politely. A role-neutral popup
  (`role: 'none'`), such as a typeahead's listbox, is not announced: its owner
  announces its own results.

### Compatibility

- **FR22 — Defaults are the released behavior, with three named changes.** A
  Popover, and a `usePopover` that sets no `anchorRef`, anchors as before,
  and a modal one dismisses as before. Three released behaviors change.
  Each ships as an accessibility fix (`spec:AST-017` FR53), and the release
  notes name each change, its old and new behavior, and its target:
  - `isModal: false` stops containing Tab (FR12): the page's controls stay
    reachable in page order while a non-modal popover is open (WCAG 2.2 SC
    2.4.3, Focus Order). Its Escape applies only while focus is inside it, or on or inside its anchor
    or trigger (FR15),
    so Escape reaches the layer or control the person is using (SC 2.1.1,
    Keyboard).
  - An `isModal: false` popover shown as a sheet is a non-modal sheet (FR16):
    no scrim, and the page stays reachable (SC 2.4.3). A swipe down closes it,
    and Escape closes it under FR15; a tap on the page no longer does.
  - Popover, Dialog and DropdownMenu move focus only when the close strands it
    (FR17–FR20; SC 2.4.3, Focus Order): focus that used to fall to the body
    goes to the opener or its stand-in; a Dialog no longer takes back focus a
    caller moved in its close notification; and a DropdownMenu no longer
    focuses its trigger when focus never entered the menu.

  No input restores a changed behavior: `isModal: true` is the modal behavior,
  and focus return has no off switch (FR18).

- **FR23 — The trigger inputs keep their meaning.** Popover's `anchorRef`
  remains a referenced trigger and anchor (`component:Popover` AV1), because
  Popover has no other trigger input. With `usePopover`, the element given to
  `triggerRef` is the trigger and the anchor; when `anchorRef` is set, the
  element it holds is the anchor instead, and the `triggerRef` element keeps
  only the trigger role. On the hook, `anchorRef` never makes an element a trigger.

### Platform support

- Supported feature/engine floor: the layer runtime's CSS anchor positioning
  floor (`architecture:layer-runtime`).
- Unsupported behavior: in an engine without invoker-based focus order,
  FR12's non-modal order is the DOM order, in which a layer rendered at its
  JSX position follows the content before it.
- Browser evidence: real Chromium, Firefox and WebKit for FR3, FR6, FR9,
  FR12, FR17–FR20 and AR1; jsdom for ARIA, focus order, event ordering and
  AR2–AR4.

## Current-state impact

- `component:Popover`: Public concepts gains an Anchor row, available on
  `usePopover` only, and its Modality row says `isModal` sets containment.
  DEC-9's rule that every Popover is a focus region, modal or not, and its
  rejection of "no Tab containment for non-modal popovers", are superseded for
  `isModal: false` (DEC-5); DEC-9 keeps its text and gains an amendment line,
  and still governs the modal default. AR3, the Tab row, the AR3 and DEC-9
  verification row and Open questions narrow containment to the modal
  default. DEC-8's modal, always light-dismissing sheet is superseded for
  `isModal: false` (FR16), with an amendment line. AR4 and the close state row
  follow FR20's order, and DEC-9's amendment also hands its return target to FR17–FR20. The Dismissal concept row and the `usePopover` light and Escape dismissal row say the native auto path holds until FR15 ships. The Trigger binding and side-effect lines and FR9 name
  the anchor, the trigger unless `usePopover` names another element. The
  "no viewport-rectangle anchor" line stays and names `usePopover`'s element
  anchor. Released default preserved notes the FR22 changes.
- `component:Dialog` FR4 and AR2 and `component:DropdownMenu` FR6 point to
  FR17–FR20 for the return target and its fallbacks. Dialog's AV4 and its
  "modal close" state follow FR20 when the invoker is gone, its FR4 fallback
  clause and its FR17 condition carry an `FR4 gap:` line (FR17, FR19 and FR20), and its
  Released default and Migration decision lines note the FR22 change.
- `component:DropdownMenu`: its Released default line notes the FR22 change,
  FR6 gains FR17's condition, and its condition, inheritance and fallback
  clauses carry an `FR6 gap:` line (FR17, FR19 and FR20 gaps).
- `component:BottomSheet` keeps its own `finalFocusRef` rule (FR11); FR17–FR21
  do not cover a BottomSheet used directly.
- `architecture:layer-runtime`: INV18, INV20 and INV22 say "trigger" for the
  element a layer anchors to; with a separate anchor they read "anchor", and
  the trigger keeps only its trigger role (FR1). INV7's move in the same
  gesture also covers a `usePopover` `show()`, which moves the layer to the
  element its `anchorRef` holds (FR9). INV20's centered case and the touch
  growth use the anchor's center. Its Purpose and positioning-mode prose and
  its browser-close note say "anchor" the same way.
- `family:overlay-dismissal`: its rule that Escape closes the topmost
  participant gains one exception: a non-modal participant takes Escape only
  while focus is inside it, or on or inside its anchor or trigger (FR15). A platform close
  request follows the same presence rule (`family:overlay-dismissal` FR3). Its matrix rows for a
  Popover inside a Dialog, in the page and in an iframe, name the modal or
  focus-holding Popover. Its `FR2 and FR3 gap:` line cites the
  FR15 gap.
- Tooltip, BaseTypeahead and Popover each take `anchorRef` as a ref to an
  `HTMLElement`. `usePopover`'s is a ref to an `Element` (FR2). This record
  does not change the other three; a ref to an `Element` there would accept
  every ref they accept today (`spec:AST-017` FR5).
- Consumer docs: `usePopover.doc.mjs` documents `anchorRef`;
  `Popover.doc.mjs`, `usePopover.doc.mjs`, `Dialog.doc.mjs` and
  `DropdownMenu.doc.mjs` document `isModal`'s meaning and that focus return has
  no off switch.
- Callers that set `isModal: false` today, and what changes for each: Tab
  leaves in page order, and Escape works only while focus is inside the
  popover, or on or inside its anchor or trigger.
  - PowerSearch's token editor (a dialog popover) and its role-`none` adding
    popup, which share one `usePopover` call.
  - The rich text editor's link form, a dialog popover in a published package.
  - The `LayerSamePress` story and Popover's own tests.

FR1 gap: `usePopover` anchors only to the element `triggerRef` receives, with
no separate anchor; Popover's `anchorRef` that names an element holding no
button warns in development and never anchors.
FR9 gap: `usePopover` has no separate anchor to move to (FR1 gap), so a
`show()` in the same press moves the layer only to another trigger.
FR12 gap: focus containment is active whenever the popover is open, whatever
`isModal` says.
FR15 gap: Escape on a non-modal popover closes it through native auto light
dismiss or the shared dismissal stack, wherever focus is.
FR16 gap: every sheet is the modal sheet; `isModal` does not apply there.
FR17 gap: a Dialog takes focus back to its invoker even when a caller moved it
outside, and a DropdownMenu focuses its trigger at close whenever focus is on
the body, even when focus never entered the menu.
FR19 gap: a Dialog opened from a menu row returns focus to the row, which the
closed menu removed, so focus falls to the body.
FR20 gap: a Popover whose opener was removed while it was open leaves focus on
the body.
FR21 gap: no development warning names a layer whose focus return finds no
candidate.
AR4 gap: a dialog popover opened from code is not announced.

## Verification

| Contract   | Verification                                                          | Representative states                                                                                                                                                                                                                                                              | Mutation or failure expectation                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR23  | `PopoverAnchor.test.tsx` and `Popover.test.tsx`                       | `anchorRef` with a trigger; with no trigger; Popover `anchorRef`                                                                                                                                                                                                                   | ARIA or a handler on the anchor, or the trigger losing ARIA, fails                                                                                                                  |
| FR2, FR5   | `PopoverAnchor.test.tsx`                                              | A `div`, a table cell, an `<svg>`, a shape in an `<svg>`; a trigger-less popover opened by `show()` and dismissed                                                                                                                                                                  | A boxed anchor that warns or does not anchor, a shape with no warning, or a trigger-less dismissal without `onHide`, fails                                                          |
| FR3, FR6   | `PopoverAnchor.test.tsx` and a real-browser interaction spec          | The ref set to another element, then a render; the same, then `show()`; an anchor removed and re-added; an empty ref at open                                                                                                                                                       | A remount, a close, a focus move, or a visible surface without an anchor fails                                                                                                      |
| FR9        | `PopoverAnchor.test.tsx` and a real-browser interaction spec          | A press on another control whose handler sets `anchorRef.current` and calls `show()`; the same with the anchor unchanged; an outside press that calls nothing; a press on the separate anchor; a press on the trigger; `show()` from a press-down handler and from a click handler | A reported `onHide`, an open-state change, a remount, a focus move, or a frame with the surface closed fails; an outside press that calls nothing and leaves the popover open fails |
| FR12–FR16  | `useFocusTrap.test.tsx`, `Popover.test.tsx` and a real-browser spec   | Modal and non-modal; Tab at each edge and from the anchor; Tab from outside; role `none`; Escape in and out; the sheet                                                                                                                                                             | A non-modal popover that holds Tab, a modal one that leaks it (FR14's role-neutral popups excepted), `aria-modal` on a non-modal one, or a modal sheet fails                        |
| FR17, FR18 | `focusReturn.test.ts` and the Popover, Dialog and DropdownMenu suites | Focus inside at close; on the body; moved outside before close; moved by the hide notification                                                                                                                                                                                     | Focus moved from outside the layer, or left on the body, fails                                                                                                                      |
| FR19       | Menu-to-Dialog suite in jsdom and real Chromium                       | A menu row opens a Dialog; the Dialog closes; nested popovers; a layer that closes over an open child that never took focus, and over one that focus has left                                                                                                                      | Focus on the body or on the removed row fails                                                                                                                                       |
| FR20, FR21 | `focusReturn.test.ts` and a real-browser spec                         | Each candidate missing in turn: a tour opened by code, a remounted filter button, a removed opener, no candidate left                                                                                                                                                              | A candidate skipped out of order, a hidden or closing candidate chosen, focus on the body, or no warning fails                                                                      |
| FR22       | Existing Popover, Dialog, DropdownMenu and Popover-family suites      | Every released state except FR22's three named changes                                                                                                                                                                                                                             | Any other changed expectation in an existing suite fails                                                                                                                            |
| AR1        | Real-browser interaction spec                                         | Focus inside a surface whose anchor leaves the document, with a trigger and with none                                                                                                                                                                                              | Focus left in a hidden surface, or moved back when it shows, fails                                                                                                                  |
| AR2–AR4    | `Popover.test.tsx` accessibility suite                                | A trigger-less popover with a separate anchor; a fallback without a tab stop; a popover opened by code                                                                                                                                                                             | An ARIA attribute on the anchor, a tab stop left behind, or an unannounced code-opened popover fails                                                                                |

## Decision log

### DEC-1 — One `anchorRef` input names the anchor

**Reference:** `spec:AST-116/DEC-1`
**Decider:** `nynexman4464`, `2026-11-18`

The anchor answers one question, which box the layer sits on, so one input
carries it, and it is a ref named for the element's job
(`architecture:public-component-api` INV2). On `usePopover`, `triggerRef`
names the trigger, so `anchorRef` names only the anchor. Popover's
`anchorRef` stays a button that is also the trigger, because Popover has no
other trigger input (`component:Popover` AV1). On both, the name means the
element the popover sits on.

Rejected: a function that returns the anchor, alone or in a union with the
ref, because a caller that holds an element sets the ref before it calls
`show()` (FR3), and one input then has one read rule; a name without `Ref`,
because every ref-valued input ends in `Ref`; widening Popover's `anchorRef`
to non-buttons, because it would change what a released input does to the
element it names; and a rectangle anchor with no element, because every
consumer holds an element.

### DEC-5 — `isModal` is the modality switch, and non-modal means page order

**Reference:** `spec:AST-116/DEC-5`
**Decider:** `nynexman4464`, `2026-11-17`

Containment is a modality policy, not a separate concept: one boolean names
whether the popover is modal. A modal popover
contains Tab and says so with `aria-modal`; a non-modal popover does neither,
and Tab follows the browser's order: the popover's controls come after its
trigger, or after the anchor when there is no trigger (FR12). A coachmark or tour step is non-modal so the person can reach the control
it describes. This supersedes `component:Popover` DEC-9 and AR3 for
`isModal: false`, and `component:Popover` DEC-8's modal, always light-dismissing sheet for an
`isModal: false` sheet (FR16), and adds FR15's exception to
`family:overlay-dismissal`'s topmost Escape; Popover's DEC-9 and DEC-8 still govern the
modal default.

Rejected: a separate focus-region input with a value that cycles through the
popover and its anchor, which would be a second name for modality and a trap
the platform does not have.

Amended: `spec:AST-119` DEC-6 makes a tour step with a backdrop modal. The
tour step this decision calls non-modal is a step without a backdrop.

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

### DEC-8 — The position-only anchor lives on `usePopover`, not on Popover

**Reference:** `spec:AST-116/DEC-8`
**Decider:** `nynexman4464`, `2026-11-18`

A position-only anchor serves compositions such as a tour, a popover shared
between table rows, or a filter that moves between column headers.
`usePopover` is the public layer for composition, so the input lives there.
The Popover component keeps its trigger-first props, so its common use stays
small.

Rejected: a position-only anchor on Popover, which grows the component for few
callers and gives it two anchor inputs; and a `BasePopover` component, which
would share `usePopover`'s job (`architecture:public-component-api` INV21).

### DEC-10 — A repeated `show()` moves the popover

**Reference:** `spec:AST-116/DEC-10`
**Decider:** `nynexman4464`, `2026-11-18`

The known cases for keeping a popover open on an outside press are presses
that show the same popover somewhere else: another row's edit control,
another column header. The layer runtime already moves a layer that another
trigger shows in the same gesture (`architecture:layer-runtime` INV7), so the
same rule covers a `show()` with `anchorRef` and needs no input. No input
vetoes a press that does not show the popover; OQ1 holds the question.

## Open questions

- **OQ1 — How does a caller keep a popover open on an outside press that does
  not show it?** (`human-api`) The cases are a press in a related panel, a
  press inside UI that a third party renders outside the popover, and a
  popover that stays open while its content has unsaved changes. No current caller has one. Options: a built-in rule with no
  input, as FR9 is; or an `onOutsidePress` callback on `usePopover` that
  receives each outside press before the dismissal, with the pressed element
  and the pointer type and no native event, whose `preventDefault()` keeps the
  popover open and leaves the press, its focus change and its click
  untouched. Until ruled, such a caller sets `hasLightDismiss: false` and
  closes the popover itself.
