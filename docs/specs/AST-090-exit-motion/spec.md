---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-090
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [ernestt, cixzhang]
affects_architecture: [architecture:theme-tokens, architecture:layer-runtime]
affects_families: [family:overlay-dismissal]
affects_contributing: []
affects_consumer_docs:
  [
    motion,
    theme,
    Dialog,
    AlertDialog,
    CommandPalette,
    Popover,
    Tooltip,
    HoverCard,
    DropdownMenu,
    ContextMenu,
    Selector,
    ComplexSelector,
    PowerSearch,
    Breadcrumbs,
    BottomSheet,
  ]
review_triggers: [motion, tokens, layering, behavior, accessibility]
---

# Exit motion system spec

## Intent

A surface that animates in can animate out, so a person sees where it went and
what it uncovered. In a pointer presentation, whether a kind of surface plays
its exit is a theme decision: with no theme setting, the surface closes at once,
as a surface without an exit does. A touch presentation plays the exit of its
native counterpart instead (`spec:AST-094` FR7), and the switches here do not
reach it.

A **touch presentation** is a presentation under a coarse primary pointer,
after hydration, as `spec:AST-094` FR13 defines it. Every other presentation,
including a server render and the hydrating render, is a **pointer
presentation**.

This record owns the exit vocabulary, the switch that turns exits on for each
kind of surface in a pointer presentation, how a pointer-presented surface
behaves while it leaves, and the browsers in which its layer exits play. Two
kinds of surface gain an exit:

- A **dialog surface** is a `Dialog`, including the dialogs that `AlertDialog`,
  `CommandPalette`, `useImperativeDialog`, and `useImperativeAlertDialog`
  render.
- A **layer surface** is an anchored layer that plays the shared layer
  entrance. The current members are `Popover`, `Tooltip`, `HoverCard`,
  `DropdownMenu` and its sub-menus, `ContextMenu`, `Selector`,
  `ComplexSelector`, `PowerSearch`, and the menu of a `BreadcrumbItem`. This
  list is a snapshot, not a closed set.

`design:motion` owns motion intent and leaves tokens and component behavior to
other records. `architecture:theme-tokens` owns the token vocabulary, not which
components read a token or what they do while they close. A switch that a dozen
components read through two shared primitives is a system fact.

## Non-goals

- Exits of touch presentations, which each component's record gives under
  `spec:AST-094` FR7 and FR8 (FR14). The exit tokens here do not reach touch
  motion, whose roles stay internal (`spec:AST-094` FR4, DEC-11).
- Surfaces that already animate out (`Drawer`, `BottomSheet`, `MobileNav`,
  `Toast`, and the `TopNavMegaMenu` panel) keep their exits, durations, and
  curves. `BottomSheet`'s close in a pointer presentation reads `--ease-exit`
  at the curve it uses (FR12); moving the others onto the exit vocabulary is a
  visual change for a separate decision.
- Layers with no entrance (`Typeahead` suggestions, `MultiSelector`,
  `Tokenizer`, the date and time pickers, the `TabList` overflow menu, the
  `TopNav` and `SideNav` menus, and Chat trigger menus) gain no exit here.
- Elements in page flow that animate in, such as `FieldStatus` and
  `useEntryAnimation`, gain no exit here (OQ2).
- Entrances do not change: their durations and curves, the entrance of a layer
  that a hover opens, and the `Dialog` backdrop's entrance.
- The rest of a semantic motion vocabulary (entry, movement, and state curves;
  entrance, overlay, and reveal durations) is not settled here. The exit names
  follow the `--ease-<job>` and `--duration-<job>` pattern so that vocabulary
  can join them without a rename.
- Equivalent internal implementations remain valid when they satisfy this
  contract. How a dialog stays open while it leaves, how a layer stays in the
  top layer while it leaves, and how the end of an exit is detected are
  implementation.

## Requirements

FR1–FR13 govern dialog and layer surfaces in a pointer presentation. FR14
governs them in a touch presentation.

- **FR1 — Exits are off by default.** `--duration-exit-dialog` and
  `--duration-exit-layer` default to `0ms`. An exit duration a theme sets as a
  reference to a tempo-scaled token, such as FR12's `var(--duration-exit)`,
  follows the theme's tempo; one set as a literal plays as written
  (`spec:AST-108` FR5). A surface whose kind's exit
  duration is zero closes at once: it is hidden in the update that closes it,
  and focus, callbacks, and dismissal behave as they do for a surface with no
  exit.
