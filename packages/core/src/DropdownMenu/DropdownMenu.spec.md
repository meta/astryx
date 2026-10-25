---
schema_version: 3
template_version: 3
kind: component
id: component:DropdownMenu
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [accessibility, behavior, layout, public-api, theming]
verified_by:
  [
    packages/core/src/DropdownMenu/DropdownMenu.test.tsx,
    packages/core/src/DropdownMenu/DropdownMenuSelectable.test.tsx,
    packages/core/src/DropdownMenu/DropdownMenuSubMenu.test.tsx,
    packages/core/src/DropdownMenu/__tests__/DropdownMenuDrillIn.a11y.chromium.spec.ts,
    packages/core/src/DropdownMenu/__tests__/MenuPress.a11y.chromium.spec.ts,
    packages/core/src/DropdownMenu/__tests__/MenuHeaderFooter.a11y.chromium.spec.ts,
    packages/core/src/BottomSheet/BottomSheet.test.tsx,
    packages/core/src/List/List.test.tsx,
    packages/core/src/Indicator/Indicator.test.tsx,
    packages/core/src/Icon/Icon.test.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: [module:DropdownMenu/useMenuPress, module:DropdownMenu/useMenuHover]
families: [family:overlay-dismissal, family:navigation-destinations]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:layer-runtime,
  ]
contributing: []
system_specs: []
---

# DropdownMenu component contract

## Intent

DropdownMenu presents actions from a visible Button trigger in either an
anchored pointer menu or a BottomSheet-hosted touch action list. This draft
records current consumer anatomy, presentation-specific ownership, and theming
reachability. Its press model — the row under the release acts and the
highlight follows the pointer — is contracted by
`module:DropdownMenu/useMenuPress`, which both presentations mount.

## Compatibility and migration

- Released default preserved: `no` under a finger. The omitted
  `presentation`, released as `'popover'`, follows `spec:AST-094` FR29 (open
  on press) under a finger; `presentation="popover"` keeps the released
  behavior (`spec:AST-094` FR25). Mouse and keyboard are unchanged.
- Compatibility class: compatible behavior correction; public API, DOM
  shape, styling, and targets are preserved; the default under a finger
  changes as above, and the press-model behavior delta is recorded in
  `module:DropdownMenu/useMenuPress`
- Controlled/uncontrolled behavior: unchanged
- Migration decision: `module:DropdownMenu/useMenuPress/DEC-3`; proposed
  `module:DropdownMenu/useMenuPress/DEC-4`; `spec:AST-094/DEC-4` (a caller
  that needs the released tap-open passes `presentation="popover"`)

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The Pointer menu surface and Touch menu surface and their shared current
  `dropdown-menu` target.
- Pointer action rows, pointer-only section headings and dividers, radio marker
  specialization, and submenu indicator presentation through the other five
  current DropdownMenu targets.
- Selecting between the current pointer and touch render paths after presentation
  policy resolves.
- Mounting the shared press model on both menu surfaces and (proposed) on
  the Trigger button for mouse press-open and held-finger open; the model
  itself is owned by `module:DropdownMenu/useMenuPress`.

**Does not own / non-goals**

- Trigger-button presentation — delegated to `component:Button`.
- The Touch sheet frame — delegated to `component:BottomSheet`.
- Touch action-list and row presentation — delegated to `component:List`.
- Shared checkbox-indicator and ordinary icon presentation — delegated to
  `component:Indicator` and `component:Icon`.
- Shared layer lifecycle or dismissal policy.

## Public concepts

Consumer props, item shapes, subcomponents, and presentation policy remain
documented in `DropdownMenu.doc.mjs` and the subcomponent docs. Four component-local concepts are added, by DEC-2, DEC-3, DEC-8 and proposed DEC-13; each
keeps its released default.

