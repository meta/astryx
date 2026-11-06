---
schema_version: 3
template_version: 3
kind: module
id: module:DropdownMenu/useMenuHover
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [behavior, interaction, accessibility]
verified_by:
  [
    packages/core/src/hooks/useMenuHover.test.tsx,
    packages/core/src/DropdownMenu/DropdownMenuSubMenu.test.tsx,
    packages/core/src/SideNav/SideNav.test.tsx,
    packages/core/src/TopNav/TopNavMenu.test.tsx,
    packages/core/src/TopNav/TopNavMegaMenu.test.tsx,
  ]
parent_component: component:DropdownMenu
references:
  [
    architecture:layer-runtime,
    architecture:interaction-modality,
    module:DropdownMenu/useMenuPress,
  ]
---

# useMenuHover module contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None. `useMenuHover` is an internal shared hook; no consumer prop, export, or DOM contract of DropdownMenu, SideNav or TopNav changes. This record contracts behavior that already ships.                                                                                                                  |
| Behavior                | A hover-capable pointer entering a trigger opens after `showDelay` and leaving closes a hover-opened surface after `hideDelay`; a pointer press on the trigger TOGGLES, except within `clickGuardMs` of a hover-open, where it confirms the surface instead. A surface opened by press has no such window. |
| End-user impact         | A person whose cursor travels toward a row and clicks as the flyout appears under it keeps the flyout; the same person pressing the visibly open row a moment later closes it. A keyboard or touch user is unaffected: neither path has a hover phase and neither has a toggle.                            |
| Builder impact          | None. `clickGuardMs: 0` opts a surface out so every press toggles (`SideNavItem` does); `showDelay: 0` opens on contact; `ownsFocus: false` leaves focus to the surface's own trap.                                                                                                                        |
| Compatibility/readiness | No behavior, API or default changes. Authority: `draft` — `cixzhang` settled the press-toggle rule and its guard exception on 2026-10-02 (DEC-1) and approves this record on its pull request. jsdom covers delays, the guard, focus and the invoker attribute; native light dismiss is browser-only.      |
| Review checks           | Reject a press that cannot close a surface the person can see is open; a guard armed by a press-open; a guard re-armed by re-entering an open trigger; hover as the only way to reach a surface; a hover-open that moves focus; a keyboard path that closes on its second activation.                      |
| Governing rules         | `architecture:interaction-modality` INV2–INV4 (modality and focus ownership stay separate; one focus move has one indicator; every modality has an operable path and hover is never the only one); `architecture:layer-runtime` for the native invoker relationship and the synthetic-`mouseenter` note.   |

This table is a review projection; the body below is authoritative.

## Intent

Flyout menus on a desktop pointer are expected to follow the cursor: the surface
opens on hover intent rather than demanding a press, and closes when the pointer
goes elsewhere. `useMenuHover` is the one place that behavior is decided, so
sub-menus and nav flyouts do not each invent their own delays, their own guard,
and their own answer to "does a press close this?".

The behavior is shipped and has been for some time; what it has lacked is a
record. An open proposal to delete part of it was reasonable precisely because
nothing said the part mattered. This record contracts the hover-intent model —
open, close, the press toggle, and the click guard — for every surface that
mounts the hook.

It contracts the hover model only. The press model inside an open menu, menu
anatomy, item semantics, directional keyboard navigation and layer dismissal
stay with their own owners.

## Compatibility and migration

- Released default preserved: `yes` — this record describes current `main` and
  changes no runtime behavior, default, or signature
- Compatibility class: documentation of shipped behavior; no API, default, or
  observable delta
- Migration decision: none required

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Hover intent on a trigger: the delay before a hover opens a surface, and the
  delay before leaving the trigger or the surface closes one that hover opened.
- Whether a pointer press on the trigger opens, confirms, or closes — including
  the click guard and the window it runs for.
- Suppressing the synthetic `mouseenter` a closing panel fires when it stops
  covering a stationary pointer.
