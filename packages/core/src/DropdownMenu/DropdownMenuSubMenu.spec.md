---
schema_version: 3
template_version: 7
kind: component
id: component:DropdownMenuSubMenu
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, theming, layout, testing]
verified_by:
  [
    packages/core/src/DropdownMenu/DropdownMenuSubMenu.test.tsx,
    packages/core/src/DropdownMenu/__tests__/SubMenuHeaderFooter.a11y.chromium.spec.ts,
    packages/core/src/DropdownMenu/__tests__/DropdownMenuDrillIn.a11y.chromium.spec.ts,
    packages/core/src/DropdownMenu/__tests__/DropdownMenuSubMenuAudit.a11y.chromium.spec.ts,
    apps/storybook/stories/DropdownMenuSubMenu.stories.tsx,
    apps/storybook/rtl-audit/targets.json,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:component-test-sufficiency,
    architecture:interaction-modality,
    architecture:layer-runtime,
    architecture:react-component-runtime,
  ]
contributing: []
system_specs: [spec:AST-020, spec:AST-029, spec:AST-086]
---

# DropdownMenuSubMenu component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | One `menuitem` row with a required label and children, optional icon, description, loading caret, disabled state, flyout width, presentation, header, footer, open callback, test ids, root inputs, and a ref. |
| Behavior                | The row reveals its children as a flyout beside it or as a drilled-in view led by a Back row; with a header or footer that surface is a modal dialog named by the row.                                         |
| End-user impact         | Pointer, keyboard, and touch users reach nested commands from one row; assistive technology hears the row's popup kind and expanded state, and Escape or the close arrow returns to the row.                   |
| Builder impact          | Place the row inside a DropdownMenu or ContextMenu and give it a label and rows; data-driven menus get it from a nested `items` array.                                                                         |
| Compatibility/readiness | Released subcomponent; observational draft of current behavior. Authority stays `draft` until owner approval.                                                                                                  |
| Review checks           | Reject a second keyboard owner, a lost popup state, a flyout that does not flip under RTL, a disabled row that opens, dropped caller inputs, or an open callback that misses a transition.                     |
| Governing rules         | WAI-ARIA menu pattern; `architecture:public-component-api/INV5–INV8`; `architecture:react-component-runtime/INV2`; `architecture:layer-runtime`; `spec:AST-020/FR1,FR2`; `spec:AST-086/FR8`.                   |

This table is a review projection; the body below is authoritative.

## Intent

DropdownMenuSubMenu turns one menu row into the entry point of a nested menu.
The row owns its `menuitem` semantics, popup state, caret or spinner, disabled
paint, and the surface its children render in: a flyout positioned beside the
row by the layer runtime, or a view the root menu shows in place of its own
rows. Each level owns its own roving focus, typeahead, and press model.
DropdownMenu owns the root surface, the drill-in view stack, and the surface
host that a sub-menu with a header or footer renders into.

## Compatibility and migration

- Released default preserved: yes (`isDisabled=false`, `hasSpinner=false`,
  `presentation='adaptive'`).
- Compatibility class: no public API change.
- Controlled behavior: the open state is internal; `onOpenChange` reports it.
- Migration decision: none.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- One row root with `role="menuitem"`, `aria-haspopup` (`menu`, or `dialog`
  with a header or footer), `aria-expanded`, and `aria-controls` while open.
- The flyout menu, its viewport-capped size, its keyboard handling, and its
  hover intent; the drilled-in list and its Back row.
- The header and footer regions and the modal dialog that holds them.
- Root composition of ref, supported host inputs, `className`, `style`,
  `xstyle`, and the composed `onClick`, `onKeyDown`, `onPointerMove`,
  `onMouseEnter`, and `onMouseLeave` handlers.

**Does not own / non-goals**

- The root menu surface, the drill-in view stack and its reset when the menu
  closes, and the surface host — owned by `component:DropdownMenu`.
- Leaf row behavior — owned by `component:DropdownMenuItem` and the selectable
  item contracts.
- Placement, flipping, and viewport insets — owned by
  `architecture:layer-runtime`.

## Public concepts