| Concept           | Closed values or states                                  | Meaning                                                                                                                                                                                          | Availability by variant/orientation/state | Default  | Owner                    | Stability | Invalid-value behavior                              |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | -------- | ------------------------ | --------- | --------------------------------------------------- |
| Menu height cap   | `menuMaxHeight`: a number of pixels                      | Lifts the 300px cap for a menu that must fit its rows; the viewport still bounds it.                                                                                                             | Pointer presentation                      | `300px`  | `component:DropdownMenu` | stable    | Ignored by the touch sheet.                         |
| Trigger source    | `button` (Button props) or `renderTrigger` (render prop) | Which control the menu hangs off. `trigger` receives `DropdownMenuTriggerProps` — the press model, keyboard opens, toggle click and ARIA wiring — and names the menu.                            | Both presentations                        | `button` | `component:DropdownMenu` | stable    | Both given: `trigger` wins and a dev warning fires. |
| Header and footer | `header`, `footer`: any React node                       | Content above and below the rows, beside the menu inside the same popover or sheet — never inside the `role="menu"` element. With either, the pointer popover is a modal dialog around the menu. | Both presentations                        | none     | `component:DropdownMenu` | stable    | A false or empty value renders no region.           |
| Sub-menu regions  | `header`, `footer` on a sub-menu: any React node         | Content above and below a sub-menu's rows, beside its menu inside its own surface; with either, that surface is a modal dialog named by the row (proposed FR20).                                 | Popover presentation                      | none     | `component:DropdownMenu` | proposed  | A false or empty value renders no region.           |

## Behavioral and layout contract