- **FR2 — A theme turns on each kind.** A surface plays its exit when its
  kind's exit duration, resolved on the surface, is greater than zero. The two
  kinds are independent. The durations resolve like any token, so a theme or a
  nested `Theme` turns a kind on or off for the surfaces it themes.
- **FR3 — An exit retraces its entrance.** A leaving surface travels back along
  its entrance path and fades out, on `--ease-exit`, over its kind's exit
  duration. A dialog shrinks back toward the element that opened it, or
  downward when none did; a fullscreen dialog only fades; a layer shrinks back
  toward its anchor, mirrored in right-to-left layouts as its entrance is. A
  dialog's backdrop fades out over the same duration.
- **FR4 — A leaving surface takes no input.** From the moment its close begins,
  no pointer press or key activates anything in a leaving surface's own content.
  Toasts that a leaving dialog hosts are not its content (FR13).
- **FR5 — A leaving surface keeps its dismissal role.** Until it is hidden, a
  leaving surface keeps the dismissal role it had while open (`spec:AST-003`
  FR1). A leaving active or blocking owner stays present on the shared
  dismissal stack (`family:overlay-dismissal` FR2), so an Escape press or
  platform close request during its exit does not reach an owner beneath it. A
  leaving passive dependent, such as `Tooltip`, stays passive and shields
  nothing (`spec:AST-003` FR4).
- **FR6 — Focus leaves with the close.** A layer surface hands focus back when
  its close begins, as it does with the exit off. A dialog surface returns focus
  to the element that opened it when the dialog is hidden; until then the page
  behind the modal dialog cannot take focus.
- **FR7 — Callbacks report the request.** `onOpenChange(false)`, `onHide`, and
  a layer's `isOpen` change when the close is requested, as with the exit off. A
  dialog's native `close` event fires when the dialog is hidden.
- **FR8 — Interruptions resolve without a flash.** Reopening a leaving surface
  keeps it on screen and returns it to its open state; it is never hidden and
  shown again. Unmounting a leaving surface, or hiding its subtree with React
  `Activity`, removes it at once.
- **FR9 — A leaving surface is never stranded.** A leaving surface is hidden no
  later than 100ms after its exit duration elapses, whether or not the browser
  reports the end of its exit. That includes a page that disables animations and
  transitions, and a surface that opens and closes in the same update.
- **FR10 — Reduced motion closes at once.** Under
  `prefers-reduced-motion: reduce`, a dialog or layer surface in a pointer
  presentation closes at once, whatever its kind's exit duration
  (`design:reduced-motion` DR3, DR4).
- **FR11 — Content stays while it leaves.** A surface keeps rendering the
  content it showed when its close began until it is hidden. A component does
  not unmount or reset its own content before its exit ends: a hover card's
  lazily mounted content, a menu's open sub-menu path, and a selector's search
  query keep their state until the surface is hidden.
- **FR12 — The exit vocabulary.** `--ease-exit` defaults to
  `cubic-bezier(0.3, 0, 0.6, 0.6)`, a curve that moves off slowly and leaves
  fast. Dialog and layer exits use it, and so does `BottomSheet`'s close in a
  pointer presentation.
  `--duration-exit` defaults to `var(--duration-fast)` and is the standard
  dismissal duration. A theme turns a kind on by setting its exit duration to
  `var(--duration-exit)` or to any other duration.
- **FR13 — Toasts stay operable above a leaving dialog.** A leaving dialog is
  still a native modal, so it keeps supplying its modal outlet
  (`spec:AST-003` FR18) until it is hidden. Toasts stay visible and operable
  above it for the whole exit (`spec:AST-003` FR16). When it is hidden, they
  move to the latest remaining outlet with their entries and timers intact
  (`spec:AST-003` FR18, FR19).
- **FR14 — Touch presentations keep their native exit.** A dialog or layer
  surface in a touch presentation plays the exit its component's record gives
  it under `spec:AST-094` FR7 and FR8. The exit switches, `--ease-exit`, and
  `--duration-exit` do not change that exit: a theme that leaves a kind off
  does not remove it, and a theme that turns a kind on does not replace it.

### Platform support

- Supported feature and engine floor: the tiers in the `browser-support`
  consumer doc.
- This section covers pointer presentations; a touch exit follows
  `spec:AST-094`.
- Dialog exits play in every Tier 1 and Tier 2 browser.
- Layer exits play only in browsers that can keep a closing layer in the top
  layer until its exit ends, which takes a transition of `overlay` with
  `transition-behavior: allow-discrete`. In other browsers, and where the
  Popover API is missing, a layer closes at once whatever its exit duration:
  the same result as the exit off.
