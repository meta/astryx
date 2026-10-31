---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-090
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
phase: accepted
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
  motion: its roles stay internal, and a theme reaches it only through
  `spec:AST-108`'s knobs (`spec:AST-094` FR4, DEC-15).
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
  contract. How a dialog stays open while it leaves, how a leaving layer stays
  drawn where it was, and how the end of an exit is detected are
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
  dialog's backdrop fades out over the same duration. `--ease-exit` applies to
  CSS-timed exits; a spring-driven exit plays its own exit role, and a CSS part
  beside it takes the spring's settle time (`spec:AST-108` FR3, FR4a).
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
  its close begins, as it does with the exit off, and from then on its exit is
  hidden from assistive technology: a screen reader neither reads nor announces
  it. A dialog surface returns focus
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
- **FR11 — Content stays while it leaves.** A leaving surface keeps showing the
  content it showed when its close began until it is hidden: a hover card's
  content, a menu's open sub-menu, and a selector's search query stay on screen
  until the surface is hidden.
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
- Dialog and layer exits play in every Tier 1 and Tier 2 browser.
- A layer whose exit cannot be drawn in the top layer, such as where the
  Popover API is missing, closes at once whatever its exit duration: the same
  result as the exit off.
- Browser evidence: real-browser sampling of frames during a dialog exit and a
  layer exit, in Chromium and WebKit, and a layer close where the Popover API
  is missing.

## Current-state impact

- `architecture:theme-tokens`: `--ease-exit`, `--duration-exit`,
  `--duration-exit-dialog`, and `--duration-exit-layer` join the canonical
  vocabulary, with their theme template and generated token documentation
  projections (INV1, INV7).
- `architecture:layer-runtime`: a layer closes when its close is requested, as
  it does with the exit off, and its exit plays after that on the runtime's
  shared exit copy (INV14), drawn in the top layer where the layer was. Native
  close reconciliation stays single-fired (INV6). A leaving active or blocking
  owner keeps its place on the dismissal stack until its exit ends (FR5). A
  leaving Dialog keeps supplying its modal outlet until it is hidden (FR13);
  BottomSheet's outlet behavior does not change.
- `architecture:component-style-authoring`: no claim changes. A layer's exit
  is the one transient exit copy INV7 allows, made by the shared mechanism and
  removed when the exit ends (FR9).
- `family:overlay-dismissal`: no claim changes. A leaving member stays present
  for FR2 until it is hidden, and animation stays member-owned (AV6).
- `spec:AST-003`: no claim changes. A leaving surface keeps its interaction role
  (FR1), and a leaving passive dependent such as `Tooltip` still never shields
  an owner (FR4, DEC-1). A leaving dialog is still the current native modal, so
  it keeps its outlet and toasts stay operable above it (FR16, FR18).
- `spec:AST-094`: no claim changes. A touch presentation keeps the exit FR7 and
  FR8 give it (FR14), and its motion roles stay internal (FR4, DEC-15). The exit
  tokens here time pointer presentations, which its non-goals leave to the
  theme's duration and easing tokens.
- `spec:AST-108`: no claim changes. Its FR2 admits `--ease-exit` at the same
  curve at every `character`; a spring-driven exit plays its own exit role and
  a CSS part beside it takes the spring's settle time (FR3, FR4a); and an exit
  duration set as a reference to a tempo-scaled token follows `tempo` (FR5).
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
- `component:BottomSheet`: its close in a pointer presentation reads
  `--ease-exit`. Its touch close keeps its own motion, which the exit tokens do
  not reach (`spec:AST-094` FR7, DEC-15).
- Consumer docs: `motion` describes both curves, that exits are off by default
  in a pointer presentation, how a theme turns each kind on, that touch
  presentations keep their native exits, and that callers keep content rendered
  while a surface closes. The token tables and the theme template list the new
  tokens, and each member component's docs describe its exit.

## Verification