| ID                    | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Basis                                                                                                                                                                         | Draft review state                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| FR1                   | Every current render contains a Trigger button. Pointer presentation renders a Pointer menu surface with pointer-owned rows and optional pointer headings, dividers, indicators, and nested flyouts. Touch presentation renders a Touch sheet frame containing a Touch menu surface, Touch heading, Touch action list, and Touch action rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source, docs, and tests                                                                                                                                               | Verified current behavior; no new behavior decided                                |
| FR2                   | The six current local targets are `dropdown-menu`, `dropdown-menu-item`, `dropdown-menu-radio`, `dropdown-menu-section-heading`, `dropdown-menu-divider`, and `dropdown-menu-indicator-icon`; every target remains on its current painted element.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source, docs, and tests                                                                                                                                               | Verified current inventory; no target change                                      |
| FR3                   | Button owns the Trigger button, BottomSheet owns the Touch sheet frame, List owns the Touch action list and Touch action rows, Indicator owns checkbox chrome, and Icon owns ordinary rendered icons.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current source and owner docs                                                                                                                                                 | Verified current delegation; no ownership change                                  |
| FR4                   | The same `dropdown-menu` target reaches the alternative Pointer menu surface and Touch menu surface. Pointer action rows retain `dropdown-menu-item`; touch action rows instead use List's `list-item` target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests                                                                                                                                                      | Verified modality split; no target change                                         |
| FR5                   | Both menu surfaces carry `data-astryx-menu-press` and follow `module:DropdownMenu/useMenuPress` FR1–FR7: the row under the release acts, the highlight follows a held pointer, a mouse released outside closes and a finger leaves the menu open, the browser's stray click never acts, and the Pointer menu surface declares `touch-action` by overflow. Under a finger the press, the menu's grow and collapse, and its dismissal follow `spec:AST-094` FR26–FR35 (pending implementation). Trigger opening and keyboard navigation are unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `module:DropdownMenu/useMenuPress`; `DropdownMenu.test.tsx` press model suite                                                                                                 | Proposed; verified in jsdom and real Chromium                                     |
| FR6                   | When the pointer menu closes, focus returns to the Trigger button with a visible ring only when the menu was driven by keyboard; a press outside that landed on a focusable control keeps focus there.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `architecture:interaction-modality` INV1; proposed in this change; `DropdownMenu.test.tsx` closing suite                                                                      | Proposed; verified in jsdom, pending owner review                                 |
| FR7                   | `menuMaxHeight` MUST replace the 300px term of the menu's and its popover viewport's block-size cap while the viewport gutters still bound both; the touch sheet ignores it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `component:DropdownMenu/DEC-3`                                                                                                                                                | Proposed; verified in jsdom; owner to confirm DEC-3                               |
| FR8                   | The Trigger button opens the pointer menu on a mouse press-down, with the module's settle rule on the opening release, and under a finger as `spec:AST-094` FR29 states; pressing the trigger of an open menu closes it without reopening in the same gesture; a mouse click and the keyboard open as before (`module:DropdownMenu/useMenuPress` proposed FR8, FR9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Proposed `module:DropdownMenu/useMenuPress/DEC-4`; `DropdownMenu.test.tsx` press model suite                                                                                  | Proposed; verified in jsdom, pending owner review                                 |
| Trigger source        | `button` (Button props) or `renderTrigger` (render prop)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Which control the menu hangs off. `trigger` receives `DropdownMenuTriggerProps` — the press model, keyboard opens, toggle click and ARIA wiring — and names the menu.         | Both presentations                                                                | `button`             | `component:DropdownMenu` | stable | Both given: `trigger` wins and a dev warning fires.              |
| FR9                   | With `renderTrigger`, the rendered control MUST carry `aria-haspopup`, `aria-expanded`, `aria-controls` and the `id` the menu's `aria-labelledby` points at, and MUST receive the same press-model, keyboard-open and toggle-click handlers as the Button path; the menu is named by that control. `button` and `trigger` are mutually exclusive: both given, `trigger` wins and a dev warning fires, in both presentations. A drilled-in Back row (FR11) returns to the menu by that same name: the caller's `aria-label` when given, else the control's accessible name, read as the menu opens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `component:DropdownMenu/DEC-2`                                                                                                                                                | Proposed; verified in jsdom; owner to confirm DEC-2                               |
| Row destination       | `href` (+ `target`, `rel`) on an action item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | The row's act is navigation: the row itself is the link (`family:navigation-destinations`).                                                                                   | Pointer action row and Touch action row, compound and data mode                   | none (an action row) | `component:DropdownMenu` | stable | Blocked schemes follow the family rule; a disabled row has none. |
| FR10                  | An action row with `href` MUST render as one anchor carrying `role="menuitem"` (the pointer menu) or the touch sheet's link row, routed through `LinkProvider`; a plain click MUST run `onClick`, then close the menu (`hasCloseOnSelect`), then let the browser navigate; a modified click or middle click MUST be left to the browser and MUST NOT run `onClick`; Enter and Space MUST activate through a synthesized click that carries the key's modifiers. A disabled link row has no `href`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `component:DropdownMenu/DEC-2`; `family:navigation-destinations`                                                                                                              | Proposed; verified in jsdom; owner to confirm DEC-1                               |
| Sub-menu presentation | `presentation` on a sub-menu row: `flyout`, `drill-in`, `adaptive`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Whether a sub-menu opens beside its row or replaces the menu's rows with its own and a Back row, in the same box. `adaptive` drills in when a coarse pointer opened the menu. | Pointer presentation, compound and data mode                                      | `adaptive`           | `component:DropdownMenu` | stable | An unknown value reads as `adaptive`.                            |
| FR11                  | When a compact touch display opened the pointer menu (`COMPACT_TOUCH_PRESENTATION_QUERY`, the same query the root presentation uses for its bottom sheet, sampled once as it opens) an `adaptive` sub-menu row MUST drill in: its rows and a leading Back row named "Back to <parent>" replace the menu's rows in the same Pointer menu surface, no flyout opens, the drilled list is a `menu` named by the row's label, and Back, Escape and ArrowLeft MUST return to the row with focus on it; a pick inside closes the whole menu. Roving focus and typeahead scope to the shown rows; sibling rows and dividers need no knowledge of it. `presentation="flyout"` keeps the flyout; `"drill-in"` drills in on any pointer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `component:DropdownMenu/DEC-2`; `architecture:interaction-modality`                                                                                                           | Proposed; verified in jsdom and Chromium (coarse pointer); owner to confirm DEC-5 |
| FR12                  | In the pointer menu ArrowDown on the last enabled row wraps to the first and ArrowUp on the first to the last; PageDown and PageUp move to the last and first fully visible enabled row and, pressed there again, one viewport further without wrapping; ArrowUp on the trigger opens with the last enabled row highlighted; the key that opened the menu and its auto-repeats do not activate; typeahead matches the row's label element alone and ignores Control/Command chords and input-method composition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Proposed in this change; `DropdownMenu.test.tsx` keyboard suite, `useListFocus.test.tsx`, `useTypeahead.test.tsx`                                                             | Proposed; verified in jsdom, pending owner review                                 |
| FR13                  | On a mouse, a nested flyout stays open while the pointer is inside the triangle from where it left its row to the flyout's near edge — including while the pointer is paused there — and closes after the existing delay once the pointer has left both the row and that triangle. The row's click toggle and its guard window are unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Proposed in this change; `DropdownMenuSubMenu.test.tsx` safe-triangle suite, `useMenuHover.test.tsx`                                                                          | Proposed; verified in jsdom, pending owner review                                 |
| FR14                  | A compound `DropdownMenuGroup` is one `role="group"` named by its heading through `aria-labelledby`; the heading carries `dropdown-menu-section-heading`, is plain text rather than a menu item, and is skipped by roving focus and typeahead. An untitled group is an unnamed `role="group"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | DEC-1, docs, and tests                                                                                                                                                        | Proposed; awaiting owner approval                                                 |
| FR15                  | With `header` or `footer`, the pointer popover is a `role="dialog"` with `aria-modal="true"`, named like the menu, holding the header, then the `role="menu"` element, then the footer; the menu element holds only its rows. The trigger says `aria-haspopup="dialog"` and its `aria-controls` names the popover that holds the dialog. A region keeps its own keys and presses: neither the menu's key handling nor its press model claims an event that begins there. The menu is one Tab stop between the regions. Tab and Shift+Tab move through the header's controls, the menu, then the footer's controls, and wrap at either end; a control that is hidden, or under a hidden ancestor within its region, is not a stop. From a row, or a row of an open sub-menu, Tab and Shift+Tab close every open flyout and continue from the menu's stop. With no other stop, focus stays in the menu. Escape closes from anywhere in the popover, and focus returns to the trigger. The bottom sheet, already a dialog, shows the header above the actions and the footer below them. Without either prop, the menu renders and behaves exactly as it does without them: no dialog, `aria-haspopup="menu"`, and Tab closes the menu. | DEC-8, DEC-10, docs, and tests                                                                                                                                                | Proposed; awaiting owner approval                                                 |
| FR16                  | `DropdownMenuCheckboxItem` MUST expose one `menuitemcheckbox` row whose `aria-checked` equals its controlled value; enabled activation reports `!value`, stays open by default, and composes consumer click and pointer-move handlers with owned activation and hover focus. Disabled activation calls no consumer activation handler.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Released subcomponent API; `architecture:public-component-api/INV5–INV8`; `DropdownMenuSelectable.test.tsx`                                                                   | Verified current behavior; consumer handlers are preserved                        |
| FR17                  | Disabled menu rows SHOULD remain keyboard-discoverable while activation stays blocked. Current shared `useListFocus` deliberately skips every `aria-disabled` row, including checkbox items.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | WAI-ARIA Menu pattern; current shared navigation source/tests                                                                                                                 | Objective mismatch; shared mechanism remains undecided in OQ1                     |
| FR20                  | With `header` or `footer` on a sub-menu (`DropdownMenuSubMenu`), its surface is a modal dialog named by its row (AR7), holding the header, the sub-menu's `role="menu"` (rows only), then the footer. It sits in a host `DropdownMenu` renders beside its menu, never inside a menu; under a root with no such host (`ContextMenu`) the sub-menu shows its rows alone. On a fine pointer the dialog is the flyout; on a compact touch display, the drilled-in view, which replaces the root's menu and regions until popped. A region keeps its own keys and presses. The rows are one Tab stop: Tab and Shift+Tab walk the header's controls, the rows, then the footer's, and wrap; from a deeper flyout, that flyout closes and the walk goes on from the rows. An open lands as for any sub-menu (FR11, FR12), not on a region. Escape in the dialog, outside an IME composition and unless a control there handled it, returns focus to the row and leaves the root open. A pointer leaving the flyout keeps it open until focus leaves, and it closes with the flyout holding its row. Without either prop nothing changes.                                                                                                    | Proposed DEC-13; FR15; AR5                                                                                                                                                    | Proposed; verified in jsdom and Chromium, pending owner review                    |

### Allowed variation

- **AV1 — Presentation.** `popover`, `bottom-sheet`, and resolved `adaptive`
  presentation may select the current pointer or touch anatomy without changing
  the ownership of either branch.
- **AV2 — Content mode.** Data-driven and compound pointer menus may vary their
  rows while preserving the current target owners. Touch presentation remains
  data-driven.
- **AV3 — Optional content.** Icons, selectable indicators, headings, dividers,
  and nested actions render only when the supplied menu content requires them.

### Representative states

| State                       | Required invariant                                                                                                              | Allowed variation                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Anchored root menu          | Trigger button and Pointer menu surface render with pointer-owned rows.                                                         | Width, placement, alignment, and optional item content vary.     |
| Anchored nested flyout      | Pointer action row opens another Pointer menu surface and may show the submenu indicator icon.                                  | Loading may replace the indicator with the current Spinner.      |
| Bottom-sheet root actions   | Trigger button opens Touch sheet frame, Touch menu surface, heading, action list, and action rows.                              | Icons, sections, dividers, and action descriptions may vary.     |
| Bottom-sheet nested actions | The same frame and list owners remain while heading and rows change to the selected action level.                               | Back control and drill-in indicator follow current navigation.   |
| Selectable pointer action   | Pointer action row may contain shared checkbox or radio chrome.                                                                 | Checked and disabled state follow the current item contracts.    |
| Custom-trigger menu         | The caller's control carries the trigger ARIA and names the menu; the Pointer menu surface is unchanged.                        | Any focusable control: icon button, chip, avatar, list row.      |
| Link row                    | The Pointer action row (or Touch action row) is the anchor; `onClick`, close and navigation run in that order on a plain click. | `target`, `rel`, icon, description and destructive variant vary. |

### Transformation and precedence order

- **ORD2 — Link row activation.** modified click → the browser alone; else
  `onClick` → close (`hasCloseOnSelect`) → the browser navigates.
  | Drilled-in sub-menu | The Pointer menu surface shows a Back row then the sub-menu's rows; the parent rows are hidden, not unmounted. | Depth; which pointer opened the menu; a forced `presentation`. |
- No other presentation-resolution, open-state, positioning, or styling
  precedence rule is introduced.

### Performance and resources

- No new loading, listener, measurement, or render constraint is introduced.

## Accessibility contract

This draft does not change DropdownMenu's trigger naming, menu and dialog
roles, keyboard navigation, item semantics, or dismissal ordering. While a
pointer is held, the highlight is DOM focus per
`module:DropdownMenu/useMenuPress` AR1. Focus return on close follows FR6 and
`architecture:interaction-modality` INV1 through the shared focus-return
visibility helper.

- **AR1 — A custom trigger still names the menu.** With `trigger`, the menu
  carries `aria-labelledby` pointing at the control's `id` (the Button path
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
  this component already ships. A `renderTrigger` control receives
  `aria-haspopup`, `aria-expanded`, `aria-controls`, and the keyboard and focus
  handlers through the spread props (FR9); the caller's control supplies its
  own `button` role and accessible name. The bottom-sheet presentation and a
  pointer menu with `header` or `footer` are outside this pattern: their
  trigger opens a dialog and says `aria-haspopup="dialog"` (AR5).
- **AR5 — With a header or footer, the pointer popover adopts the APG Dialog
  (Modal) pattern's required parts** (`spec:AST-020/FR15`): `role="dialog"`,
  `aria-modal="true"`, and an accessible name, the menu's; focus moves into
  the dialog on open, to the menu or its first enabled row as FR6 and FR12
  already state; Tab and Shift+Tab cycle within it (FR15); Escape closes it
  and focus returns to the trigger. The menu inside keeps AR1–AR3. The
  trigger keeps `aria-expanded`; its `aria-haspopup` says `dialog`, and its
  `aria-controls` names the popover that holds the dialog rather than the
  menu, as Popover's own trigger does.
- **AR6 — Checkbox rows remain one control.** The row owns
  `menuitemcheckbox`, its accessible name, checked state, focus, and activation;
  Indicator's checkbox marker is decorative. Disabled activation is inert.
  Current shared navigation skips disabled rows instead of making them
  discoverable as the WAI-ARIA Menu pattern recommends; FR17 and OQ1 retain that
  gap without inventing a component-local focus path.
- **AR7 (proposed) — A sub-menu with a header or footer adopts the same APG
  Dialog (Modal) parts for its own surface** (`spec:AST-020/FR15`):
  `role="dialog"`, `aria-modal="true"`, and an accessible name, its row's;
  focus moves into the dialog on open, to the sub-menu's first row or its
  menu as FR11 and FR12 already state; Tab and Shift+Tab cycle within it
  (FR20); Escape closes it and focus returns to the row. The sub-menu's menu
  inside keeps AR3. The row keeps `aria-expanded`; its `aria-haspopup` says
  `dialog` and its `aria-controls` names the dialog.

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
  and adaptive-presentation boundaries; this draft changes none of them.
- `architecture:layer-runtime` owns the current `usePopover` host, native
  light-dismiss reconciliation, anchor positioning, and nested `useLayer`
  flyouts. Touch presentation delegates hosting to BottomSheet.
- `family:overlay-dismissal` owns shared Escape and platform-close ordering.
  DropdownMenu root participates through its Popover focus trap; the composed
  BottomSheet and DropdownMenuSubMenu retain their recorded local-only adoption
  gaps.

## Verification map

| Contract            | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Representative states                                                                                                                                                                                                                                                                                                                    | Mutation or failure expectation                                                                                                                                                                                                                                                                                                    | Audit section                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| FR1, FR4            | `DropdownMenu.test.tsx` pointer, bottom-sheet, adaptive, section, divider, and drill-in suites                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Root pointer, nested pointer, root touch, drill-in                                                                                                                                                                                                                                                                                       | Collapsing presentation-specific parts or owners fails structure, target, or role assertions.                                                                                                                                                                                                                                      | `audit:DropdownMenu/anatomy`                   |
| FR2                 | DropdownMenu target suites, source inspection, and theming target inventories                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | All six local targets                                                                                                                                                                                                                                                                                                                    | Removing, renaming, or assigning a current target to the wrong part fails evidence or inventory.                                                                                                                                                                                                                                   | `audit:DropdownMenu/theming`                   |
| FR3                 | `DropdownMenuSelectable.test.tsx` plus BottomSheet, List, Indicator, Icon, and Divider owner tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Trigger, touch actions, icons, checkbox, radio                                                                                                                                                                                                                                                                                           | A composed part loses its owner target or is documented as a new local target.                                                                                                                                                                                                                                                     | `audit:DropdownMenu/theming`                   |
| Layer relationships | `DropdownMenu.test.tsx`, `DropdownMenuSubMenu.test.tsx`, and current layer/dismissal architecture records                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Light dismiss, nested flyout, sheet dismissal                                                                                                                                                                                                                                                                                            | Documentation claims a shared owner where current source retains local behavior, or the reverse.                                                                                                                                                                                                                                   | `audit:DropdownMenu/behavior`                  |
| FR5                 | `DropdownMenu.test.tsx` press model suite; the module record's own map                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Finger slide across rows, outside release by mouse and finger, `touch-action`, root marker                                                                                                                                                                                                                                               | A row acting on the press or the stray click, a lost `touch-action`, or a finger release that closes fails.                                                                                                                                                                                                                        | `audit:DropdownMenu/behavior`                  |
| FR6                 | `DropdownMenu.test.tsx` dismissal, closing and press model suites; `__tests__/MenuPress.a11y.chromium.spec.ts` in real Chromium                                                                                                                                                                                                                                                                                                                                                                                                                                        | keyboard/pointer dismissal, Escape after press-open, press outside on a control, pointer pick, closed menu                                                                                                                                                                                                                               | Focus left on the body after a pointer pick, on the control focused before a press-open, or a ring after pointer input, fails.                                                                                                                                                                                                     | `audit:DropdownMenu/behavior`                  |
| FR7                 | `menuMaxHeight` MUST replace the 300px term of the menu's and its popover viewport's block-size cap while the viewport gutters still bound both; the touch sheet ignores it.                                                                                                                                                                                                                                                                                                                                                                                           | `component:DropdownMenu/DEC-3`                                                                                                                                                                                                                                                                                                           | Proposed; verified in jsdom; owner to confirm DEC-3                                                                                                                                                                                                                                                                                |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Canonical anatomy and current target inventory                                                                                                                                                                                                                                                                                           | Missing, extra, prefixed, stale, or unclassified mappings fail repository validation.                                                                                                                                                                                                                                              | `audit:DropdownMenu/theming`                   |
| FR8                 | `DropdownMenu.test.tsx` press model suite (trigger cases)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Press-open + drag-release, unsettled opening release, trigger toggle, held touch, tap                                                                                                                                                                                                                                                    | A menu that does not open on a mouse press, an unsettled release that acts, or a trigger that reopens in the same gesture fails.                                                                                                                                                                                                   | `audit:DropdownMenu/behavior`                  |
| FR9                 | `DropdownMenu.test.tsx` custom trigger suite; `DropdownMenuSubMenu.test.tsx` custom-trigger Back row cases                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Icon button, chip, list row; open, toggle, keyboard open, name; drill-in Back row                                                                                                                                                                                                                                                        | A rendered control missing `aria-haspopup`, `aria-expanded` or `aria-controls`, an unnamed menu, a lost keyboard open, or a "Back to Menu" row, fails.                                                                                                                                                                             | `audit:DropdownMenu/anatomy`                   |
| AR4                 | `DropdownMenu.test.tsx` cases "has aria-haspopup and aria-expanded attributes", "keyboard open via Enter focuses the first enabled item", "walks into a mounted-open menu with ArrowDown from the focused trigger", "keyboard open via ArrowDown skips a disabled leading item", "ArrowUp on the trigger opens with the last row highlighted", and "a custom trigger opens from the keyboard and lands on the first row"; Space opening and `aria-controls` under the Menu Button accessibility contract (`internal/a11y-spec`, pending) bound to the anchored trigger | Button and `renderTrigger` controls; closed/open; Enter, Space, ArrowDown, ArrowUp open                                                                                                                                                                                                                                                  | The trigger loses its name, `aria-haspopup="menu"`, `aria-expanded` or `aria-controls`; a keyboard open lands focus somewhere other than the first (or, for ArrowUp, last) enabled row                                                                                                                                             | `audit:DropdownMenu/accessibility`             |
| FR8, AR2            | `DropdownMenu.test.tsx` "DropdownMenuItem href" suite (pointer menu and bottom sheet)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Plain click, ⌘-click, Enter with modifiers, disabled link row                                                                                                                                                                                                                                                                            | A row rendering an inner anchor, running `onClick` on a modified click, or a synthesized click dropping the modifiers fails.                                                                                                                                                                                                       | `audit:DropdownMenu/behavior`                  |
| FR12, AR3           | `DropdownMenuSubMenu.test.tsx` "drill-in on a phone" suite; `__tests__/DropdownMenuDrillIn.a11y.chromium.spec.ts` (real Chromium, coarse pointer)                                                                                                                                                                                                                                                                                                                                                                                                                      | Drill in, Back, Escape, ArrowLeft, nested level, scoped typeahead, forced presentations, close resets                                                                                                                                                                                                                                    | A flyout opening on a coarse pointer, a missing Back row, sibling rows staying in the order, or focus not returning to the row fails.                                                                                                                                                                                              | `audit:DropdownMenu/behavior`                  |
| FR10                | `DropdownMenuSubMenu.test.tsx` safe-triangle suite; `useMenuHover.test.tsx` `isPointInSafeTriangle` and click-guard suites                                                                                                                                                                                                                                                                                                                                                                                                                                             | diagonal path toward the flyout, a pause inside it, path away, click-opened and hover-opened guard windows                                                                                                                                                                                                                               | A flyout that closes while the pointer is inside the triangle or paused in it, one that never closes after leaving it, or a changed guard-window rule, fails.                                                                                                                                                                      | `audit:DropdownMenu/behavior`                  |
| FR15                | `DropdownMenu.test.tsx` header and footer suite; `__tests__/MenuHeaderFooter.a11y.chromium.spec.ts` in real Chromium                                                                                                                                                                                                                                                                                                                                                                                                                                                   | dialog role, modality, name and trigger wiring; regions outside the menu element; typing in a header field; Tab walk header → menu → footer with wrap at both ends; Tab and Shift+Tab from an open sub-menu; hidden and hidden-wrapper controls; Escape from the header; a finger tap on a footer button; bottom sheet order; no regions | A region rendered inside the menu element, a popover with regions that is not a named modal dialog, a trigger still saying `aria-haspopup="menu"` with regions, a header key taken by typeahead, a Tab that leaves the dialog or closes it, focus stranded outside the dialog, or a footer tap swallowed by the press model fails. |
| FR16                | `DropdownMenuSelectable.test.tsx`, source inspection, scoped `pr-a11y` over the `a11y/Checkbox pattern` stories, and owned Storybook states                                                                                                                                                                                                                                                                                                                                                                                                                            | checked, unchecked, disabled, caller click/pointer handlers, marker size and ownership                                                                                                                                                                                                                                                   | A dropped consumer handler, wrong checked state, nested semantic checkbox, disabled activation, or menu that closes by default fails.                                                                                                                                                                                              | `audit:DropdownMenuCheckboxItem/behavior`      |
| FR17, AR6           | Shared navigation source and DropdownMenu keyboard tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | disabled checkbox row first, middle, and last                                                                                                                                                                                                                                                                                            | Current tests prove the shared hook skips the row; no keyboard-discoverability proof exists until OQ1 is settled.                                                                                                                                                                                                                  | `audit:DropdownMenuCheckboxItem/accessibility` |
| FR20, AR7           | `DropdownMenuSubMenu.test.tsx` "header and footer" suite; `ContextMenu.test.tsx` rows-alone case; `__tests__/SubMenuHeaderFooter.a11y.chromium.spec.ts` in real Chromium (fine pointer, coarse pointer)                                                                                                                                                                                                                                                                                                                                                                | flyout and phone view; dialog role, name, row wiring; regions outside menus; Tab walk and wrap from a field, row, deeper flyout; field keys, presses; Escape, IME and handled Escapes; keyboard open; pointer leaving, focus in then out; parent closing a nested flyout; view tracking its regions; ContextMenu rows alone              | A region inside a menu element, a surface with regions that is not a named modal dialog, a row still saying `aria-haspopup="menu"`, a field key taken by the menu, a Tab that leaves or closes the dialog, a flyout closed under focus by a pointer leaving, a flyout outliving its parent, or the root menu beside a view, fails. | `audit:DropdownMenu/behavior`                  |

## Decision log

### DEC-1 — Pointer dismissal returns focus to the trigger, ring suppressed

**Reference:** `component:DropdownMenu/DEC-1`

**Decider:** `cixzhang`, 2026-10-02

The shipped behavior blurred the trigger after a pointer dismissal so Safari
would not paint a ring after a touch pick. Focus falling to the page loses a
keyboard user who reaches for the arrows next. Focus now returns to the
trigger and the shared focus-return visibility helper suppresses the ring
after pointer input (`architecture:interaction-modality` INV1), as the
bottom-sheet presentation already did. The press model's own decisions remain
in `module:DropdownMenu/useMenuPress`.

### DEC-2 — `menuMaxHeight` is a number of pixels

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

### DEC-5 — A row that goes somewhere is a link

**Reference:** `component:DropdownMenu/DEC-5`

**Decider:** vjeux, 2026-09-27 (owner confirmation pending)

A menu row whose act is navigation renders as the anchor itself, not a row with
an anchor inside, so a ⌘-click, Ctrl-click or middle click keeps the browser's
meaning and `LinkProvider` routes it; `onClick` runs before navigation on a
plain click and is skipped for a modified one, which the browser owns. The menu
still closes on a modified click — the row acted. Keyboard activation
synthesizes a click carrying the key's modifiers so ⌘-Enter opens a tab.

Rejected: an `onClick` that calls `navigate()` — loses new-tab, middle-click
and the router's prefetch; an inner anchor — two controls in one row.

## Open questions

OQ1 above remains the only open question.

## Content boundary

This file does not duplicate consumer prop tables, item examples, focus and
positioning algorithms, implementation steps, or shared modality, layer,
dismissal, and theming rules. It links to their owners.

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

### DEC-7 — A safe triangle protects the diagonal to a flyout

**Reference:** `component:DropdownMenu/DEC-7`
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

### DEC-13 (proposed) — A sub-menu's header and footer make its surface a dialog beside the menu

**Reference:** `component:DropdownMenu/DEC-13`
**Decider:** proposed by `vjeux`, 2026-10-14; pending owner review

A filter field above a sub-menu's rows, or a door below them, is a control
that is not a menu item, so DEC-8 and DEC-10 apply to the sub-menu's own
surface as they apply to the root's: the sub-menu's menu holds only its rows,
and the surface around it is a named modal dialog whose Tab order wraps. A
flyout renders inside the menu that holds its row, so a dialog there would
still sit inside that menu; the `DropdownMenu` therefore renders a host beside its menu,
inside its popover, and a sub-menu with regions renders its surface there (the
flyout layer, or the drilled-in view, which then takes the root menu's place).
Rendered there, a flyout no longer hides with the flyout that holds its row,
so it closes with it. The pointer leaving that flyout does not close it while
focus is inside, because what was typed into its field would go with it.
Rejected: regions inside the flyout beside the sub-menu's menu,
which puts them inside the parent menu; a separate DropdownMenu for the level,
which loses the row, the drill-in and the single press model; and closing the
flyout when the pointer leaves it as any flyout does.