- Browser evidence: real-browser sampling of frames during an exit, in a browser
  that plays layer exits and in one that does not.

## Current-state impact

- `architecture:theme-tokens`: `--ease-exit`, `--duration-exit`,
  `--duration-exit-dialog`, and `--duration-exit-layer` join the canonical
  vocabulary, with their theme template and generated token documentation
  projections (INV1, INV7).
- `architecture:layer-runtime`: a layer's close gains a leaving phase between
  `hide()` and the moment the layer is hidden. Native close reconciliation stays
  single-fired (INV6), and lazily mounted content unmounts when the exit ends.
  A leaving Dialog keeps supplying its modal outlet until it is hidden (FR13);
  BottomSheet's outlet behavior does not change.
- `family:overlay-dismissal`: no claim changes. A leaving member stays present
  for FR2 until it is hidden, and animation stays member-owned (AV6).
- `spec:AST-003`: no claim changes. A leaving surface keeps its interaction role
  (FR1), and a leaving passive dependent such as `Tooltip` still never shields
  an owner (FR4, DEC-1). A leaving dialog is still the current native modal, so
  it keeps its outlet and toasts stay operable above it (FR16, FR18).
- `spec:AST-094`: no claim changes. A touch presentation keeps the exit FR7 and
  FR8 give it (FR14), and its motion roles stay internal (FR4, DEC-11). The exit
  tokens here time pointer presentations, which its non-goals leave to the
  theme's duration and easing tokens.
- `design:reduced-motion`: no claim changes. Under reduced motion a pointer
  presentation's exit completes at once (DR3, FR10), and a touch presentation's
  exit cross-fades through `spec:AST-094` FR8 (DR2).
- `design:motion` (draft): exits apply DR1, DR2, and DR5. This record holds the
  exit tokens and behavior that its content boundary leaves to other records.
- `component:Dialog`: its `visibility` concept (open, closed) gains a leaving
  phase. With dialog exits on, a Dialog whose caller has closed it stays
  presented, with the page behind it inert and toasts still operable above it,
  until its exit ends (FR6, FR9, FR13). AR2 keeps its focus-return claim; FR6
  states when the return happens.
- `component:Popover`: AR4 keeps its focus-return claim; FR6 states when the
  return happens for a layer.
- `component:BottomSheet`: its closing curve in a pointer presentation reads
  `--ease-exit`.
- Consumer docs: `motion` describes both curves, that exits are off by default
  in a pointer presentation, how a theme turns each kind on, that touch
  presentations keep their native exits, and that callers keep content rendered
  while a surface closes. The token tables and the theme template list the new
  tokens, and each member component's docs describe its exit.

## Verification

| Contract | Verification                                                                                                | Representative states                                                                                                                     | Mutation or failure expectation                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Component unit suites run unchanged with default tokens                                                     | Every dialog and layer member in a pointer presentation, opened and closed                                                                | A surface stays rendered after its close with default tokens                                                               |
| FR2      | Real-browser test under a theme that sets one kind, fine primary pointer                                    | Dialogs on with layers off; layers on with dialogs off; a nested `Theme`                                                                  | The unset kind animates, or the set kind closes at once                                                                    |
| FR3      | Real-browser frame sampling during an exit                                                                  | A dialog with and without an opener, a fullscreen dialog, a layer in each placement, right-to-left                                        | The surface leaves its entrance path, or keeps the entrance curve                                                          |
| FR4      | Real-browser test                                                                                           | A press and an Enter key on a control inside a leaving surface                                                                            | The control activates                                                                                                      |
| FR5      | Dismissal invariant tests                                                                                   | Escape during a leaving Dialog or Popover with an owner beneath; Escape during a leaving Tooltip over a Dialog                            | The owner beneath a leaving owner closes, or a leaving Tooltip absorbs the press                                           |
| FR6      | Unit and real-browser focus tests                                                                           | Dialog and layer closes, by keyboard and by pointer                                                                                       | Dialog focus returns before the dialog is hidden or lands on the body; layer focus waits for exit                          |
| FR7      | Unit tests                                                                                                  | Controlled and uncontrolled closes                                                                                                        | A callback or `isOpen` waits for the exit                                                                                  |
| FR8      | Unit and real-browser tests                                                                                 | Reopen during an exit, unmount during an exit, `Activity` hidden during an exit                                                           | The surface disappears and reappears, or stays after unmount                                                               |
| FR9      | Unit test with a suppressed end event; real-browser test with animations and transitions disabled page-wide | Open and close in one update; page-wide `transition: none`; no end event                                                                  | The surface is present more than 100ms after its exit duration                                                             |
| FR10     | Real-browser test with reduced motion emulated, fine primary pointer                                        | Each kind turned on                                                                                                                       | An exit plays                                                                                                              |
| FR11     | Unit tests                                                                                                  | Hover card content, an open sub-menu path, a selector query                                                                               | Content unmounts or resets before the surface is hidden                                                                    |
| FR12     | Token default tests, theme template inventory test, token documentation check                               | Defaults; the `BottomSheet` closing curve                                                                                                 | A default drifts, or `BottomSheet` restates the curve                                                                      |
| FR13     | Real-browser test                                                                                           | A toast action pressed, and a toast dismissed, during a dialog exit; the same toast after the dialog is hidden                            | The toast ignores input or fades with the dialog during the exit, or loses its entries or timers when the dialog is hidden |
| FR14     | Real-browser test with a coarse primary pointer, after hydration                                            | A Dialog, a Popover, and a menu opened and closed by a finger, with each kind switched off and on; the same surfaces under reduced motion | A switch changes the touch exit, or the surface closes without the exit `spec:AST-094` FR7 and FR8 give it                 |
| Platform | Real-browser tests                                                                                          | A browser that plays layer exits and one that does not                                                                                    | A layer paints outside the top layer, or a browser without support delays the close                                        |