- Standing down entirely on a pointer that cannot hover.
- Where focus goes on an open the hook performs, and returning it to the trigger
  on the hook's own close.
- The native invoker relationship (`popovertarget`) for a trigger that sits
  outside an auto popover, and cancelling that invoker's default toggle so one
  handler decides.

**Does not own / non-goals**

- Aggregate menu anatomy, presentation resolution, item rendering and theming —
  owned by `component:DropdownMenu` and the owning nav components.
- What a press does to a row INSIDE an open menu — owned by
  `module:DropdownMenu/useMenuPress`.
- Directional open and close keys (ArrowRight / ArrowLeft, and their RTL
  mirrors) — owned by the component that renders the trigger. The hook sees
  Enter and Space only, and only because the browser delivers them as a click.
- Typeahead and roving navigation within a surface — owned by `useListFocus`
  and `useTypeahead`.
- Native light dismiss, Escape ordering across layers, and focus trapping —
  owned by `architecture:layer-runtime` and `family:overlay-dismissal`.
- Positioning, anchoring and collision behavior — owned by `useLayer`.
- Whether a surface exists at all for a given trigger: a consumer that passes
  `isEnabled: false` gets inert handlers and no hover behavior.

## Public API and concepts

| Concept            | Closed values or states               | Meaning                                                                                                                               | Default                    | Owner                               | Stability |
| ------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------- | --------- |
| open provenance    | `hover-opened`, `pinned`              | how the current open began; only a `hover-opened` surface closes on pointer leave, and only it arms the click guard                   | from the event that opened | `module:DropdownMenu/useMenuHover`  | stable    |
| `showDelay`        | milliseconds, `0` opens on contact    | hover intent before opening                                                                                                           | `150`                      | `module:DropdownMenu/useMenuHover`  | stable    |
| `hideDelay`        | milliseconds                          | grace after leaving the trigger or the surface before a hover-opened surface closes                                                   | `200`                      | `module:DropdownMenu/useMenuHover`  | stable    |
| `clickGuardMs`     | milliseconds, `0` opts out            | window after a hover-open in which a press confirms the surface instead of closing it                                                 | `500`                      | `module:DropdownMenu/useMenuHover`  | stable    |
| reopen suppression | fixed window after any close          | a `mouseenter` arriving because the panel stopped covering a stationary pointer is ignored; a real pointer leave clears it early      | `300` ms, not configurable | `module:DropdownMenu/useMenuHover`  | stable    |
| hover capability   | `(hover: hover)` matches, or does not | whether hover intent is read at all; a coarse pointer schedules nothing                                                               | from the media query       | `architecture:interaction-modality` | stable    |
| `ownsFocus`        | `true`, `false`                       | whether the hook moves focus on a press or keyboard open, or leaves it to the surface's own trap                                      | `true`                     | `module:DropdownMenu/useMenuHover`  | stable    |
| `popoverId`        | a popup's DOM id, or absent           | present makes the trigger the panel's native invoker, exempting it from light dismiss; the hook then cancels the invoker's own toggle | absent                     | `architecture:layer-runtime`        | stable    |
| integration shape  | full, or pointer-only                 | a consumer takes the whole model, or takes hover intent plus `confirmHoverOpen` and keeps its own press and keyboard handling         | full                       | `module:DropdownMenu/useMenuHover`  | stable    |

## Behavioral contract

