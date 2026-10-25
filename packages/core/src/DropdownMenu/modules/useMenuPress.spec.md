---
schema_version: 3
template_version: 3
kind: module
id: module:DropdownMenu/useMenuPress
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-02
owners: [cixzhang, vjeux]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/core/src/hooks/menuPressGesture.test.ts,
    packages/core/src/hooks/useMenuPress.test.tsx,
    packages/core/src/DropdownMenu/DropdownMenu.test.tsx,
    packages/core/src/DropdownMenu/DropdownMenuSubMenu.test.tsx,
    packages/core/src/ContextMenu/ContextMenu.test.tsx,
    packages/core/src/Selector/Selector.test.tsx,
    packages/core/src/DropdownMenu/__tests__/MenuPress.a11y.chromium.spec.ts,
    packages/core/src/DropdownMenu/__tests__/MenuPinchZoom.a11y.chromium.spec.ts,
  ]
parent_component: component:DropdownMenu
references:
  [
    architecture:interaction-modality,
    architecture:public-component-api,
    architecture:layer-runtime,
    family:overlay-dismissal,
  ]
---

# useMenuPress module contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | New public hook `useMenuPress` and the pure `menuPressStep` machine it drives, exported from `@astryxdesign/core/hooks`; the marker `data-astryx-menu-press` on every menu or listbox root that mounts it; PROPOSED in this change: the hook's trigger half (`onTriggerPress`, `triggerProps`, `isTriggerClickFromPress`, `longPressDelayMs`). No consumer prop of DropdownMenu, ContextMenu, DropdownMenuSubMenu or Selector changes.                                                                                                                                                                                                 |
| Behavior                | The row under the pointer when it is RELEASED is the row that acts; the highlight follows a held mouse, finger or pen; a mouse released outside closes the menu and a finger leaves it open; the browser's stray click for a tracked gesture never acts; the menu root declares `touch-action` by overflow. PROPOSED (FR8, FR9, DEC-4): a mouse opens a DropdownMenu on press-down and a finger held on its trigger opens it after the long-press delay, with a settle rule on the opening release.                                                                                                                                    |
| End-user impact         | A finger that lands on one menu row and lifts on another acts on the second, once, instead of on the first; a drag inside an open menu picks where it lets go; a mouse that lets go outside dismisses, a finger does not. PROPOSED: a mouse can press the trigger, drag into the menu and let go on a row in one gesture; a finger held on the trigger opens the menu without lifting. Keyboard behavior and sub-menu hover are unchanged.                                                                                                                                                                                             |
| Builder impact          | None for consumers of the five surfaces: they mount the model themselves. A component CAN adopt this model only when it meets the eligibility criteria below, and its component contract MUST explicitly name this module and the governed surfaces before mounting `useMenuPress`. The builder supplies an enabled-row selector and a `touch-action` declaration.                                                                                                                                                                                                                                                                     |
| Compatibility/readiness | Additive public hook; existing consumer props unchanged; shipped keyboard behavior unchanged. Shipped-behavior changes: DEC-3 (current; a mouse released outside a menu dismisses it) and PROPOSED DEC-4 (a mouse opens the menu on press rather than click; under a finger, `spec:AST-094` FR29). jsdom evidence is complete and real-Chromium evidence covers the touch pan, the finger slide and its stray click; iOS WebKit evidence is not required for this module. Authority: current for FR1–FR7, DEC-3, DEC-6, DEC-7 (`cixzhang`, 2026-10-02); FR8, FR9 and DEC-4 are proposed in this change and await the same owner (OQ1). |
| Review checks           | Reject a row that acts on `pointerdown` or from the browser's click after a tracked release; a second activation reaching a row for one gesture; a highlight that lights two rows; a finger release outside that closes the menu, or a mouse release outside that leaves it open; a menu root without a `touch-action` declaration; a picker whose listbox takes DOM focus for the highlight; an opening release that acts before the pointer entered the menu or the press settled; a trigger whose press and click both toggle in one gesture.                                                                                       |
| Governing rules         | `architecture:interaction-modality` INV2–INV4 (one operable path per modality, hover as enhancement, menus may move focus with the pointer); `architecture:public-component-api` for the new public hook; `architecture:layer-runtime` for the native light dismiss the model leaves in place; `family:overlay-dismissal` for Escape ordering, which this module does not change.                                                                                                                                                                                                                                                      |

