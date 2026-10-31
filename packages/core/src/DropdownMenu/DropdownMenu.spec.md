---
schema_version: 3
template_version: 7
kind: component
id: component:DropdownMenu
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [accessibility, behavior, layout, public-api, theming]
verified_by:
  [
    packages/core/src/DropdownMenu/DropdownMenu.test.tsx,
    packages/core/src/DropdownMenu/DropdownMenuSubMenu.test.tsx,
    packages/core/src/DropdownMenu/__tests__/DropdownMenuDrillIn.a11y.chromium.spec.ts,
    packages/core/src/DropdownMenu/__tests__/MenuPress.a11y.chromium.spec.ts,
    packages/core/src/DropdownMenu/__tests__/MenuHeaderFooter.a11y.chromium.spec.ts,
    packages/core/src/DropdownMenu/__tests__/SubMenuHeaderFooter.a11y.chromium.spec.ts,
    packages/core/src/ContextMenu/ContextMenu.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: [module:DropdownMenu/useMenuPress, module:DropdownMenu/useMenuHover]
families: [family:overlay-dismissal, family:navigation-destinations]
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:layer-runtime,
  ]
contributing: []
system_specs: [spec:AST-020/FR15, spec:AST-094, spec:AST-102]
---

# DropdownMenu component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. DropdownMenu takes a `button` (Button props) or `renderTrigger`, data-driven `items` or compound children, `presentation`, `isMenuOpen` and `onOpenChange`, placement and alignment, `menuMaxHeight`, `header`, and `footer`.                                                                                                     |
| Behavior                | A Menu Button trigger opens an anchored pointer menu or a bottom-sheet action list. Rows act on the release under the shared press model; sub-menus fly out beside their row or drill in on a compact touch display; a header or footer makes the pointer popover a modal dialog around the menu.                                               |
| End-user impact         | People pick actions by mouse, finger, or keyboard; keyboard users get a focus return with a ring and pointer users without one; on a phone sub-menus replace the rows instead of flying off-screen. Under a finger the menu opens after a 500 ms hold or at a tap's click, does not grow from its trigger, and a pan outside does not close it. |
| Builder impact          | Builders choose the trigger, the rows, and the regions; rows stay menu items and every non-item control goes in `header` or `footer`.                                                                                                                                                                                                           |
| Compatibility/readiness | Records shipped behavior; no API or DOM change; the released default under a finger moves as `spec:AST-094` FR25 lists, with `presentation="popover"` keeping it. Finger press-open (FR8), touch grow and pan dismissal (FR21), and the delegated Trigger Button gaps are listed under Current-state impact.                                    |
| Review checks           | Reject a control placed among the rows, a lost trigger ARIA wiring, a drilled-in view that leaves the menu box, a header or footer without the dialog, a lost focus-return modality, or a target moved off its painted element.                                                                                                                 |
| Governing rules         | `spec:AST-020` FR15; `spec:AST-094` FR26–FR35; `module:DropdownMenu/useMenuPress`; `architecture:interaction-modality` INV1; `architecture:component-theming-surface`; `architecture:layer-runtime`; `family:overlay-dismissal`; `family:navigation-destinations`.                                                                              |

This table is a review projection; the body below is authoritative.

## Intent

DropdownMenu presents actions from a visible trigger in either an anchored
pointer menu or a BottomSheet-hosted touch action list. Its press model — the
row under the release acts and the highlight follows the pointer — is
contracted by `module:DropdownMenu/useMenuPress`, which both presentations
mount.

## Compatibility and migration

- Released default preserved: `no` under a finger: the omitted `presentation`
  follows `spec:AST-094` FR29, FR31, and FR32 (FR8, FR21);
  `presentation="popover"` keeps the released behavior (`spec:AST-094` FR25)
- Compatibility class: records shipped behavior; no public prop, export, or
  DOM change
- Controlled/uncontrolled behavior: `isMenuOpen` with `onOpenChange`, or
  uncontrolled
- Migration decision: `spec:AST-094` FR25 and DEC-4

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The Pointer menu surface and Touch menu surface and their shared
  `dropdown-menu` target.
- Pointer action rows, pointer-only section headings and dividers, radio marker
  specialization, and submenu indicator presentation through the other five
  DropdownMenu targets.
- Selecting between the pointer and touch render paths after presentation
  policy resolves.
- Mounting the shared press model on both menu surfaces and on the Trigger
  button; the model itself is owned by `module:DropdownMenu/useMenuPress`.
- The `header` and `footer` regions, the dialog around them, and the drilled-in
  view.

**Does not own / non-goals**

- Trigger-button presentation — delegated to `component:Button`.
- The Touch sheet frame — delegated to `component:BottomSheet`.
- Touch action-list and row presentation — delegated to `component:List`.
- Shared checkbox-indicator and ordinary icon presentation — delegated to
  `component:Indicator` and `component:Icon`.
- Each row's own contract — owned by `component:DropdownMenuItem`,
  `component:DropdownMenuCheckboxItem`, `component:DropdownMenuRadioGroup`,
  `component:DropdownMenuRadioItem`, `component:DropdownMenuSubMenu`,
  `component:DropdownMenuGroup`, and `component:DropdownMenuDivider`.
- The flyout hover timing — owned by the menu hover module (`useMenuHover`).
- Shared layer lifecycle or dismissal policy.

## Public concepts

Consumer props, item shapes, subcomponents, and presentation policy remain
documented in `DropdownMenu.doc.mjs` and the subcomponent docs. These are the
component-local concepts; each keeps its released default.