| ID   | Candidate invariant                                                                                                                                                                                                                                                                       | Basis                                                                                 | Draft review state |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------ |
| FR1  | A hover-capable pointer entering an enabled trigger MUST open the surface after `showDelay`, and MUST NOT move focus: the pointer is driving. `showDelay: 0` opens on contact.                                                                                                            | Current behavior; `useMenuHover.test.tsx`, `SideNav.test.tsx`                         | settled            |
| FR2  | Leaving the trigger or the surface MUST close a `hover-opened` surface after `hideDelay`; entering the surface MUST cancel a pending close. A `pinned` surface MUST NOT close on a pointer leave.                                                                                         | Current behavior; `useMenuHover.test.tsx`, `SideNav.test.tsx`                         | settled            |
| FR3  | A pointer press on the trigger MUST toggle the surface: it opens a closed one and closes an open one. This is the default answer, and FR4 is its only exception.                                                                                                                          | DEC-1; `useMenuHover.test.tsx`, `DropdownMenuSubMenu.test.tsx`                        | settled            |
| FR4  | A press landing within `clickGuardMs` of a HOVER-open MUST confirm that surface instead of closing it, pinning it (FR2) and moving focus in where the hook owns focus. After the window, a press MUST close it. `clickGuardMs: 0` opts out, making every press toggle.                    | DEC-1; `useMenuHover.test.tsx`, `DropdownMenuSubMenu.test.tsx`                        | settled            |
| FR5  | The guard MUST key off the hover-open, never off the open. A surface opened by a press therefore has no window at all and the next press closes it immediately. This is the rule's intended consequence, not an edge case.                                                                | DEC-1; `useMenuHover.test.tsx` click-only and re-entry cases                          | settled            |
| FR6  | Re-entering the trigger of an already-open surface MUST NOT re-arm the guard and MUST NOT make the surface `hover-opened` again; otherwise the next deliberate press would confirm forever and the surface could never be dismissed by pointer.                                           | Current behavior; `useMenuHover.test.tsx` re-entry case                               | settled            |
| FR7  | For a fixed window after ANY close, a `mouseenter` on the trigger MUST NOT reopen the surface, because a panel positioned over its own trigger puts that trigger back under a stationary pointer. A real pointer leave MUST clear the window early, so a deliberate re-hover still opens. | Current behavior; `useMenuHover.test.tsx` suppression and re-hover cases              | settled            |
| FR8  | Where `(hover: hover)` does not match, `mouseenter` and `mouseleave` MUST schedule nothing — a tap's compatibility `mouseenter` must not leave a surface hanging open behind it — and the press path MUST behave exactly as it does with a hover-capable pointer.                         | `architecture:interaction-modality` INV4; `useMenuHover.test.tsx`, `SideNav.test.tsx` | settled            |
| FR9  | Keyboard activation of the trigger MUST always open the surface and move focus into it, and MUST NEVER close it. The keyboard has no toggle; the toggle of FR3 is a pointer affordance and nothing mirrors it on keys.                                                                    | Current behavior; `useMenuHover.test.tsx` keyboard suite                              | settled            |
| FR10 | Escape MUST close the surface and return focus to the trigger when focus was inside it. Directional open and close keys are the consuming component's, not this hook's.                                                                                                                   | `family:overlay-dismissal`; `useMenuHover.test.tsx`, `DropdownMenuSubMenu.test.tsx`   | settled            |
| FR11 | When a `popoverId` is supplied, the trigger MUST carry `popovertarget` for that panel, and the hook MUST cancel the resulting invoker toggle so its own handler is the single decision point for FR3 and FR4.                                                                             | `architecture:layer-runtime`; `useMenuHover.test.tsx` invoker case                    | verify             |
| FR12 | A disabled integration MUST add no hover behavior to its trigger, and MUST NOT open a surface: a trigger disabled while a hover is in progress stays closed, whether it was disabled before the pointer arrived or during the delay that would have opened it.                            | Current behavior; `SideNav.test.tsx` collapsed/expanded cases                         | verify             |

### Transformation and precedence order

- **ORD1 — Press resolution.** Keyboard activation (FR9) → surface closed, so
  open → within the guard window, so confirm (FR4) → otherwise close (FR3).
  The first matching branch decides; none of the later ones runs.
- **ORD2 — Hover-enter resolution.** No hover-capable pointer, so do nothing
  (FR8) → inside the reopen-suppression window, so do nothing (FR7) → already
  open, so abandon any pending close and change nothing else (FR6) →
  otherwise the surface becomes `hover-opened` after `showDelay` (FR1).
- **ORD3 — Provenance clearing.** Any close, whatever caused it, clears
  `hover-opened` and stamps the suppression window before the browser can
  hit-test the vanished panel; a confirm clears `hover-opened` without closing.