| Concept      | Closed values or states                          | Meaning                                                                      | Availability by variant/orientation/state | Default  | Owner                           | Stability | Invalid-value behavior                                   |
| ------------ | ------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------- | -------- | ------------------------------- | --------- | -------------------------------------------------------- |
| Presentation | flyout; drill-in; adaptive                       | Where the children render; adaptive drills in when a finger opened the menu. | Every row; drill-in needs a menu root     | adaptive | `component:DropdownMenuSubMenu` | stable    | Unknown values are rejected by the public type.          |
| Availability | enabled; disabled                                | Whether the row can open.                                                    | Every row                                 | enabled  | `component:DropdownMenuSubMenu` | stable    | A disabled row never opens.                              |
| Loading      | caret; spinner                                   | Whether the row's end shows a spinner while its rows load.                   | Every row                                 | caret    | `component:DropdownMenuSubMenu` | stable    | The row still opens; an empty flyout takes focus itself. |
| Regions      | none; header; footer; both                       | Content beside the sub-menu's menu that turns its surface into a dialog.     | Inside a DropdownMenu root                | none     | `component:DropdownMenuSubMenu` | stable    | Without a surface host the regions are not rendered.     |
| Open report  | open; close                                      | `onOpenChange` reports each transition of the row's surface.                 | Every row                                 | omitted  | `component:DropdownMenuSubMenu` | stable    | See FR6 for the recorded gap.                            |
| Root surface | ref; DOM/data/ARIA; class/style/xstyle; handlers | Extends the row root while preserving its role and popup wiring.             | Every row                                 | omitted  | public component API            | stable    | `role` and `tabIndex` are not accepted.                  |

## Behavioral and layout contract

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision.

| ID  | Candidate invariant                                                                                                                                                                                                                                                          | Basis                                                             | Draft review state                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| FR1 | The row MUST expose `role="menuitem"`, `aria-haspopup="menu"` (`"dialog"` with a header or footer), `aria-expanded` matching its surface, and `aria-controls` naming the surface while open. The surface MUST be labelled by the row.                                        | WAI-ARIA menu pattern; current source and focused tests           | verify                                                                                                   |
| FR2 | A click, Enter, Space, or the inline-end arrow (inline-start under RTL) MUST open the surface; a keyboard open MUST focus its first row. Escape or the close arrow MUST close only this level and return focus to the row. A hover MUST open a flyout after an intent delay. | WAI-ARIA menu pattern; `architecture:interaction-modality`; tests | verify                                                                                                   |
| FR3 | A flyout MUST sit beside the row on the inline-end side, flip with direction, and stay within the viewport; its block size MUST cap at the smaller of its own cap and the viewport.                                                                                          | `architecture:layer-runtime`; current source and browser evidence | verify                                                                                                   |
| FR4 | A drilled-in view MUST replace the root's rows with a Back row named after the parent menu and then this row's children; Back, Escape, and the close arrow MUST return to the row.                                                                                           | Current source and focused tests                                  | verify                                                                                                   |
| FR5 | Selecting a leaf row inside the surface MUST close every level and the root menu.                                                                                                                                                                                            | Current source, focused tests, and browser evidence               | verify                                                                                                   |
| FR6 | `onOpenChange` MUST report `true` once when the surface opens and `false` once when it closes, from the action that caused the change.                                                                                                                                       | Documented promise; `architecture:react-component-runtime/INV2`   | objective gap: a drilled-in view reset by the root menu closing reports no `false` (owner: DropdownMenu) |
| FR7 | A disabled row MUST expose `aria-disabled="true"`, render no `tabindex`, take no hover focus, open on no input, and run no caller `onClick`.                                                                                                                                 | Current source, focused tests, and browser evidence               | verify                                                                                                   |
| FR8 | With `hasSpinner` the row MUST show a decorative spinner in place of the caret and announce the busy start once the root menu shows.                                                                                                                                         | `spec:AST-086/FR8`; current source                                | verify                                                                                                   |
| FR9 | Ref, supported host attributes and handlers, `className`, `style`, and `xstyle` MUST reach or compose on the row root after the row's own behavior; the open keys and a disabled click stop before the caller's handler.                                                     | `architecture:public-component-api/INV5–INV8`; focused tests      | verify                                                                                                   |

### Allowed variation

- **AV1 — Content.** Label, icon, description, and children vary; long string
  labels truncate on one line.
- **AV2 — Size.** The row's padding follows the parent menu size.
- **AV3 — Width.** `menuWidth` sets the flyout's minimum width within the
  viewport cap.

### Representative states

| State    | Required invariant                                                    | Allowed variation                     |
| -------- | --------------------------------------------------------------------- | ------------------------------------- |
| Closed   | `aria-expanded=false`; caret or spinner at the row's end.             | Content, size, theme, and mode.       |
| Open     | `aria-expanded=true`; flyout beside the row, labelled by it.          | Pointer, keyboard, or press opening.  |
| Drilled  | Back row first, then the children, in the root's box.                 | Nested drill-in depth.                |
| Regions  | Modal dialog named by the row; Tab walks header, rows, footer, wraps. | Header or footer only.                |
| Disabled | `aria-disabled=true`, no tab stop, half opacity, no opening.          | Loading or not.                       |
| RTL      | Caret mirrors once; flyout opens toward the inline end.               | Placement flips at the viewport edge. |

### Transformation and precedence order

- **ORD1 — Click.** Disabled guard → drill-in push or flyout toggle → caller
  `onClick`.