| Concept               | Closed values or states                                            | Meaning                                                                                                                                                                                          | Availability by variant/orientation/state                       | Default              | Owner                    | Stability | Invalid-value behavior                                           |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------- | ------------------------ | --------- | ---------------------------------------------------------------- |
| Menu height cap       | `menuMaxHeight`: a number of pixels                                | Lifts the 300px cap for a menu that must fit its rows; the viewport still bounds it.                                                                                                             | Pointer presentation                                            | `300px`              | `component:DropdownMenu` | stable    | Ignored by the touch sheet.                                      |
| Trigger source        | `button` (Button props) or `renderTrigger` (render prop)           | Which control the menu hangs off. `renderTrigger` receives `DropdownMenuTriggerProps` — the press model, keyboard opens, toggle click and ARIA wiring — and names the menu.                      | Both presentations                                              | `button`             | `component:DropdownMenu` | stable    | Both given: `renderTrigger` wins and a dev warning fires.        |
| Header and footer     | `header`, `footer`: any React node                                 | Content above and below the rows, beside the menu inside the same popover or sheet — never inside the `role="menu"` element. With either, the pointer popover is a modal dialog around the menu. | Both presentations                                              | none                 | `component:DropdownMenu` | stable    | A false or empty value renders no region.                        |
| Sub-menu regions      | `header`, `footer` on a sub-menu: any React node                   | Content above and below a sub-menu's rows, beside its menu inside its own surface; with either, that surface is a modal dialog named by the row (FR20).                                          | Popover presentation                                            | none                 | `component:DropdownMenu` | stable    | A false or empty value renders no region.                        |
| Row destination       | `href` (+ `target`, `rel`) on an action item                       | The row's act is navigation: the row itself is the link (`family:navigation-destinations`).                                                                                                      | Pointer action row and Touch action row, compound and data mode | none (an action row) | `component:DropdownMenu` | stable    | Blocked schemes follow the family rule; a disabled row has none. |
| Sub-menu presentation | `presentation` on a sub-menu row: `flyout`, `drill-in`, `adaptive` | Whether a sub-menu opens beside its row or replaces the menu's rows with its own and a Back row, in the same box. `adaptive` drills in when a compact touch display opened the menu.             | Pointer presentation, compound and data mode                    | `adaptive`           | `component:DropdownMenu` | stable    | An unknown value reads as `adaptive`.                            |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Basis                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| FR1  | Every render contains a Trigger button. Pointer presentation renders a Pointer menu surface with pointer-owned rows and optional pointer headings, dividers, indicators, and nested flyouts. Touch presentation renders a Touch sheet frame containing a Touch menu surface, Touch heading, Touch action list, and Touch action rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current source, docs, and tests                                                |
| FR2  | The six local targets are `dropdown-menu`, `dropdown-menu-item`, `dropdown-menu-radio`, `dropdown-menu-section-heading`, `dropdown-menu-divider`, and `dropdown-menu-indicator-icon`; every target stays on its painted element.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `architecture:component-theming-surface`; current source                       |
| FR3  | Button owns the Trigger button, BottomSheet owns the Touch sheet frame, List owns the Touch action list and Touch action rows, Indicator owns checkbox chrome, and Icon owns ordinary rendered icons. The Trigger button carries `component:Button`'s gaps: its press scale applies under reduced motion (`design:reduced-motion` DR1) and its height is fixed (`spec:AST-102` FR4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source and owner docs; `design:reduced-motion` DR1; `spec:AST-102` FR4 |
| FR4  | The same `dropdown-menu` target reaches the alternative Pointer menu surface and Touch menu surface. Pointer action rows carry `dropdown-menu-item`; touch action rows instead use List's `list-item` target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source and tests                                                       |
| FR5  | Both menu surfaces carry `data-astryx-menu-press` and follow `module:DropdownMenu/useMenuPress` FR1–FR7, FR10, and FR11: the row under the release acts, the highlight follows a held pointer, a mouse released outside closes and a finger leaves the menu open, the browser's stray click never acts, and the Pointer menu surface declares `touch-action` by overflow. The grow, collapse, and pan dismissal under a finger are FR21.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `module:DropdownMenu/useMenuPress`; `spec:AST-094` FR26–FR28                   |
| FR6  | When the pointer menu closes, focus returns to the Trigger button with a visible ring only when the menu was driven by keyboard; a press outside that landed on a focusable control keeps focus there.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `architecture:interaction-modality` INV1; DEC-1                                |
| FR7  | `menuMaxHeight` replaces the 300px term of the menu's and its popover viewport's block-size cap while the viewport gutters still bound both; the touch sheet ignores it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | DEC-2                                                                          |
| FR8  | The Trigger button opens the pointer menu on a mouse press-down, with a settle rule on the opening release, and pressing the trigger of an open menu closes it without reopening in the same gesture; a mouse click and the keyboard open as before. The mouse press-open is shipped behavior, not a requirement until `module:DropdownMenu/useMenuPress` DEC-4 is ruled. Under a finger the trigger MUST open the menu as `spec:AST-094` FR29 states: as the finger presses in a fixed bar, after the 150 ms content-touch delay or at a tap's lift inside a scroll view; `presentation="popover"` keeps the tap open. Implementation gap: a held finger opens it after a 500 ms hold, and a tap opens it at its click.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `module:DropdownMenu/useMenuPress` FR8, FR9; `spec:AST-094` FR29               |
| FR9  | With `renderTrigger`, the rendered control carries `aria-haspopup`, `aria-expanded`, `aria-controls` and the `id` the menu's `aria-labelledby` points at, and receives the same press-model, keyboard-open and toggle-click handlers as the Button path; the menu is named by that control. A disabled custom trigger never opens the menu or the sheet. `button` and `renderTrigger` are mutually exclusive: both given, `renderTrigger` wins and a dev warning fires, in both presentations. A drilled-in Back row (FR11) returns to the menu by that same name: the caller's `aria-label` when given, else the control's accessible name, read as the menu opens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | DEC-3                                                                          |
| FR10 | An action row with `href` renders as one anchor carrying `role="menuitem"` (the pointer menu) or the touch sheet's link row, routed through `LinkProvider`; a plain click runs `onClick`, then closes the menu (`hasCloseOnSelect`), then lets the browser navigate; a modified click does not run `onClick`, closes the menu, and is left to the browser; in the pointer menu a middle click closes the menu (`hasCloseOnSelect`), then runs the caller's `onAuxClick`, while the touch sheet leaves a middle click to the browser and stays open; a right click is left to the context menu; Enter and Space activate through a synthesized click that carries the key's modifiers. A disabled link row has no `href`; a blocked destination renders inertly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current behavior; `family:navigation-destinations`                             |
| FR11 | When a compact touch display opened the pointer menu (the query the root presentation uses for its bottom sheet, sampled once as it opens), an `adaptive` sub-menu row drills in: its rows and a leading Back row named "Back to <parent>" replace the menu's rows in the same Pointer menu surface, no flyout opens, the drilled list is a `menu` named by the row's label, and Back, Escape and ArrowLeft return to the row with focus on it; a pick inside closes the whole menu, and closing the menu resets the drilled view. Roving focus and typeahead scope to the shown rows; sibling rows and dividers need no knowledge of it. `presentation="flyout"` keeps the flyout; `"drill-in"` drills in on any pointer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | DEC-4; `spec:AST-094` FR34                                                     |
| FR12 | In the pointer menu ArrowDown on the last enabled row wraps to the first and ArrowUp on the first to the last; PageDown and PageUp move to the last and first fully visible enabled row and, pressed there again, one viewport further without wrapping; ArrowUp on the trigger opens with the last enabled row highlighted; the key that opened the menu and its auto-repeats do not activate; typeahead matches the row's label element alone and ignores Control/Command chords and input-method composition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Current source and tests                                                       |
| FR13 | On a mouse, a nested flyout stays open while the pointer is inside the triangle from where it left its row to the flyout's near edge — including while the pointer is paused there — and closes after the existing delay once the pointer has left both the row and that triangle. The row's click toggle and its guard window are unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current behavior                                                               |
| FR14 | Compound groups follow `component:DropdownMenuGroup`; a data-mode `{type: 'section'}` entry is a `role="group"` named by its title, and an untitled section renders its rows without a heading.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | DEC-6; current tests                                                           |
| FR15 | With `header` or `footer`, the pointer popover is a `role="dialog"` with `aria-modal="true"`, named like the menu, holding the header, then the `role="menu"` element, then the footer; the menu element holds only its rows. The trigger says `aria-haspopup="dialog"` and its `aria-controls` names the popover that holds the dialog. A region keeps its own keys and presses: neither the menu's key handling nor its press model claims an event that begins there. The menu is one Tab stop between the regions. Tab and Shift+Tab move through the header's controls, the menu, then the footer's controls, and wrap at either end; a control that is hidden, or under a hidden ancestor within its region, is not a stop. From a row, or a row of an open sub-menu, Tab and Shift+Tab close every open flyout and continue from the menu's stop. With no other stop, focus stays in the menu. Escape closes from anywhere in the popover, and focus returns to the trigger. The bottom sheet, already a dialog, shows the header above the actions and the footer below them. Without either prop, the menu renders and behaves exactly as it does without them: no dialog, `aria-haspopup="menu"`, and Tab closes the menu. | DEC-8, DEC-10                                                                  |
| FR16 | Checkbox rows follow `component:DropdownMenuCheckboxItem`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Current source                                                                 |
| FR17 | Arrow keys and typeahead skip disabled rows, including checkbox and radio rows. Shipped behavior, not a requirement until OQ1 is ruled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current source and tests                                                       |
| FR20 | With `header` or `footer` on a sub-menu (`DropdownMenuSubMenu`), its surface is a modal dialog named by its row (AR7), holding the header, the sub-menu's `role="menu"` (rows only), then the footer. It sits in a host `DropdownMenu` renders beside its menu, never inside a menu; under a root with no such host (`ContextMenu`) the sub-menu shows its rows alone. On a fine pointer the dialog is the flyout; on a compact touch display, the drilled-in view, which replaces the root's menu and regions until popped. A region keeps its own keys and presses. The rows are one Tab stop: Tab and Shift+Tab walk the header's controls, the rows, then the footer's, and wrap; from a deeper flyout, that flyout closes and the walk goes on from the rows. An open lands as for any sub-menu (FR11, FR12), not on a region. Escape in the dialog, outside an IME composition and unless a control there handled it, returns focus to the row and leaves the root open. A pointer leaving the flyout keeps it open until focus leaves, and it closes with the flyout holding its row. Without either prop nothing changes.                                                                                                    | Current behavior; FR15; AR5                                                    |
| FR21 | Under a finger, in the touch modes (`presentation` not pinned to `'popover'`), the pointer menu MUST grow out of the Trigger button and collapse back into it (`spec:AST-094` FR31), and MUST close as a pan that starts outside it begins (FR32); a pinned `'popover'` keeps the layer's own entrance. A pan dismissal is the menu's own close: focus that was in the menu returns to the Trigger button, whose `aria-expanded` turns false. A mouse keeps the layer's own entrance and exit. Implementation gap: the menu keeps the layer's own entrance and exit under a finger too, and has no pan-outside dismissal of its own.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `spec:AST-094` FR31, FR32; `family:overlay-dismissal` AV6                      |