### Performance and resources

- **PR1 — No pending intent outlives what supersedes it.** At most one open
  and one close are ever pending; a newer intent replaces the pending one
  rather than queueing behind it, and nothing pending survives the surface
  unmounting. A trigger left behind by a removed surface cannot open it.
- **PR2 — Nothing is observed outside the trigger and its surface.** Hover
  intent is read from the trigger and the surface alone, so a page with many
  triggers carries no document- or window-level cost per trigger.

## Accessibility contract

- **AR1 — A hover-open never moves focus.** The pointer is driving, so focus
  stays where the person left it; the surface is reachable with the same pointer
  that opened it. This keeps modality and focus ownership separate
  (`architecture:interaction-modality` INV2).
- **AR2 — A press or keyboard open moves focus in, synchronously.** Where the
  hook owns focus it focuses the first enabled item in the same tick, falling
  back to the surface container when the surface is empty or still loading, so
  keyboard ownership always leaves the trigger's list. A consumer whose surface
  is a focus-trapped dialog rather than a menu passes `ownsFocus: false` and the
  trap owns focus instead.
- **AR3 — Closing returns focus to the trigger.** When focus was inside the
  surface, the hook's own close returns it to the trigger, so Escape never
  strands a keyboard user on a vanished element.
- **AR4 — Hover is an enhancement, never a requirement.** Every surface this
  hook opens MUST remain reachable and dismissible by press and by keyboard,
  with no hover phase involved (`architecture:interaction-modality` INV4). A
  coarse pointer gets the press path unchanged (FR8).
- **AR5 — One highlight per focus move.** The hook moves focus to exactly one
  item and paints nothing itself; a surface that also highlights on hover keeps
  that highlight and focus in one place (`architecture:interaction-modality`
  INV3).

## Design relationships

| Anatomy or state | Design requirement                                                                                    | Representation authority | Module contract |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ------------------------ | --------------- |
| open surface     | No visual representation is introduced; the surface's own appearance is the owning component's        | prescribed               | FR1, FR3        |
| focused item     | The existing focus highlight owned by the item components; this module only decides which item has it | prescribed               | AR2, AR5        |

## Parent and system relationships

- `component:DropdownMenu` owns aggregate menu anatomy, presentation resolution
  and the item pipeline. This module is parented there because the repository's
  knowledge-path rules require a module record to live under a component root
  with an active component record and to be listed by it; of the three roots
  that consume the hook (`DropdownMenu`, `SideNav`, `TopNav`) only `DropdownMenu`
  has one, and the sibling press model is already parented there on the same
  basis. The contract governs every consumer, not sub-menus alone.
- `module:DropdownMenu/useMenuPress` is the sibling press model and the boundary
  is exact: it decides what a press does to a row INSIDE an open menu; this
  record decides what a press on a TRIGGER does to the surface itself. Neither
  governs the other's surface.
- `architecture:layer-runtime` owns the layer lifecycle, native light dismiss,
  and already records that this hook adds a real native invoker relationship for
  applicable auto popovers and suppresses the synthetic `mouseenter` a closing
  panel produces. It also records that a control beside an open layer may
  temporarily gain `popovertarget` during a press and have its invoker toggle
  cancelled; FR11 is this hook's standing case of that relationship, not a
  second rule.
- `architecture:interaction-modality` owns modality state and the invariants
  AR1, AR4 and AR5 project; this record adds no modality definition.
- `family:overlay-dismissal` owns Escape ordering across layers; unchanged here.
- `SideNav` and `TopNav` have no component record yet. When either gains one, it
  names this module rather than restating the hover model.

## Verification map