## Decision log

### DEC-1 — Exits ship off, and a theme turns them on

**Reference:** `spec:AST-090/DEC-1`
**Decider:** pending owner review

Turning exits on changes how every pointer-presented dialog and layer closes in
every product at once, so the capability ships switched off and a theme opts
in: the same place that tunes motion through its motion scale. The switches are
tokens because an exit's timing is an implementation value, not a per-call
concept (`spec:AST-002` FR3), and because a prop cannot reach the layers that
other components compose, such as every `tooltip` prop.

Rejected: an exit prop on each component, which restates timing at every call site and misses composed layers; exits on by default, which changes every overlay in one release.

### DEC-2 — One switch per kind of surface

**Reference:** `spec:AST-090/DEC-2`
**Decider:** pending owner review

A person closes a dialog deliberately, and its exit shows what it uncovered. A
layer is dismissed as attention moves on, often many times a minute
(`design:motion` DR2). A theme that wants dialogs to animate out does not have
to animate every tooltip and menu to get it.

Rejected: one switch for every surface.

### DEC-3 — An exit retraces its entrance on an accelerating curve

**Reference:** `spec:AST-090/DEC-3`
**Decider:** pending owner review

An animated exit follows its entrance's path back, as the motion docs ask. It
runs on its own curve: a decelerating curve spends its travel in the first
moments of the close, before the eye can follow it, while an accelerating curve
moves off from rest and leaves fast. `BottomSheet` closes on this curve, and
`--ease-exit` names it.

Rejected: the entrance played backwards on `--ease-standard`.

### DEC-4 — Layer exits play only where the browser holds a closing layer

**Reference:** `spec:AST-090/DEC-4`
**Decider:** pending owner review

The browser hides a light-dismissed layer before Core hears of it, so only CSS
can animate that close. A layer that keeps painting after it leaves the top
layer paints in the wrong place. Where the browser cannot keep a closing layer
in the top layer, the layer closes at once, which is also the default.

Rejected: replacing native light dismissal with Core-owned outside-press handling so every browser plays layer exits.

### DEC-5 — Touch presentations keep their native exit

**Reference:** `spec:AST-090/DEC-5`
**Decider:** pending owner review

On a touch device a surface moves the way its native counterpart does, by
default and with no opt-in (`spec:AST-094`), and that record leaves pointer
presentations' timing and easing to the theme's tokens. The switches here
therefore govern pointer presentations only, and a touch presentation keeps
its native exit whatever they resolve to.

Rejected: letting the exit switches turn touch exits off, which removes the exit `spec:AST-094` FR7 requires.

## Open questions

- **OQ1 — Whether a pointer-presented dialog's exit ships on, and at which
  duration** (`human-design`). Options: keep it off; default
  `--duration-exit-dialog` to `var(--duration-exit)`; or default it to a
  duration from the entrance band, because a person who closes a dialog
  deliberately watches it go.
- **OQ2 — Whether elements in page flow gain an exit kind** (`human-design`).
  `FieldStatus` and `useEntryAnimation` animate in and vanish when removed. An
  exit would keep a validation message in the layout while it leaves, which
  `design:motion` DR4 weighs against.