### Allowed variation

- **AV1 — Presentation.** `popover`, `bottom-sheet`, and resolved `adaptive`
  presentation may select the pointer or touch anatomy without changing the
  ownership of either branch.
- **AV2 — Content mode.** Data-driven and compound pointer menus may vary their
  rows while preserving the target owners. Touch presentation remains
  data-driven.
- **AV3 — Optional content.** Icons, selectable indicators, headings, dividers,
  and nested actions render only when the supplied menu content requires them.

### Representative states

| State                       | Required invariant                                                                                                              | Allowed variation                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Anchored root menu          | Trigger button and Pointer menu surface render with pointer-owned rows.                                                         | Width, placement, alignment, and optional item content vary.     |
| Anchored nested flyout      | Pointer action row opens another Pointer menu surface and may show the submenu indicator icon.                                  | Loading may replace the indicator with the Spinner.              |
| Drilled-in sub-menu         | The Pointer menu surface shows a Back row then the sub-menu's rows; the parent rows are hidden, not unmounted.                  | Depth; which pointer opened the menu; a forced `presentation`.   |
| Bottom-sheet root actions   | Trigger button opens Touch sheet frame, Touch menu surface, heading, action list, and action rows.                              | Icons, sections, dividers, and action descriptions may vary.     |
| Bottom-sheet nested actions | The same frame and list owners remain while heading and rows change to the selected action level.                               | Back control and drill-in indicator follow navigation.           |
| Selectable pointer action   | Pointer action row may contain shared checkbox or radio chrome.                                                                 | Checked and disabled state follow the item contracts.            |
| Custom-trigger menu         | The caller's control carries the trigger ARIA and names the menu; the Pointer menu surface is unchanged.                        | Any focusable control: icon button, chip, avatar, list row.      |
| Link row                    | The Pointer action row (or Touch action row) is the anchor; `onClick`, close and navigation run in that order on a plain click. | `target`, `rel`, icon, description and destructive variant vary. |
| Header or footer            | The popover is a named modal dialog holding header, menu, and footer; Tab wraps.                                                | Region content.                                                  |