| Contract                    | Verification                                                                            | Representative states                                                                                                          | Mutation or failure expectation                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| FR1–FR2, FR5–FR7, FR9, FR10 | `useMenuHover.test.tsx`, driven through a real consumer rather than a synthetic harness | hover-open, leave-close, immediate press, press well after the window, press-only toggle, trigger re-entry, panel-vanish enter | Removing the guard fails the immediate-press case; widening it to press-opens fails the re-entry and click-only cases |
| FR3–FR5                     | `DropdownMenuSubMenu.test.tsx` hover/click-guard suite                                  | flyout hover-opened then pressed at once; flyout hover-opened then pressed after the window                                    | A press that can never close a visibly open flyout fails the second case                                              |
| FR1, FR2, FR8, FR12         | `SideNav.test.tsx` collapsed sub-menu hover-intent suite                                | fine and coarse pointer, delay boundaries, unmount during a pending open, `clickGuardMs: 0` consumer                           | A coarse pointer that schedules a timer, or a disabled item that still hovers open, fails                             |
| FR9, AR1–AR3                | `useMenuHover.test.tsx` focus and keyboard suites                                       | hover-open leaves focus; press-open focuses the first item in the same tick; Enter on an open surface; Escape                  | A deferred (post-paint) focus fails; a keyboard activation that closes fails                                          |
| FR11                        | `useMenuHover.test.tsx` invoker case asserts the wiring; the behavior is browser-only   | trigger outside an auto popover                                                                                                | jsdom implements neither light dismiss nor invokers, so the attribute is asserted and the dismissal is not provable   |
| AR4                         | Press and keyboard paths in every suite above                                           | every consumer, hover unavailable                                                                                              | A surface reachable only by hover fails `architecture:interaction-modality` INV4                                      |

## Decision log

### DEC-1 — A press toggles, except the one that follows a hover-open

**Reference:** `module:DropdownMenu/useMenuHover/DEC-1`
**Decider:** `cixzhang`, `2026-10-02`

A press on a sub-menu row toggles the flyout, with one exception: a click
landing immediately after a hover-open does not close it.

The hover and the click are one continuous motion, not two decisions. The person
moves the cursor toward the row, the flyout opens under the cursor mid-travel,
and the click they had already committed to lands on something that just
appeared. The guard window recognises that the click was aimed at the closed
row, so it confirms the surface rather than undoing it.

After the window, the situation is different: the person is pressing something
they can see is open, and that is a second deliberate press. It should close it —
"after waiting for a bit clicking the menu toggle again should close it", and
"we should preserve that behavior".

This is why the guard keys off the hover-open and not off the open (FR5): a
surface the person opened by pressing was never the ambiguous case, so the next
press closes it with no window at all. A consumer whose surface does not appear
under the travelling cursor — one that opens beside the rail rather than over
the trigger — has no ambiguity to resolve and sets `clickGuardMs: 0`.

## Open questions

- **OQ1 — One consumer resolves the press rules itself.** (`checkable`) Five
  of the six consumers take the whole model. `DropdownMenuSubMenu` takes hover
  intent alone and resolves FR3 and FR4 in its own press handling, so the rule
  exists in two places and the two can diverge. The owner's direction is to
  converge: every consumer should get FR3 and FR4 from one place. What a press
  does to a menu row that is also a menu item is the open part, because that
  row answers to `module:DropdownMenu/useMenuPress` as well; the behavior both
  shapes must produce is settled either way.

- **OQ2 — Keyboard activation is not reliably distinguishable.** (`checkable`)
  FR9 requires a keyboard activation to open and never close, which depends on
  telling it apart from a pointer activation on the same trigger. A trigger
  that also hosts a model dispatching its own activations cannot be told apart
  by the signal the browser gives a keypress, so FR9's guarantee does not hold
  there. No shipped surface is affected, because the one row hosting both keeps
  its own press handling (OQ1) — but converging OQ1 makes this reachable, and
  the two should be settled together. What a dispatched activation should look
  like belongs to `module:DropdownMenu/useMenuPress`, not here.

## Content boundary

This record does not duplicate the hook's signature or option defaults as
authored in source, the owning components' anatomy, theming or item semantics,
the press model inside an open menu, layer positioning and dismissal rules, or
implementation steps. It links to their canonical owners.