| Contract | Verification                                                                                                | Representative states                                                                                                                     | Mutation or failure expectation                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Component unit suites run unchanged with default tokens                                                     | Every dialog and layer member in a pointer presentation, opened and closed                                                                | A surface stays rendered after its close with default tokens                                                                                               |
| FR2      | Real-browser test under a theme that sets one kind, fine primary pointer                                    | Dialogs on with layers off; layers on with dialogs off; a nested `Theme`                                                                  | The unset kind animates, or the set kind closes at once                                                                                                    |
| FR3      | Real-browser frame sampling during an exit                                                                  | A dialog with and without an opener, a fullscreen dialog, a layer in each placement, right-to-left                                        | The surface leaves its entrance path, or keeps the entrance curve                                                                                          |
| FR4      | Real-browser test                                                                                           | A press and an Enter key on a control inside a leaving surface                                                                            | The control activates                                                                                                                                      |
| FR5      | Dismissal invariant tests                                                                                   | Escape during a leaving Dialog or Popover with an owner beneath; Escape during a leaving Tooltip over a Dialog                            | The owner beneath a leaving owner closes, or a leaving Tooltip absorbs the press                                                                           |
| FR6      | Unit and real-browser focus and accessibility-tree tests                                                    | Dialog and layer closes, by keyboard and by pointer; the accessibility tree during a layer exit                                           | Dialog focus returns before the dialog is hidden or lands on the body; layer focus waits for the exit; a leaving layer's exit is in the accessibility tree |
| FR7      | Unit tests                                                                                                  | Controlled and uncontrolled closes                                                                                                        | A callback or `isOpen` waits for the exit                                                                                                                  |
| FR8      | Unit and real-browser tests                                                                                 | Reopen during an exit, unmount during an exit, `Activity` hidden during an exit                                                           | The surface disappears and reappears, or stays after unmount                                                                                               |
| FR9      | Unit test with a suppressed end event; real-browser test with animations and transitions disabled page-wide | Open and close in one update; page-wide `transition: none`; no end event                                                                  | The surface is present more than 100ms after its exit duration                                                                                             |
| FR10     | Real-browser test with reduced motion emulated, fine primary pointer                                        | Each kind turned on                                                                                                                       | An exit plays                                                                                                                                              |
| FR11     | Real-browser frame sampling during an exit                                                                  | A hover card, a menu with an open sub-menu, a selector with a search query                                                                | The leaving surface shows other content, or none, before it is hidden                                                                                      |
| FR12     | Token default tests, theme template inventory test, token documentation check                               | Defaults; the `BottomSheet` closing curve                                                                                                 | A default drifts, or `BottomSheet` restates the curve                                                                                                      |
| FR13     | Real-browser test                                                                                           | A toast action pressed, and a toast dismissed, during a dialog exit; the same toast after the dialog is hidden                            | The toast ignores input or fades with the dialog during the exit, or loses its entries or timers when the dialog is hidden                                 |
| FR14     | Real-browser test with a coarse primary pointer, after hydration                                            | A Dialog, a Popover, and a menu opened and closed by a finger, with each kind switched off and on; the same surfaces under reduced motion | A switch changes the touch exit, or the surface closes without the exit `spec:AST-094` FR7 and FR8 give it                                                 |
| Platform | Real-browser tests in Chromium and WebKit                                                                   | A dialog exit and a layer exit with each kind on; a layer close where the Popover API is missing                                          | A layer exit paints outside the top layer or does not play, or a close without the Popover API is delayed                                                  |

## Decision log

### DEC-1 — Exits ship off, and a theme turns them on

**Reference:** `spec:AST-090/DEC-1`
**Decider:** `cixzhang`, `2026-10-28`

Turning exits on changes how every pointer-presented dialog and layer closes in
every product at once, so the capability ships switched off and a theme opts
in: the same place that tunes motion through its motion scale. The switches are
tokens because an exit's timing is an implementation value, not a per-call
concept (`spec:AST-002` FR3), and because a prop cannot reach the layers that
other components compose, such as every `tooltip` prop.

Rejected: an exit prop on each component, which restates timing at every call site and misses composed layers; exits on by default, which changes every overlay in one release.

### DEC-2 — One switch per kind of surface

**Reference:** `spec:AST-090/DEC-2`
**Decider:** `cixzhang`, `2026-10-28`

A person closes a dialog deliberately, and its exit shows what it uncovered. A
layer is dismissed as attention moves on, often many times a minute
(`design:motion` DR2). A theme that wants dialogs to animate out does not have
to animate every tooltip and menu to get it.

Rejected: one switch for every surface.

### DEC-3 — An exit retraces its entrance on an accelerating curve

**Reference:** `spec:AST-090/DEC-3`
**Decider:** `cixzhang`, `2026-10-28`

An animated exit follows its entrance's path back, as the motion docs ask. It
runs on its own curve: a decelerating curve spends its travel in the first
moments of the close, before the eye can follow it, while an accelerating curve
moves off from rest and leaves fast. `BottomSheet` closes on this curve, and
`--ease-exit` names it.

Rejected: the entrance played backwards on `--ease-standard`.

### DEC-4 — A layer's exit plays where the layer was drawn

**Reference:** `spec:AST-090/DEC-4`
**Decider:** `cixzhang`, `2026-10-28`

The browser hides a light-dismissed layer before Core hears of it, so a layer's
exit cannot hold the live layer open. The exit plays on what the layer showed
when its close began, drawn in the top layer where the layer was, because a
layer that keeps painting outside the top layer paints in the wrong place.
The layer runtime's one shared exit copy draws it there
(`architecture:layer-runtime` INV14, `architecture:component-style-authoring`
INV7) in every browser with the Popover API, so layer exits play in every Tier
1 and Tier 2 browser; where it cannot be drawn, the layer closes at once, which
is also the default.

Rejected: holding the live layer in the top layer with an `overlay` transition, which plays only in browsers that support that transition.

### DEC-5 — Touch presentations keep their native exit

**Reference:** `spec:AST-090/DEC-5`
**Decider:** `cixzhang`, `2026-10-28`

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