### Transformation and precedence order

- **ORD1 — Link row activation.** modified click → no `onClick`, close
  (`hasCloseOnSelect`), the browser opens it; else `onClick` → close
  (`hasCloseOnSelect`) → the browser navigates.
- **ORD2 — Trigger source.** `renderTrigger` → `button`.

### Performance and resources

- **PR1 — Bounded resources.** While open, the pointer menu observes its own
  size and content changes and listens for window and visual-viewport resizes
  and image loads to decide whether it scrolls. A press-open, by a mouse press or a
  held finger, adds document pointer-up and pointer-cancel listeners for the
  length of the press. With
  `presentation="adaptive"` the root subscribes to the compact-touch query while
  mounted; the drill-in reads it once as the menu opens.

## Accessibility contract

While a pointer is held, the highlight is DOM focus per
`module:DropdownMenu/useMenuPress` AR1. Focus return on close follows FR6 and
`architecture:interaction-modality` INV1 through the shared focus-return
visibility helper.

- **AR1 — A custom trigger still names the menu.** With `renderTrigger`, the
  menu carries `aria-labelledby` pointing at the control's `id` (the Button path
  keeps `aria-label`), and the control carries `aria-haspopup="menu"`,
  `aria-expanded` and `aria-controls`.
- **AR2 — A row that navigates is a link element.** A row with an `href` is
  the anchor itself: in the pointer menu it keeps `role="menuitem"` so the menu
  stays one menu, while a modified click or Enter keeps the browser's link
  meaning; in the bottom sheet the row is a plain link; a disabled link row is
  not activatable.
- **AR3 — A drilled-in sub-menu stays one menu.** On a compact touch display a
  sub-menu replaces the rows in the same menu box with a "Back to <parent>" row
  and its own rows; after a keyboard open focus lands on the first row after
  Back, after a pointer open on the drilled list (the `menu`); Back, Escape, or
  ArrowLeft return to the parent view with focus restored.
- **AR4 — The anchored trigger adopts the APG Menu Button pattern's required
  parts** (`spec:AST-020/FR15`): the control that opens the anchored pointer
  menu is a `button` with an accessible name, `aria-haspopup="menu"`,
  `aria-expanded` reflecting the menu, and `aria-controls` naming it; Enter or
  Space opens the menu with focus on the first enabled row. As a named
  exception under that rule, the trigger also opens on ArrowDown (focus on the
  first enabled row) and ArrowUp (focus on the last enabled row), the keyboard
  this component already ships (DEC-9). A `renderTrigger` control receives
  `aria-haspopup`, `aria-expanded`, `aria-controls`, and the keyboard and focus
  handlers through the spread props (FR9); the caller's control supplies its
  own `button` role and accessible name. The bottom-sheet presentation and a
  pointer menu with `header` or `footer` are outside this pattern: their
  trigger opens a dialog and says `aria-haspopup="dialog"` (AR5).
- **AR5 — With a header or footer, the pointer popover adopts the APG Dialog
  (Modal) pattern's required parts** (`spec:AST-020/FR15`): `role="dialog"`,
  `aria-modal="true"`, and an accessible name, the menu's; focus moves into
  the dialog on open, to the menu or its first enabled row as FR6 and FR12
  state; Tab and Shift+Tab cycle within it (FR15); Escape closes it and focus
  returns to the trigger. The menu inside keeps AR1–AR3. The trigger keeps
  `aria-expanded`; its `aria-haspopup` says `dialog`, and its `aria-controls`
  names the popover that holds the dialog rather than the menu, as Popover's
  own trigger does.
- **AR6 — Disabled rows are inert.** A disabled row runs no caller activation
  handler and does not close the menu; FR17 records that the arrow keys skip
  it.
- **AR7 — A sub-menu with a header or footer adopts the same APG Dialog
  (Modal) parts for its own surface** (`spec:AST-020/FR15`): `role="dialog"`,
  `aria-modal="true"`, and an accessible name, its row's; focus moves into the
  dialog on open, to the sub-menu's first row or its menu as FR11 and FR12
  state; Tab and Shift+Tab cycle within it (FR20); Escape closes it and focus
  returns to the row. The sub-menu's menu inside keeps AR3. The row keeps
  `aria-expanded`; its `aria-haspopup` says `dialog` and its `aria-controls`
  names the dialog.

## Design relationships