This table is a review projection; the body below is authoritative.

## Intent

Astryx menus and pickers previously answered the basic pointer questions on their
own, and none of them watched the finger: a row acted when the browser reported a
`click`, which a touch browser aims at the row where the touch BEGAN. Sliding from
one row to another and lifting acted on the first row. This module owns one reusable
press model: the release decides, the highlight follows the pointer, and
(proposed here) a mouse opens on press. It is a
design-system behavior for components that explicitly adopt it, so no product
carries a separate press controller for an eligible surface.

The module contracts the press model only. Menu anatomy, theming,
presentation policy, keyboard navigation and item semantics stay with the
owning component records; trigger opening by keyboard stays with the component
that renders the trigger, and opening under a finger follows `spec:AST-094`
FR29.

### Adoption eligibility

A component CAN adopt this module only when all of these are true:

- Its open surface presents discrete action or option rows.
- Moving a held pointer across those rows means previewing the eventual choice.
- Releasing the pointer identifies one unambiguous enabled row.
- Dragging has no separate component meaning such as reordering, scrubbing, or
  direct manipulation.

Eligibility does not cause adoption. Each adopting component contract MUST
explicitly name `module:DropdownMenu/useMenuPress` and the surfaces and claims
it governs. Exporting `useMenuPress` does not make every eligible component an
adopter.

## Compatibility and migration

- Released default preserved: `no` for one behavior (DEC-3: a mouse released
  outside a menu now dismisses it); `yes` for every consumer prop and every
  item, divider, section and presentation API
- Compatibility class: additive public hook and types; behavior change inside
  the menu family
- Migration decision: `module:DropdownMenu/useMenuPress/DEC-3`; proposed
  `module:DropdownMenu/useMenuPress/DEC-4` (pending owner review)

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The gesture state machine (`menuPressStep`): tracking, release and cancel;
  proposed: trigger press, open, and the settle rule.
- Document-level pointer tracking by `pointerId` for the gesture in flight.
- Moving the highlight while a pointer is held: DOM focus in a menu, a
  caller-supplied callback in a picker.
- Activating the row under the release the way its own click would, with the
  release's button and modifier keys, and swallowing the browser's stray click
  for that gesture.
- Ending the gesture with nothing acting on `pointercancel`, a second
  pointer, or the window losing focus.
- Edge autoscroll of an overflowing menu while a press is tracked in it.
- Proposed: opening the parent menu on a mouse press and on a held finger,
  and telling the trigger that the click of that gesture is spent.
- The marker `data-astryx-menu-press` on the menu root.

**Does not own / non-goals**

- Aggregate menu anatomy, presentation resolution, item rendering, theming
  targets — owned by `component:DropdownMenu`, `component:ContextMenu`,
  `component:Selector`.
- Whether a row closes the menu when it acts — owned by the row
  (`hasCloseOnSelect`, checkbox and radio items).
- Scrolling. The browser decides when a finger is scrolling through the
  `touch-action` the menu root declares; the module never re-implements a
  scroll and never listens for `scroll`.
- Native light dismiss, Escape ordering and focus trapping — owned by
  `architecture:layer-runtime` and `family:overlay-dismissal`.
- Opening a menu from its trigger by keyboard — owned by the component that
  renders the trigger; under a finger, `spec:AST-094` FR29 governs it.
- Keyboard navigation, typeahead and Enter/Space activation — owned by
  `useListFocus`, `useTypeahead` and the component records.
- Hover-to-open of sub-menu flyouts — owned by `useMenuHover`.
- The right mouse button inside a menu: it is not modelled.

## Public API and concepts

