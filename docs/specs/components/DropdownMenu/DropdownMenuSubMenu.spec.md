---
schema_version: 3
template_version: 7
kind: component
id: component:DropdownMenuSubMenu
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, theming, layout, testing]
verified_by:
  [
    packages/core/src/DropdownMenu/DropdownMenuSubMenu.test.tsx,
    packages/core/src/__tests__/BusyOwnerAnnouncement.test.tsx,
    packages/core/src/DropdownMenu/__tests__/SubMenuHeaderFooter.a11y.chromium.spec.ts,
    packages/core/src/DropdownMenu/__tests__/DropdownMenuDrillIn.a11y.chromium.spec.ts,
    packages/core/src/DropdownMenu/__tests__/DropdownMenuSubMenuAudit.a11y.chromium.spec.ts,
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
system_specs: [spec:AST-020, spec:AST-086]
---

# DropdownMenuSubMenu component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | One `menuitem` row with a required label and children, optional icon, description, loading caret, disabled state, flyout width, presentation, header, footer, open callback, test ids, root inputs, and a ref. |
| Behavior                | The row reveals its children as a flyout beside it or as a drilled-in view led by a Back row; with a header or footer that surface is a modal dialog named by the row.                                         |
| End-user impact         | Pointer, keyboard, and touch users reach nested commands from one row; assistive technology hears the row's popup kind and expanded state, and Escape or the close arrow returns to the row.                   |
| Builder impact          | Place the row inside a DropdownMenu or ContextMenu and give it a label and rows; data-driven menus get it from a nested `items` array.                                                                         |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change.                                                                                                                                                      |
| Review checks           | Reject a second keyboard owner, a lost popup state, a flyout that does not flip under RTL, a disabled row that opens, dropped caller inputs, or an open callback that misses a transition.                     |
| Governing rules         | `spec:AST-020` FR15; `architecture:public-component-api/INV5–INV8`; `architecture:react-component-runtime/INV2`; `architecture:layer-runtime`; `spec:AST-020/FR1,FR2`; `spec:AST-086/FR8`.                     |

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
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change.
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

| ID  | Invariant                                                                                                                                                                                                                                                      | Basis                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| FR1 | The row exposes `role="menuitem"`, `aria-haspopup="menu"` (`"dialog"` with a header or footer), `aria-expanded` matching its surface, and `aria-controls` naming the surface while open. The surface is labelled by the row.                                   | `spec:AST-020`; current source and tests                           |
| FR2 | A click, Enter, Space, or the inline-end arrow (inline-start under RTL) opens the surface; a keyboard open focuses its first row. Escape or the close arrow closes only this level and returns focus to the row. A hover opens a flyout after an intent delay. | `spec:AST-020`; `architecture:interaction-modality`; current tests |
| FR3 | A flyout sits beside the row on the inline-end side, flips with direction, and stays within the viewport; its block size caps at the smaller of its own cap and the viewport.                                                                                  | `architecture:layer-runtime`; current source                       |
| FR4 | A drilled-in view replaces the root's rows with a Back row named after the parent menu and then this row's children; Back, Escape, and the close arrow return to the row.                                                                                      | Current source and focused tests                                   |
| FR5 | Selecting a leaf row inside the surface closes every level and the root menu.                                                                                                                                                                                  | Current source and tests                                           |
| FR6 | `onOpenChange` MUST report `true` once when the surface opens and `false` once when it closes, from the action that caused the change. Implementation gap: a drilled-in view reset by the root menu closing reports no `false` (OQ1).                          | Documented promise; `architecture:react-component-runtime` INV2    |
| FR7 | A disabled row exposes `aria-disabled="true"`, renders no `tabindex`, takes no hover focus, opens on no input, and runs no caller `onClick`.                                                                                                                   | Current source and tests                                           |
| FR8 | With `hasSpinner` the row shows a decorative spinner in place of the caret and announces the busy start once the root menu shows.                                                                                                                              | `spec:AST-086` FR8; current source and tests                       |
| FR9 | Ref, supported host attributes and handlers, `className`, `style`, and `xstyle` reach or compose on the row root after the row's own behavior; the open keys and a disabled click stop before the caller's handler.                                            | `architecture:public-component-api` INV5–INV8; current tests       |

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
- **AR4 — Focus visibility.** Keyboard focus paints only the menu overlay
  tint, about 1.1:1 against the menu surface in the default themes, with no
  outline, and nothing under forced colors. The shared row
  treatment is `component:DropdownMenuItem` OQ2.

## Design relationships

| Anatomy or state | Design requirement                                            | Representation authority         | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------------- | -------------------------------- | -------------- | ------------------ |
| Row              | Menu row paint, radius, and size padding; focus paint is AR4. | Current source and menu tokens   | structural     | FR1, AR4           |
| Caret / spinner  | Mirrored caret, or a decorative spinner while loading.        | Icon and Spinner owners          | supporting     | FR3, FR8           |
| Flyout           | Popover surface, low shadow, container radius, viewport caps. | Current source and layer runtime | prominent      | FR3                |
| Drilled view     | Rows inside the root's box, led by a mirrored Back row.       | Current source                   | structural     | FR4                |
| Disabled         | Half-opacity row with a default cursor.                       | Current source                   | supporting     | FR7                |

No component-local visual decision is recorded.

## Family and system relationships

- `component:DropdownMenu` owns the root surface, the drill-in stack, the
  surface host, the `dropdown-menu`, `dropdown-menu-item`, and
  `dropdown-menu-indicator-icon` target inventory, and disabled keyboard
  discoverability (its OQ1).
- `architecture:layer-runtime` owns flyout placement, flipping, and insets.
- `architecture:public-component-api` owns root input and handler composition.
- `architecture:react-component-runtime` owns callback timing.
- `spec:AST-086` owns the loading announcement.

## Verification map

| Contract | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Representative states                      | Mutation or failure expectation                                                                                                                                               | Audit section                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| FR1, AR1 | `DropdownMenuSubMenu.test.tsx` "renders the trigger with aria-haspopup and collapsed aria-expanded", "names the flyout from its trigger via aria-labelledby", "the row keeps its own popup state and tab stop"; header-and-footer case "holds the header, the rows and the footer in a dialog named by the row, outside every menu"                                                                                                                                                                                          | Closed and open; with regions              | A missing `aria-haspopup`, `aria-expanded`, or row label on the surface fails. Evidence gap: no test asserts `aria-controls` while open.                                      | `audit:DropdownMenuSubMenu/semantics`     |
| FR2, AR2 | `DropdownMenuSubMenu.test.tsx` "opens the flyout on trigger click and exposes its items", "opens on ArrowRight and returns focus to the trigger on ArrowLeft", "mirrors its indicator and keyboard directions under RTL", "closes only the submenu on Escape and restores focus to the trigger", "supports first-character type-ahead within the flyout", "navigates a two-level nested submenu without double-stepping", "moves focus to the submenu trigger on hover, keeping a single highlight"; hover/click-guard cases | Click, arrows, RTL, Escape, hover, nesting | A key that does not open or close, a wrong focus target, a double-stepped level, or a reversed RTL arrow fails. Evidence gap: no test asserts Enter or Space opening the row. | `audit:DropdownMenuSubMenu/accessibility` |
| FR3      | `DropdownMenuSubMenu.test.tsx` "caps the flyout width and height to the available viewport"; `apps/storybook/rtl-audit/targets.json` DropdownMenuSubMenu entry                                                                                                                                                                                                                                                                                                                                                               | Viewport cap; RTL                          | A flyout that escapes the viewport fails. Evidence gap: no test asserts the inline-end placement or its flip.                                                                 | `audit:DropdownMenuSubMenu/layout`        |
| FR4      | `DropdownMenuSubMenu.test.tsx` drill-in cases; `DropdownMenuDrillIn.a11y.chromium.spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                   | Drilled view; Back                         | A missing Back row or a Back that does not return fails.                                                                                                                      | `audit:DropdownMenuSubMenu/behavior`      |
| FR5      | `DropdownMenuSubMenu.test.tsx` "closes the whole menu after selecting a nested item" and "activates a nested item with the Enter key and closes the menu"                                                                                                                                                                                                                                                                                                                                                                    | Pointer and Enter                          | A level left open after a leaf pick fails.                                                                                                                                    | `audit:DropdownMenuSubMenu/behavior`      |
| FR6      | `DropdownMenuSubMenu.test.tsx` "reports each flyout open and close to onOpenChange once"                                                                                                                                                                                                                                                                                                                                                                                                                                     | Flyout open and close                      | A missing or repeated report fails. Evidence gap: the drill-in reset gap is not asserted.                                                                                     | `audit:DropdownMenuSubMenu/behavior`      |
| FR7, FR9 | `DropdownMenuSubMenu.test.tsx` "does not open a disabled submenu", "a disabled row does not pass a click on to the caller's onClick", host-attribute and ref cases ("aria-\*, data-\* and id reach the trigger row, and the flyout stays labelled by it", "a ref reaches the trigger row", "a caller's handlers run after the row's own, and the row still opens and takes the hover focus")                                                                                                                                 | Disabled; caller handlers and attributes   | A disabled open or caller click, or a dropped attribute, ref, or handler, fails. Evidence gap: no test asserts `className`, `style`, or `xstyle` on the row.                  | `audit:DropdownMenuSubMenu/api`           |
| FR8      | `BusyOwnerAnnouncement.test.tsx` "DropdownMenuSubMenu loading state" cases; `DropdownMenuSubMenu.test.tsx` loading-flyout cases                                                                                                                                                                                                                                                                                                                                                                                              | Loading closed and open                    | A busy start announced while closed, twice, or not at all, or an announced Spinner, fails.                                                                                    | `audit:DropdownMenuSubMenu/accessibility` |
| AR4, PR1 | Evidence gap: no test asserts the focus paint, forced-colors focus, or the timer bounds                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                          | —                                                                                                                                                                             | `audit:DropdownMenuSubMenu/visual`        |

## Current-state impact

- **Drill-in close report (FR6).** When the root menu closes a drilled-in view,
  `onOpenChange(false)` does not run (OQ1).
- **Focus visibility (AR4).** Keyboard focus on the row shows only an
  overlay tint about 1.1:1 against the menu surface, and no indicator in
  forced-colors mode; the shared row treatment is
  `component:DropdownMenuItem` OQ2.

## Decision log

No component-local decision.

## Open questions

- **OQ1 — Which owner reports a drilled-in view's close when the root menu
  closes?** (`human-api`) The flyout reports every close through its layer, but
  the root resets the drill-in stack without telling the row, so
  `onOpenChange(false)` never runs for that close. The stack is owned by
  `component:DropdownMenu`.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit scores,
screenshot matrices, implementation steps, or root/leaf contracts. It links to their owners.