| Anatomy or state                   | Design requirement                                                            | Representation authority       | Hierarchy role    | Component contract |
| ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------------ | ----------------- | ------------------ |
| Trigger button                     | Provides the visible control that opens and closes the selected presentation. | `component:Button`             | Supporting        | FR1, FR3           |
| Trigger indicator icon             | Communicates disclosure on labeled triggers when enabled.                     | `component:Icon`               | Supporting        | FR1, FR3           |
| Pointer menu surface               | Paints the anchored root or nested pointer menu panel.                        | Current source and public docs | Prominent         | FR1, FR2, FR4      |
| Pointer action row                 | Presents one action, selectable option, or nested-menu entry.                 | Current source and public docs | Prominent         | FR1, FR2, FR4      |
| Icon-rendered item icon            | Adds an optional semantic or component icon to an action row through Icon.    | `component:Icon`               | Supporting        | FR1, FR3           |
| Caller-rendered item start content | Presents arbitrary React content directly in an action-row start slot.        | Caller-supplied content        | Context-dependent | FR1, FR3           |
| Checkbox indicator                 | Draws the decorative checkbox state for a checkbox action row.                | `component:Indicator`          | Supporting        | FR1, FR3           |
| Radio indicator                    | Draws shared radio chrome with the current menu-specific radio target.        | Current source and Indicator   | Supporting        | FR1, FR2, FR3      |
| Pointer section heading            | Labels a grouped set of pointer action rows.                                  | Current source and public docs | Supporting        | FR1, FR2           |
| Pointer divider                    | Separates groups of pointer action rows.                                      | Current source and public docs | Supporting        | FR1, FR2           |
| Pointer submenu indicator icon     | Identifies a pointer action row that opens a nested flyout.                   | Current source and public docs | Supporting        | FR1, FR2           |
| Touch sheet frame                  | Supplies the touch panel, scrolling area, handle, and optional scrim.         | `component:BottomSheet`        | Prominent         | FR1, FR3           |
| Touch menu surface                 | Arranges menu-owned heading and action content inside the sheet.              | Current source and public docs | Prominent         | FR1, FR2, FR4      |
| Touch heading                      | Names the current root or drill-in action view.                               | Current source and tests       | Supporting        | FR1                |
| Touch action list                  | Groups touch actions using the spacious List presentation.                    | `component:List`               | Prominent         | FR1, FR3           |
| Touch action row                   | Presents one touch action or drill-in entry using ListItem.                   | `component:List`               | Prominent         | FR1, FR3, FR4      |
| Touch divider                      | Separates groups in the touch action list.                                    | `component:Divider`            | Supporting        | FR1, FR3           |