| Concept                  | Closed values or states                                                      | Meaning                                                                                                                                                                                                                             | Default                       | Owner                              | Stability |
| ------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------- | --------- |
| gesture phase            | `idle`, `tracking`; proposed `triggerPress`, `open`                          | where the press in flight stands                                                                                                                                                                                                    | `idle`                        | `module:DropdownMenu/useMenuPress` | stable    |
| effect                   | `none`, `highlight`, `clear`, `act`, `settle`; proposed `open`               | what one event makes the host do; `open` asks the trigger to open the menu under the held pointer; `settle` carries `stray` (swallow the browser's click) and `dismiss` (close the menu)                                            | —                             | `module:DropdownMenu/useMenuPress` | stable    |
| pointer type             | `mouse`, `touch`, `pen`                                                      | the gesture's own pointer; `touch` and `pen` are "a finger"                                                                                                                                                                         | from the event                | `module:DropdownMenu/useMenuPress` | stable    |
| enabled-row selector     | caller string                                                                | the rows a release may act on; anything else inside the root highlights nothing                                                                                                                                                     | required                      | `module:DropdownMenu/useMenuPress` | stable    |
| highlight                | DOM focus, or a caller callback                                              | one lit row; focus with `preventScroll` in a menu, `aria-activedescendant` in a picker                                                                                                                                              | focus                         | `module:DropdownMenu/useMenuPress` | stable    |
| stray-click window       | 400 ms, or the next `pointerdown`                                            | how long after a tracked release the browser's click is still swallowed                                                                                                                                                             | `MENU_PRESS_STRAY_CLICK_MS`   | `module:DropdownMenu/useMenuPress` | stable    |
| settle time              | 300 ms                                                                       | proposed: how long an opening press must last before its release may act                                                                                                                                                            | `MENU_PRESS_SETTLE_MS`        | `module:DropdownMenu/useMenuPress` | proposed  |
| long-press delay         | as `spec:AST-094` FR29 states (none in a fixed bar; 150 ms in a scroll view) | proposed: how long a held finger waits on a trigger before the menu opens (`spec:AST-094` FR29). A caller that sets `longPressDelayMs` gets that wait in a fixed bar and in a scroll view alike, which keeps the released behavior. | `longPressDelayMs`            | `module:DropdownMenu/useMenuPress` | proposed  |
| `data-astryx-menu-press` | present or absent                                                            | the root carries this model; a host controller of its own stands aside                                                                                                                                                              | present on every mounted root | `module:DropdownMenu/useMenuPress` | stable    |
| activation click         | `click` with `detail: 0`, the release's button and modifiers                 | how the model acts on a row, marked for the synchronous extent by `isMenuPressActivation()`; `detail === 0` alone therefore no longer means "keyboard" on a menu row                                                                | —                             | `module:DropdownMenu/useMenuPress` | stable    |

## Behavioral contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Basis                                                                                                                                                                           | Verification state             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR1 | Under a mouse, a row MUST act when the press is released over it, never because the press began on it; a press that never left its row is a click on that row. Under a finger or pen, `spec:AST-094` FR26 governs.                                                                                                                                                                                                                                                        | macOS and iOS menu behavior; `menuPressGesture.test.ts`, `useMenuPress.test.tsx`                                                                                                | verify                         |
| FR2 | While a mouse button is held inside a menu, the highlighted row MUST be the enabled row under the pointer, and nothing MUST be highlighted over a divider, a heading, a disabled row, or outside the menu. A mouse moving with no button down moves the highlight the same way (existing hover-to-focus). Under a finger or pen, `spec:AST-094` FR27 and FR11's cell profile govern, and a second finger ends the gesture (FR4).                                          | `architecture:interaction-modality` allowed variation for menus; `useMenuPress.test.tsx`                                                                                        | verify                         |
| FR3 | A press that began inside a menu and is released outside it MUST act on nothing. Under a mouse the menu MUST then close; under a finger or pen it stays open as `spec:AST-094` FR28 states.                                                                                                                                                                                                                                                                               | DEC-3; `useMenuPress.test.tsx`, `DropdownMenu.test.tsx`, `Selector.test.tsx`                                                                                                    | verify                         |
| FR4 | A menu whose rows fit MUST declare `touch-action: pinch-zoom`; one that scrolls MUST declare `touch-action: pan-y pinch-zoom` and `overscroll-behavior: contain`. Neither admits a one-finger pan the menu does not scroll, and both leave a two-finger pinch to the browser, so the page stays zoomable over an open menu. The model MUST treat `pointercancel` and a second pointer as the end of the gesture with nothing acting, and MUST NOT re-implement scrolling. | Browser scroll ownership; WCAG 2.2 SC 1.4.4 under `spec:AST-020` FR1; `DropdownMenu.test.tsx` touch-action case, `useMenuPress.test.tsx`, `MenuPinchZoom.a11y.chromium.spec.ts` | verify                         |
| FR5 | The click the browser reports for a gesture this model tracked MUST NOT act on any row; only the release acts. A click with no tracked gesture behind it, or one whose `detail` is 0, MUST act on its target as before. The swallower arms at a tracked release and disarms at the next `pointerdown` or after the stray-click window.                                                                                                                                    | One gesture, one activation; `useMenuPress.test.tsx` FR5 suite                                                                                                                  | verify                         |
| FR6 | At most one row of a menu is lit. Under a finger or pen, `spec:AST-094` FR27 and FR11 govern the lit row and its press look.                                                                                                                                                                                                                                                                                                                                              | `DropdownMenuItem.tsx` styles                                                                                                                                                   | verify                         |
| FR7 | While a mouse press is tracked in a menu that scrolls, a pointer resting within the edge zone of the menu's top or bottom MUST scroll the menu toward that edge and re-read the row under the pointer as the rows move. Under a finger or pen, `spec:AST-094` FR30 governs.                                                                                                                                                                                               | `useMenuPress.test.tsx` autoscroll case                                                                                                                                         | verify                         |
| FR8 | On a mouse a DropdownMenu trigger MUST open its menu on press-down (button 0, no Control), and a drag from the trigger into the menu that releases over an enabled row MUST act on it. The opening gesture's release MUST act only if the pointer entered the menu or the press lasted the settle time; otherwise nothing acts and the menu stays open. Pressing the trigger of an open menu MUST close it and MUST NOT reopen it in the same gesture.                    | Proposed DEC-4; `DropdownMenu.test.tsx` press model suite, `menuPressGesture.test.ts` trigger states                                                                            | proposed; pending owner review |
| FR9 | Under a finger, opening a menu from its trigger (a tap, a hold-open, and the opening finger's handoff) is governed by `spec:AST-094` FR29.                                                                                                                                                                                                                                                                                                                                | Proposed DEC-4; `DropdownMenu.test.tsx` held-touch case, `useMenuPress.test.tsx`                                                                                                | proposed; pending owner review |

### Transformation and precedence order

- **ORD1 — One press, innermost owner.** A `pointerdown` inside a menu is
  claimed by the innermost root carrying `data-astryx-menu-press` (a flyout
  before its parent); the outermost root decides what counts as "inside the
  menu" for the release.
- **ORD1a (proposed) — A menu beside the root.** A root carrying
  `data-astryx-menu-press-surface`, which names another root's `id`, is nested
  in that root for ORD1, as a flyout inside the root's DOM is: a release on
  its rows is inside the menu. Only the menu of a sub-menu with a header or
  footer, which the root renders beside itself (`component:DropdownMenu`
  FR20), carries it. Anything else beside the root, a header field or a picker
  placed in a region say, is outside the menu, as the root's own regions are,
  and a picker there stays its own root. Pending owner review.
- **ORD2 — Release resolution.** Enabled row under the point → `act`; inside
  the menu or on the trigger with no row → `settle` (stray click swallowed,
  menu stays); outside → `settle` with `dismiss` only for a mouse.
- **ORD3 — Trigger click (proposed).** The press model's open or close on
  the trigger runs first; the trigger's own click for that same gesture (by
  gesture counter) is a no-op; any other click keeps its toggle.
- **ORD4 — Activation dispatch.** The model's activation is a `click` with
  `detail: 0` carrying the release's button and modifiers, dispatched inside
  a synchronous activation mark; a row that re-dispatches to a control inside
  it passes; the browser's later click for the gesture is stopped at the
  window in the capture phase.

### Performance and resources

- **PR1 — Listeners per gesture.** Document listeners for `pointermove`,
  `pointerup`, `pointercancel`, `pointerdown` and window `blur` are attached
  at press and removed when the gesture ends; none are live while idle.
- **PR2 — One swallower.** The window capture `click` listener is installed
  once per document and armed per gesture.
- **PR3 — Autoscroll.** One interval while a tracked pointer rests in an
  edge zone of an overflowing menu; it stops when the pointer leaves the zone,
  the scroller reaches its edge, or the gesture ends.

## Accessibility contract

- **AR1 — Highlight is focus in a menu.** In a menu the highlighted row is the
  focused row, moved with `preventScroll`, so keyboard, mouse and finger share
  one highlight and one paint; a row whose root takes no focus is highlighted
  through the control inside it.
- **AR2 — A picker keeps its combobox focus.** In a Selector listbox the model
  drives `highlightedIndex` and `aria-activedescendant`; DOM focus never moves
  into the listbox.
- **AR3 — Assistive activation passes.** A click with `detail === 0` — a
  keyboard's, a screen reader's, or the model's own dispatch — is never
  swallowed, so assistive technology activates rows as before. A row that
  must tell the model's pointer activation from a keyboard's reads
  `isMenuPressActivation()`, not `detail`.
- **AR4 — Focus after a pick is the component's.** The model activates the
  row as its own click would; where focus goes once the menu closes stays
  with the owning component record and is unchanged by this module.

## Design relationships

No visual representation is introduced. FR6 removes the coarse-pointer
pressed paint from menu rows so the single focus highlight is the only lit
row under a finger; the highlight paint itself is the existing focus overlay
owned by the item components.

## Parent and system relationships

- `component:DropdownMenu` owns the aggregate menu anatomy, presentation
  resolution, targets and item pipeline; `component:ContextMenu`,
  `component:Selector` and the sub-menu flyout mount this module and record
  their own press claims by reference to it.
- `architecture:interaction-modality` owns modality tracking and focus-return
  visibility; this module reads them and adds no modality definition.
- `architecture:layer-runtime` owns native light dismiss, which this module
  leaves in place: a press outside a `popover="auto"` menu still dismisses it
  through the browser. Proposed FR8 holds the trigger as the popover's
  invoker for the extent of a press-open so the release over the trigger is
  not read as a dismissal, the same mechanism the layer runtime's keep-open
  props use.
- `family:overlay-dismissal` owns Escape ordering; unchanged here.

## Verification map

| Contract               | Verification                                                                                                               | Representative states                                                                                                                                                   | Mutation or failure expectation                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR3, FR5           | `menuPressGesture.test.ts` (one case per transition of the diagram)                                                        | idle, tracking; mouse and touch; releases over a row, over chrome, on the trigger, outside; cancel                                                                      | Acting on the press row, on the stray click, or dismissing under a finger fails a transition case                               |
| FR1–FR5, FR7, AR1, AR3 | `useMenuPress.test.tsx` with an injected hit test                                                                          | release over another row, tap, stray click, `detail: 0`, mouse/finger outside, pointercancel, second pointer, autoscroll                                                | A second activation, a swallowed assistive click, a wrong dismissal, or a dead autoscroll fails                                 |
| FR1, FR3–FR5           | `DropdownMenu.test.tsx`, `DropdownMenuSubMenu.test.tsx`, `ContextMenu.test.tsx` press suites                               | finger slide across rows, outside release by mouse and finger, `touch-action`, flyout release, root marker                                                              | Each removed behavior fails its named case                                                                                      |
| FR1, FR3, AR2          | `Selector.test.tsx` press model suite                                                                                      | finger release over another option, finger/mouse release outside, listbox marker                                                                                        | A listbox that takes focus, acts on the press option, or closes under a finger fails                                            |
| FR4 (scroll)           | `MenuPress.a11y.chromium.spec.ts` (real Chromium)                                                                          | Chromium touch pan in an overflowing menu; touch-action by overflow; finger slide and its stray click                                                                   | Not provable in jsdom; a pan that acts on a row, or a slide that acts on the press row, fails                                   |
| FR4 (pinch)            | `MenuPinchZoom.a11y.chromium.spec.ts` (real Chromium, phone emulation)                                                     | two-finger pinch over a menu whose rows fit, over one that scrolls, and over a picker listbox                                                                           | Not provable in jsdom; a pinch that leaves the page at scale 1, or acts on a row, fails                                         |
| FR8, FR9 (proposed)    | `menuPressGesture.test.ts` trigger states; `useMenuPress.test.tsx` trigger suite; `DropdownMenu.test.tsx` press-open cases | mouse opens at once, settle before/after, cancel; finger opening per `spec:AST-094` FR29; press-open + drag-release, unsettled release, trigger toggle, held touch, tap | A menu that does not open on a mouse press, an unsettled release that acts, or a trigger that reopens in the same gesture fails |
| ORD1a (proposed)       | `DropdownMenuSubMenu.test.tsx` press cases; `SubMenuHeaderFooter.a11y.chromium.spec.ts` press-drag case                    | a mouse press on a menu row released on a row of a sub-menu rendered beside the menu; the same press released on that sub-menu's header field                           | A release on such a row that acts on nothing or closes the menu, or a release on its header field that acts, fails.             |

## Decision log

### DEC-3 — A release outside closes under a mouse and stays under a finger

**Reference:** `module:DropdownMenu/useMenuPress/DEC-3`
**Decider:** `vjeux`, `2026-09-27`

macOS ends a menu's tracking on mouse-up: a release outside dismisses. iOS
leaves a menu presented when the finger that slid off it lifts; a later tap
outside dismisses. Each pointer keeps its platform's answer. Closing for both
would make a finger that slid off need a second gesture to reopen; staying
open for both would surprise a mouse user.

### DEC-4 (proposed) — A mouse opens on press-down, with a settle rule

**Reference:** `module:DropdownMenu/useMenuPress/DEC-4`
**Decider:** proposed by `vjeux`, `2026-09-27`; pending owner review

Press-to-open with drag-release is the macOS menu. Opening under a finger
follows `spec:AST-094` FR29 and DEC-4. The release of the opening
gesture acts only after the pointer has entered the menu or the press has
settled (300 ms), as a native pop-up button's does; otherwise a menu that
opens under the pointer would pick a row nobody chose.

### DEC-6 — The highlight is DOM focus in a menu, `aria-activedescendant` in a picker

**Reference:** `module:DropdownMenu/useMenuPress/DEC-6`
**Decider:** `vjeux`, `2026-09-27`

Menus already keep one highlight by moving focus on hover; the finger moves
the same focus with `preventScroll`, so keyboard, mouse and touch share one
state and one paint. A picker's list belongs to a combobox and must not take
focus from it. The coarse-pointer pressed paint on menu rows is dropped
because it would light a second row (FR6). This record does not decide where
focus goes after a pick.

### DEC-7 — Eligibility permits adoption; component contracts opt in

**Reference:** `module:DropdownMenu/useMenuPress/DEC-7`
**Decider:** `cixzhang`, `2026-10-02`

A component may adopt this model when its open surface presents discrete action
or option rows, a held pointer moving across rows previews the eventual choice,
and release identifies one unambiguous enabled row. A component whose drag has
a separate meaning, such as reordering, scrubbing, or direct manipulation, is
not eligible. Eligibility never causes adoption: each component contract names
this module and the surfaces and claims it governs. The public hook's
availability alone does not make a component an adopter.

## Open questions

- **OQ1 — Is press-to-open the menu family's trigger model?** (`human-design`)
  The one owner decision this change needs: proposed FR8, FR9 and DEC-4 — a
  mouse opens a DropdownMenu on press-down with the settle rule, a finger on
  a tap or a held press. Until the owner rules, the current record's FR1–FR7
  stand on their own.

The former browser-evidence question is resolved: the touch pan, the finger
slide and its stray click cannot be exercised in jsdom, and real-Chromium
evidence for them now exists in
`packages/core/src/DropdownMenu/__tests__/MenuPress.a11y.chromium.spec.ts`.
`cixzhang` ruled on 2026-10-02 that iOS WebKit evidence is not required for
this module, now or later; real Chromium is the evidence bar.

## Content boundary

This record does not duplicate `useMenuPress.doc.mjs` signatures, the owning
components' anatomy or theming, layer or dismissal rules, or implementation
steps. It links to their canonical owners.