- **ORD2 — Key.** Open keys handled and stopped → caller `onKeyDown` for any
  other key.
- **ORD3 — Leaf selection.** Leaf action → this level closes → parent levels
  close → root menu closes.

### Performance and resources

- **PR1 — Owned resources.** The row's only timers are the hover intent and a
  zero-delay focus check on blur; the flyout's overflow observation follows
  the shared menu overflow hook.

## Accessibility contract

- **AR1 — One entry row.** The row is one menu item whose popup kind and state
  are exposed through ARIA; its caret and spinner are decorative.
- **AR2 — Level-scoped keys.** Each level owns its own arrows, typeahead, and
  Escape; a deeper level's keys never act on its parent.
- **AR3 — Disabled discoverability.** Whether disabled rows stay
  keyboard-discoverable is owned by `component:DropdownMenu` (its OQ1).
- **AR4 — Focus visibility (objective gap).** Keyboard focus MUST be
  perceivable (WCAG 2.2 SC 2.4.7 and 1.4.11). The row currently paints focus
  only as the menu overlay tint with no outline, and paints nothing under
  forced colors. The remediation is a shared row-visual decision with
  `component:DropdownMenuItem` (its OQ2); this draft records the gap and does
  not settle it.

## Design relationships

| Anatomy or state | Design requirement                                            | Representation authority         | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------- | -------------------------------- | -------------- | ------------------ |
| Row              | Menu row paint, radius, and size padding; focus paint is AR4. | Current source and menu tokens   | structural     | FR1, AR4           |
| Caret / spinner  | Mirrored caret, or a decorative spinner while loading.        | Icon and Spinner owners          | supporting     | FR3, FR8           |
| Flyout           | Popover surface, low shadow, container radius, viewport caps. | Current source and layer runtime | prominent      | FR3                |
| Drilled view     | Rows inside the root's box, led by a mirrored Back row.       | Current source                   | structural     | FR4                |
| Disabled         | Half-opacity row with a default cursor.                       | Current source                   | supporting     | FR7                |

No new component-local visual decision is settled by this draft.

## Family and system relationships

- `component:DropdownMenu` owns the root surface, the drill-in stack, the
  surface host, the `dropdown-menu`, `dropdown-menu-item`, and
  `dropdown-menu-indicator-icon` target inventory, and disabled keyboard
  discoverability (its OQ1).
- `architecture:layer-runtime` owns flyout placement, flipping, and insets.
- `architecture:public-component-api` owns root input and handler composition.
- `architecture:react-component-runtime` owns callback timing.
- `spec:AST-086` owns the loading announcement.
- `spec:AST-029` keeps this observational draft separate from the audit receipt.

## Verification map

| Contract      | Verification                                                                  | Representative states               | Mutation or failure expectation                                                       | Audit section                         |
| ------------- | ----------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------- |
| FR1, FR2, AR2 | `DropdownMenuSubMenu.test.tsx` keyboard, hover, typeahead, and nesting suites | open, close, nested, loading        | A lost popup state, wrong focus target, or double-stepped level fails                 | `audit:DropdownMenuSubMenu/§1,§4,§6`  |
| FR3           | RTL D4 flyout target; exact-head LTR/RTL/narrow open frames                   | LTR, RTL, 320px                     | A flyout on the wrong side or outside the viewport fails                              | `audit:DropdownMenuSubMenu/§5,§9,§10` |
| FR4, FR5      | Drill-in and selection tests; exact-head drill-in and select frames           | drilled, nested selection           | A missing Back row or a stack that stays open fails                                   | `audit:DropdownMenuSubMenu/§4`        |
| FR6           | onOpenChange test (mutation-sensitive); browser select-frame counters         | flyout open and close               | Dropping the close report fails; the drill-in reset gap is recorded, not asserted     | `audit:DropdownMenuSubMenu/§3,§4`     |
| FR7, FR9      | Host-attribute, handler, and disabled tests; disabled-hover frames            | disabled, caller handlers, test ids | A disabled open or dropped caller input fails                                         | `audit:DropdownMenuSubMenu/§1,§3`     |
| AR4           | Exact-head keyboard-focus and forced-colors frames with rendered contrast     | Neutral/Butter focus, forced colors | Current frames record the gap; a remediation passes only with a perceivable indicator | `audit:DropdownMenuSubMenu/§1,§5`     |

## Decision log

None. This draft records current facts and introduces no product decision.

## Open questions

- **OQ1 — Which owner reports a drilled-in view's close when the root menu
  closes?** (`human-api`) The flyout reports every close through its layer, but
  the root resets the drill-in stack without telling the row, so
  `onOpenChange(false)` never runs for that close. The stack is owned by
  `component:DropdownMenu`.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit scores,
screenshot matrices, implementation steps, or root/leaf contracts. The audit
pull request owns the closed run evidence required by `spec:AST-029/FR5`.