The `dropdown-menu` target intentionally appears on both alternative menu
surfaces. The radio element also carries Indicator's shared radio target, and
the pointer divider also carries Divider's target; their local targets remain
valid distinct contracts. Touch headings retain the shared `heading` target documented by Text rather
than adding a DropdownMenu-owned heading target.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Trigger button": {
    "delegatesTo": {"owner": "component:Button", "target": "button"}
  },
  "Trigger indicator icon": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Pointer menu surface": {"target": "dropdown-menu"},
  "Pointer action row": {"target": "dropdown-menu-item"},
  "Icon-rendered item icon": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Caller-rendered item start content": {
    "none": {
      "reason": "intentional: Arbitrary ReactNode item content is caller-owned and receives no DropdownMenu target."
    }
  },
  "Checkbox indicator": {
    "delegatesTo": {
      "owner": "component:Indicator",
      "target": "checkbox-indicator"
    }
  },
  "Radio indicator": {"target": "dropdown-menu-radio"},
  "Pointer section heading": {"target": "dropdown-menu-section-heading"},
  "Pointer divider": {"target": "dropdown-menu-divider"},
  "Pointer submenu indicator icon": {
    "target": "dropdown-menu-indicator-icon"
  },
  "Touch sheet frame": {
    "delegatesTo": {"owner": "component:BottomSheet", "target": "bottom-sheet"}
  },
  "Touch menu surface": {"target": "dropdown-menu"},
  "Touch heading": {
    "delegatesTo": {"owner": "component:Text", "target": "heading"}
  },
  "Touch action list": {
    "delegatesTo": {"owner": "component:List", "target": "list"}
  },
  "Touch action row": {
    "delegatesTo": {"owner": "component:List", "target": "list-item"}
  },
  "Touch divider": {
    "delegatesTo": {"owner": "component:Divider", "target": "divider"}
  }
}
```

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, local
  target mapping, presentation-specific rows, and delegation rules.
- `architecture:interaction-modality` owns the shared pointer, touch, keyboard,
  and adaptive-presentation boundaries.
- `architecture:layer-runtime` owns the popover host, native light-dismiss
  reconciliation, anchor positioning, and nested flyout layers. Touch
  presentation delegates hosting to BottomSheet.
- `family:overlay-dismissal` owns shared Escape and platform-close ordering.
  The DropdownMenu root participates through its popover focus trap; the
  composed BottomSheet and DropdownMenuSubMenu retain their recorded local-only
  adoption gaps.
- `family:navigation-destinations` owns link-row destinations and blocked
  schemes (FR10).
- `spec:AST-094` owns the touch press, open, grow, and dismissal rules (FR5,
  FR8, FR11, FR21).

## Verification map

| Contract            | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Representative states                                                                  | Mutation or failure expectation                                                                                                                                                                                                                                                                  | Audit section                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| FR1, FR4            | `DropdownMenu.test.tsx` rendering cases ("renders menu with role=\"menu\"", "renders data-driven actions in a bottom sheet when requested", "uses the BottomSheet for adaptive presentation on compact touch", "uses the shared menu BottomSheet frame", "keeps adaptive presentation anchored without compact touch") and section, divider, and compound cases                                                                                               | Root pointer, root touch, adaptive                                                     | A missing surface, sheet frame, or menu role fails. Evidence gap: no test asserts the `dropdown-menu` target on the Touch menu surface or `list-item` on touch rows.                                                                                                                             | `audit:DropdownMenu/anatomy`       |
| FR2                 | `DropdownMenu.test.tsx` theming-slot cases ("exposes a themeable slot on the section heading", "exposes a themeable slot on the menu divider"); `DropdownMenuSubMenu.test.tsx` "exposes a themeable slot on the submenu indicator icon"; `themingTargets.test.ts`                                                                                                                                                                                             | Heading, divider, submenu indicator                                                    | A missing heading, divider, or indicator target fails; a rendered class absent from the documented targets fails. Evidence gap: no test asserts `dropdown-menu`, `dropdown-menu-item`, or `dropdown-menu-radio` placement.                                                                       | `audit:DropdownMenu/theming`       |
| FR3                 | `DropdownMenu.test.tsx` button customization, icon-only, and hasChevron cases                                                                                                                                                                                                                                                                                                                                                                                 | Button variants and sizes; icon-only; no chevron                                       | A Button prop that stops reaching the trigger fails. Evidence gap: the delegated Trigger Button gaps are asserted by `component:Button`'s own records, and no test here asserts the BottomSheet, List, Indicator, or Icon delegation beyond rendering.                                           | `audit:DropdownMenu/theming`       |
| FR5                 | `DropdownMenu.test.tsx` press-model cases ("a finger that lands on one row and lifts on another acts on the second, once", "a mouse released outside closes the menu; a finger released outside leaves it open", "marks the menu as carrying the press model and owns touch scrolling"); `MenuPress.a11y.chromium.spec.ts`; the module record's own map                                                                                                       | Finger and mouse release; scrolling menu                                               | A row that acts on press-down, a mouse release outside that keeps the menu, or a missing press marker fails.                                                                                                                                                                                     | `audit:DropdownMenu/behavior`      |
| FR6                 | `DropdownMenu.test.tsx` focus-return cases ("restores focus to the trigger after keyboard dismissal", "returns focus to the trigger after pointer dismissal without a focus ring", "leaves focus on the control a press outside landed on") and the "focus return after a pointer pick" and "a trigger the caller renders" cases                                                                                                                              | Keyboard and pointer close; Button and custom trigger                                  | A lost focus return, a ring after a pointer close, no ring after a keyboard close, or focus pulled off a control pressed outside fails.                                                                                                                                                          | `audit:DropdownMenu/accessibility` |
| FR7                 | `DropdownMenu.test.tsx` menuMaxHeight cases                                                                                                                                                                                                                                                                                                                                                                                                                   | A cap above 300px; viewport bound                                                      | A menu clipped to 300px under a raised cap, or one that escapes the viewport, fails. Evidence gap: no test asserts that the touch sheet ignores the cap.                                                                                                                                         | `audit:DropdownMenu/layout`        |
| FR8                 | `DropdownMenu.test.tsx` press-model trigger cases ("a mouse press on the trigger opens the menu and a drag-release acts on the row under it", "the opening release before the settle time acts on nothing and the menu stays", "pressing the trigger of an open menu closes it and does not reopen it in the same gesture", "a held touch on the trigger opens with the finger down and a slide picks", "a tap on the trigger still opens through its click") | Mouse press-open; held finger; tap                                                     | A mouse that opens only on click, an opening release that acts early, or a re-open in the closing gesture fails. The held-touch case asserts the current 500 ms hold, the FR8 gap pending conformance.                                                                                           | `audit:DropdownMenu/behavior`      |
| FR9, AR1            | `DropdownMenu.test.tsx` custom trigger cases; `DropdownMenuSubMenu.test.tsx` "a menu hung off a custom trigger" cases                                                                                                                                                                                                                                                                                                                                         | Custom trigger open, keyboard, mouse, disabled; both props given; Back row names       | A custom trigger that does not open, toggle, or name the menu, a disabled one that opens, a missing warning, or a wrong Back row name fails.                                                                                                                                                     | `audit:DropdownMenu/accessibility` |
| FR10, AR2, ORD1     | `DropdownMenu.test.tsx` "DropdownMenuItem href" and "link rows — the browser's own clicks" cases                                                                                                                                                                                                                                                                                                                                                              | Plain, modified, middle, and right click; Enter; bottom sheet; disabled; blocked       | A row that is not an anchor, a modified click that runs `onClick`, a middle click that does not close, a disabled row with an address, or a live blocked destination fails. Evidence gap: no test asserts the order of `onClick`, close, and navigation.                                         | `audit:DropdownMenu/behavior`      |
| FR11, AR3           | `DropdownMenuSubMenu.test.tsx` "drill-in on a phone" cases; `DropdownMenuDrillIn.a11y.chromium.spec.ts`                                                                                                                                                                                                                                                                                                                                                       | Phone and laptop; forced presentations; theme breakpoint; reset on close               | A flyout on a phone, a drill-in on a laptop by default, a wrong name, a Back that loses focus, or a drilled view that survives a close fails.                                                                                                                                                    | `audit:DropdownMenu/accessibility` |
| FR12, AR4           | `DropdownMenu.test.tsx` keyboard cases ("ArrowDown on the last row wraps to the first, ArrowUp on the first to the last", "ArrowUp on the trigger opens with the last row highlighted", "PageDown moves to the last row and PageUp back to the first", "the opening key's auto-repeat does not act on the highlighted row"), open-focus cases, typeahead cases, and "has aria-haspopup and aria-expanded attributes"                                          | Wrap, Page keys, open keys, auto-repeat, typeahead                                     | A missing wrap, a Page key that does not move, an ArrowUp open on the first row, an auto-repeat that acts, or a missing typeahead match fails. Evidence gap: no test asserts PageDown past the visible rows, typeahead ignoring chords or composition, or `aria-controls` on the Button trigger. | `audit:DropdownMenu/accessibility` |
| FR13                | `DropdownMenuSubMenu.test.tsx` safe-triangle cases                                                                                                                                                                                                                                                                                                                                                                                                            | Diagonal path, pause inside, leaving both                                              | A flyout that closes inside the triangle or stays open after leaving it fails.                                                                                                                                                                                                                   | `audit:DropdownMenu/behavior`      |
| FR14                | `DropdownMenu.test.tsx` section cases                                                                                                                                                                                                                                                                                                                                                                                                                         | Titled and untitled sections                                                           | A missing group role or title fails.                                                                                                                                                                                                                                                             | `audit:DropdownMenu/accessibility` |
| FR15, AR5           | `DropdownMenu.test.tsx` header and footer cases, including the hidden-control, open-sub-menu, and header radio-group cases; `MenuHeaderFooter.a11y.chromium.spec.ts`                                                                                                                                                                                                                                                                                          | Regions present and absent; hidden controls; open flyout; custom trigger; bottom sheet | A region inside the menu, a missing or unnamed dialog, a wrong `aria-haspopup`, a Tab that leaves the popover, a hidden control taken as a stop, or a region whose keys the menu takes fails.                                                                                                    | `audit:DropdownMenu/accessibility` |
| FR17, AR6           | `DropdownMenu.test.tsx` "skips aria-disabled menuitemradio and menuitemcheckbox items during arrow navigation" and "typeahead skips an aria-disabled item and matches the next enabled label" (the shipped behavior OQ1 leaves open); disabled-row cases                                                                                                                                                                                                      | Disabled rows                                                                          | A disabled row that runs a caller handler fails.                                                                                                                                                                                                                                                 | `audit:DropdownMenu/accessibility` |
| FR20, AR7           | `DropdownMenuSubMenu.test.tsx` header and footer cases, including "on a phone"; `SubMenuHeaderFooter.a11y.chromium.spec.ts`; `ContextMenu.test.tsx` "shows a sub-menu with a header or footer as its rows alone, and says why in development"                                                                                                                                                                                                                 | Fine pointer and phone; Escape paths; nested flyouts; pointer leaving                  | A region inside a menu, an unnamed dialog, a Tab walk that does not wrap, an Escape that closes the root, or a flyout that closes while focus is inside fails.                                                                                                                                   | `audit:DropdownMenu/accessibility` |
| FR21                | Evidence gap: no test, matching the FR21 gap                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                                                      | —                                                                                                                                                                                                                                                                                                | `audit:DropdownMenu/behavior`      |
| PR1                 | Evidence gap: no test asserts the listener and observer bounds                                                                                                                                                                                                                                                                                                                                                                                                | —                                                                                      | —                                                                                                                                                                                                                                                                                                | `audit:DropdownMenu/behavior`      |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                 | Canonical anatomy and targets                                                          | Missing, extra, prefixed, stale, or alias-backed mappings fail repository validation.                                                                                                                                                                                                            | `audit:DropdownMenu/theming`       |

## Current-state impact

- **Finger press-open (FR8).** A held finger opens the menu after a 500 ms
  hold, and a tap at its click, instead of as `spec:AST-094` FR29 states.
- **Touch grow and pan dismissal (FR21).** Under a finger the menu appears and
  leaves with the layer's own entrance and exit instead of growing out of and
  back into the Trigger button, and a pan that starts outside does not close
  it, against `spec:AST-094` FR31 and FR32.
- **Delegated Trigger Button gaps (FR3).** The Trigger button scales on a press
  under reduced motion and holds a fixed height, as `component:Button` records,
  against `design:reduced-motion` DR1 and `spec:AST-102` FR4.

## Decision log

### DEC-1 — Pointer dismissal returns focus to the trigger, ring suppressed

**Reference:** `component:DropdownMenu/DEC-1`

**Decider:** `cixzhang`, 2026-10-02

Blurring the trigger after a pointer dismissal would keep Safari from painting
a ring after a touch pick, but focus falling to the page loses a keyboard user
who reaches for the arrows next. Focus returns to the trigger and the shared focus-return visibility helper suppresses the ring
after pointer input (`architecture:interaction-modality` INV1), as the
bottom-sheet presentation already did. The press model's own decisions remain
in `module:DropdownMenu/useMenuPress`.

### DEC-2 — `menuMaxHeight` is a number of pixels

**Reference:** `component:DropdownMenu/DEC-2`
**Decider:** `cixzhang`, `2026-10-02`

`menuMaxHeight` replaces only the 300px term of the cap; the viewport gutters
still bound the menu, so a menu that must show all of its rows (a docked phone
menu of eleven 44px rows) can, without ever overflowing the screen. The dynamic
value uses `100dvb` alone; every browser with anchor positioning has it.

A prop rather than a theme variable, because the need is situational — one
menu with many rows — rather than a product-wide preference, and a prop reads
more clearly at the callsite that has the problem.

The value is a number of pixels. Rejected: an arbitrary CSS length (`50vh`,
`calc(...)`), which is product-shaped tuning on a shared component that
`spec:AST-002` does not admit, and which lets a caller write a cap the
viewport term cannot reason about.

### DEC-3 — Any control can open a menu

**Reference:** `component:DropdownMenu/DEC-3`

**Decider:** `cixzhang`, 2026-10-02

`renderTrigger` is a render prop handing the caller `DropdownMenuTriggerProps`
to spread, so the press model, the keyboard opens and the ARIA wiring ride the
same code path as the built-in Button, and the menu is named by the control
through `aria-labelledby`. `button` and `renderTrigger` are mutually exclusive
(a dev warning); the Button path is unchanged.

The prop is named for `spec:AST-055` DEC-5 and DEC-6: `render<X>` is the
prefix for every render prop in the system, and a bare `trigger` is already
public with a different shape on `Collapsible`, where it is a `ReactNode`
slot, so one word would otherwise mean two things.

Rejected: a content slot taking a rendered element. A slot cannot hand the
caller the props the control must carry, so the component would have to
reach into the element to attach them.

The open state reaches the caller's control as `aria-expanded` on the spread
props, and the prop's documentation shows styling from that attribute. A
pressed look keyed to `:active` is not a substitute: `:active` does not
behave the same under a coarse pointer, which is why menu rows drop
coarse-pointer `:active` paint entirely.

Rejected: an `as` prop on the Button — an icon button, a chip, an avatar and a
list row are not Button variants; a slot component — hides which props must
reach the control.

### DEC-4 — Sub-menus drill in on a phone

**Reference:** `component:DropdownMenu/DEC-4`

**Decider:** `cixzhang`, 2026-10-02

A flyout beside a phone-width menu has no room. When a compact touch display
opened the menu — sampled once, as it opens, so the menu never changes shape
under a pointer — a sub-menu row pushes its view onto a stack the root keeps
(`useMenuDrillIn`, internal) and the root shows that view in place of its rows:
a "Back to <parent>" row, then the sub-menu's rows, inside the same menu box.
The sub-menu portals its list into the root's host so the row stays mounted,
its rows stay live, and Back has something to return focus to; sibling rows
and dividers need no knowledge of it. Works in compound and data mode and in
`ContextMenu`; `presentation` overrides the policy.

The query is `COMPACT_TOUCH_PRESENTATION_QUERY`, the one the root
presentation already uses to decide its bottom sheet, so one component
carries one meaning of "adaptive". A bare `(pointer: coarse)` disagreed with
it on a large touch tablet: the menu stayed an anchored popover while its
sub-menus replaced rows in place, a combination nobody designed.

The public surface is `presentation` alone. `useMenuDrillIn` and its
`DropdownMenuDrillIn` view-stack controller stay internal: exporting them
would make internal machinery permanent API that nothing here requires a
caller to touch. A product that later needs to drive the stack earns a
deliberate component or hook then, with its own contract.

Rejected: a flipped flyout — lands over the parent rows and reads as a second
menu; drill-in in data mode only — every menu in the app is compound; a
`{label, children}` snapshot pushed onto the stack — unmounts the row and
breaks focus return.

### DEC-6 — A titled group of rows is `DropdownMenuGroup`

**Reference:** `component:DropdownMenu/DEC-6`

**Decider:** `cixzhang`, 2026-10-03

Data mode could title a run of rows through `{type: 'section', title}` and
compound mode could not, so the menus that most need grouping — checkbox
rows, radio groups, rows mounted conditionally, all of which must be
compound — left a screen reader a run of loose rows where a sighted user saw
two clusters. The compound peer names its rows through `aria-labelledby` on
the visible heading and reuses the `dropdown-menu-section-heading` treatment,
so one heading looks and reads the same in both modes.

The component is named for the `role="group"` it renders. The data model
keeps `DropdownMenuSection` for its `{type: 'section'}` entry: the two words
describe the same concept, and one name across both would collide with that
exported type. Rejected: renaming the component to `DropdownMenuSection`,
which collides; renaming both, which breaks a public type for a wording
change.

`title` is `ReactNode`. A rich heading is a legitimate need, and the data
mode's string title is the narrower case rather than the model to match. A
focusable node inside a heading lands in the group but outside the roving
focus order, so the arrow keys cannot reach it; the type does not prevent
that and a case pins the behavior instead.

### DEC-8 — Controls beside the rows go in `header` and `footer`

**Reference:** `component:DropdownMenu/DEC-8`
**Decider:** `cixzhang`, 2026-10-11

`role="menu"` admits only menu items, groups and separators. A filter field
or a "Create" button placed among the rows makes the menu invalid to a screen
reader, and makes the menu's key handling and press model fight the control.
The control belongs beside the menu, not in it. `header` and `footer` place it
there: in the same popover or sheet, outside the menu element. Outside the
menu element, the menu never claims the control's keys or presses. Because
`children` stay rows only, nothing can be placed between rows; the component
needs no inspection of its children to keep that true.

The menu becomes one Tab stop between the regions, so the popover reads as
one Tab sequence: header, menu, footer, inside the dialog of DEC-10. Focus on
open is unchanged. Rejected:
letting the menu's handlers step aside for controls placed among the rows —
that makes invalid structure work instead of fixing it; and a caller-wrapped
items element, which leaves "nothing between the rows" to convention.

### DEC-9 — The trigger is a Menu Button, arrow-key opening included

**Reference:** `component:DropdownMenu/DEC-9`
**Decider:** `cixzhang`, `2026-10-13`

The pointer trigger already plays the Menu Button's role, so it carries the pattern's required parts (AR4). ArrowDown and ArrowUp opening go beyond the adoption rule's required set and stay as a named exception because the component shipped them (FR12 keeps the wrap once the menu is open) and removing a working keyboard path would cost the users who have it. ContextMenu and NavMenu are not covered by this decision.

Rejected: dropping arrow-key opening to match the rule's default; adopting the pattern for every control that opens any layer.

### DEC-10 — A popover with a header or footer is a modal dialog, and Tab wraps

**Reference:** `component:DropdownMenu/DEC-10`
**Decider:** `cixzhang`, 2026-10-13

A popover that holds a menu and controls that are not menu items is not a
menu: a trigger exposing `aria-haspopup="menu"` promises a menu, and the
popover then holds a field or a button that is not one. With `header` or
`footer`, the popover is therefore exposed as a named modal dialog with the
menu inside it, the trigger says `aria-haspopup="dialog"`, and
`aria-controls` names the popover that holds the dialog. Moving the
menu role inward keeps every row a menu item and every other control outside
the menu. Tab and Shift+Tab wrap within the dialog, as the APG Dialog
pattern requires; Escape and a press outside close it. Without either prop
the component is unchanged: a Menu Button whose Tab closes the menu. Rejected:
closing on Tab past either end, which leaves a modal dialog by Tab.

## Open questions

- **OQ1 — Which shared owner should make disabled menu rows keyboard-discoverable
  without changing disabled behavior in non-menu composites?** (`human-api`)
  WAI-ARIA's Menu pattern keeps disabled menu items focusable but inert. Current
  `useListFocus` deliberately skips every `aria-disabled` item for all consumers,
  and DropdownMenu's enabled-only focus-on-open and navigation tests depend on
  that result. The requirement is objective; choosing a menu-specific hook policy
  or a DropdownMenu-owned path changes a shared API and ownership boundary.

## Content boundary

This file does not duplicate consumer prop tables, item examples, focus and
positioning algorithms, implementation steps, or shared modality, layer,
dismissal, and theming rules. It links to their owners.
