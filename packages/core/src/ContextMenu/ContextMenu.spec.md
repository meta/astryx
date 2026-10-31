---
schema_version: 3
template_version: 7
kind: component
id: component:ContextMenu
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [accessibility, behavior, public-api, theming]
verified_by:
  [
    packages/core/src/ContextMenu/ContextMenu.test.tsx,
    packages/core/src/ContextMenu/ContextMenu.triggerProps.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:layer-runtime,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-094, spec:AST-107]
---

# ContextMenu component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. ContextMenu takes caller `children` as the Trigger area, data-driven `items` or compound `menuContent`, `label`, `presentation`, `isDisabled`, and `triggerAs`.                                                                                  |
| Behavior                | Right-click, Shift+F10 or the Menu key, and a touch long press open a menu at the cursor (or the trigger's bottom-left from the keyboard), or a bottom sheet; rows follow DropdownMenu's rows and press model.                                                 |
| End-user impact         | People reach a region's actions by mouse, keyboard, or a held finger; a sub-menu drills in on a phone. Under a finger the menu does not grow from where it was opened or lift its trigger, and a scroll that starts outside leaves it open.                    |
| Builder impact          | Builders wrap any region, including an inline reference in prose (`triggerAs="span"`).                                                                                                                                                                         |
| Compatibility/readiness | Records shipped behavior; no API or DOM change; the released default under a finger moves as `spec:AST-094` FR25 lists, with `presentation="popover"` keeping it. The touch grow, pan dismissal, and trigger lift (FR5) are listed under Current-state impact. |
| Review checks           | Reject a trigger that gains a role or `aria-haspopup`, a menu that bypasses the shared Escape stack, a `context-menu` target moved off the painted surface, or a second open-state owner.                                                                      |
| Governing rules         | `spec:AST-107` FR8; `spec:AST-094` FR26–FR35; `module:DropdownMenu/useMenuPress`; `family:overlay-dismissal`; `architecture:component-theming-surface`; `architecture:layer-runtime`.                                                                          |

This table is a review projection; the body below is authoritative.

## Intent

ContextMenu presents actions for a caller-provided region in either a
cursor-positioned pointer menu or a BottomSheet-hosted touch action list.

## Compatibility and migration

- Released default preserved: `no` under a finger: the omitted `presentation`
  follows `spec:AST-094` FR31–FR33 (FR5); `presentation="popover"` keeps the
  released menu (`spec:AST-094` FR25)
- Compatibility class: records shipped behavior; no public prop, export, or
  DOM change
- Controlled/uncontrolled behavior: internally managed open state
- Migration decision: `spec:AST-094` FR25

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The Trigger area's context-menu invocation wiring (FR10).
- The alternative Pointer menu surface and Touch menu surface and their shared
  `context-menu` target.
- Cursor-anchor placement across the two presentation paths, and open state
  (FR10).

**Does not own / non-goals**

- Caller-provided Trigger area content.
- Pointer action-row presentation — delegated to `component:DropdownMenu`; the
  `ContextMenuItem`, `ContextMenuDivider`, and `ContextMenuGroup` exports are
  DropdownMenu's components under these names (`component:ContextMenuItem`).
- The Touch sheet frame — delegated to `component:BottomSheet`.
- Data-driven Touch action-list and row presentation — delegated to
  `component:List`.
- Shared layer lifecycle or dismissal policy.

## Public concepts

Consumer props, content modes, and presentation policy remain documented in
`ContextMenu.doc.mjs`. DEC-1 adds one component-local concept:

| Concept         | Closed values or states | Meaning                                                                                                                                            | Availability by variant/orientation/state | Default | Owner                   | Stability | Invalid-value behavior           |
| --------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------- | ----------------------- | --------- | -------------------------------- |
| Trigger element | `div`, `span`           | What the Trigger area renders as: a block, or an inline wrapper so a reference inside prose can own a context menu without breaking the text flow. | Both presentations                        | `div`   | `component:ContextMenu` | stable    | An unknown value reads as `div`. |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Basis                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| FR1  | Every render contains a caller-provided Trigger area; with `isDisabled` no invocation opens a menu and the native context menu is left alone. Pointer presentation opens a Pointer menu surface at the current local cursor anchor; touch presentation opens a Touch sheet frame containing a Touch menu surface and, for data mode, a Touch action list and Touch action rows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source, docs, and tests                                              |
| FR2  | The `context-menu` target stays on the painted Pointer menu surface and alternative Touch menu surface, not on the Trigger area or cursor anchor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `architecture:component-theming-surface`; current source                     |
| FR3  | Pointer action rows retain DropdownMenu ownership. The touch frame retains BottomSheet ownership, while data-driven touch lists and rows retain List ownership.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and owner docs                                                |
| FR4  | Compound `menuContent` remains a caller-supplied pointer-menu interior and may also render inside the touch frame; the data-driven touch path instead converts the same item data to List and ListItem presentation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source and tests                                                     |
| FR5  | The Pointer menu surface carries `data-astryx-menu-press` and follows `module:DropdownMenu/useMenuPress` FR1–FR7: the row under the release acts, the highlight follows a held pointer, a mouse released outside closes and a finger leaves the menu open, the stray click never acts, and `touch-action` follows overflow. The long press that opened the menu does not close it as it lifts; a tap outside closes it, and a mouse press outside closes it at the press. Under a finger the menu MUST grow out of where it was opened and shrink back (`spec:AST-094` FR31), MUST close as a pan that starts outside it begins (FR32), MUST hand the held finger that opened it to the menu as the opening press and, on a block trigger, lift the trigger above the page with the menu beside it, and MUST treat a pen's press outside as FR32 does (FR33). Implementation gap: it keeps the layer's own entrance and exit, a scroll that starts outside leaves it open, the opening finger is not handed to the menu so it cannot slide to a row, no trigger lift exists, and a pen press outside closes it at the press. Right-click, Shift+F10, long-press invocation, and keyboard navigation are as FR1 and FR8 state. | `module:DropdownMenu/useMenuPress`; `spec:AST-094` FR26–FR33                 |
| FR6  | With `triggerAs="span"` the Trigger area is an inline element that owns a box, so the cursor anchor measures from the trigger's own rect on every invocation path. Right-click, Shift+F10, long-press, and `context-menu` target placement all use that box.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | DEC-1                                                                        |
| FR7  | Sub-menu rows follow `component:DropdownMenu` FR11 inside the pointer menu: ContextMenu mounts the same drill-in view stack, named after its `label`, so a sub-menu drills in on a phone here too. A sub-menu with a header or footer shows its rows alone here (`component:DropdownMenu` FR20).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `component:DropdownMenu/DEC-4`                                               |
| FR8  | In the pointer menu ArrowDown on the last enabled row wraps to the first and ArrowUp on the first to the last; PageDown and PageUp page as in `component:DropdownMenu` FR12; a held key's auto-repeat does not activate; typeahead matches the row's label element alone. Arrow keys and typeahead skip disabled rows, shipped behavior that is not a requirement until `component:DropdownMenu` OQ1 is ruled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current source and tests                                                     |
| FR9  | While the Pointer menu surface is open, it participates in `family:overlay-dismissal` through the shared stack and provides descendant depth. One Escape press affects only the top-most present nested surface; ContextMenu closes only when it is that surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `family:overlay-dismissal` FR1–FR6; `ContextMenu.test.tsx` nested-layer case |
| FR10 | ContextMenu MUST be built on the public headless context menu (`spec:AST-107` FR8), with its invocation, open state, and cleanup the factory's and no behavior of its own beside the factory's. Implementation gap: no headless context menu ships; ContextMenu owns its invocation, open state, outside-press listener, and cleanup itself.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `spec:AST-107` FR8                                                           |

### Allowed variation

- **AV1 — Invocation.** Right-click, keyboard context-menu invocation, and
  long-press may open the current resolved presentation without changing
  anatomy ownership.
- **AV2 — Presentation.** `popover`, `bottom-sheet`, and resolved `adaptive`
  presentation may select the current pointer or touch anatomy.
- **AV3 — Content mode.** Data-driven pointer content renders through
  DropdownMenu helpers; compound content remains caller-composed. Data-driven
  touch content renders through List.

### Representative states

| State                 | Required invariant                                                                                  | Allowed variation                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Pointer data menu     | Trigger area opens Pointer menu surface with DropdownMenu-owned rows.                               | Cursor position, row content, width, and nested flyouts may vary.  |
| Pointer compound menu | Trigger area opens the same surface around caller-supplied menu content.                            | Caller chooses supported DropdownMenu interior components.         |
| Touch data menu       | Trigger area opens Touch sheet frame and Touch menu surface containing List-owned actions.          | Heading, sections, dividers, icons, and drill-in depth may vary.   |
| Touch compound menu   | Trigger area opens Touch sheet frame around the ContextMenu surface and caller-supplied interior.   | Caller-supplied content remains responsible for its own structure. |
| Disabled trigger      | Trigger area remains rendered and the native browser context menu is not suppressed by ContextMenu. | Caller-provided content remains unchanged.                         |

### Transformation and precedence order

- **ORD1 — Cursor anchor.** A pointer invocation anchors at the pointer,
  kept inside the trigger at its end edges; a keyboard invocation anchors at
  the trigger's bottom-left.

### Performance and resources

- **PR1 — Bounded resources.** While open, ContextMenu adds a document (and
  shadow-root) mousedown listener for outside dismissal and removes it on
  close, and the
  pointer menu observes its size and content to decide whether it scrolls. With
  `presentation="adaptive"` it subscribes to the compact-touch query while
  mounted.

## Accessibility contract

ContextMenu keeps its menu and dialog naming, keyboard invocation, long-press
path, keyboard navigation, item semantics, focus return, and presentation-specific
dismissal behavior. Pointer-menu Escape requests participate in the shared layer
stack; while a pointer is held in the pointer menu, the highlight is DOM focus per
`module:DropdownMenu/useMenuPress` AR1.

- **AR1 — An inline trigger keeps its semantics.** `triggerAs` changes the
  Trigger area's element and box only; it carries no role or `aria-haspopup`
  in any form, and the menu keeps its own name (`label`).

## Design relationships

| Anatomy or state     | Design requirement                                                                | Representation authority       | Hierarchy role    | Component contract |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------ | ----------------- | ------------------ |
| Trigger area         | Defines the caller-owned region that accepts context-menu input.                  | Caller-supplied content        | Context-dependent | FR1, FR2           |
| Pointer menu surface | Paints the menu at the current cursor anchor.                                     | Current source and public docs | Prominent         | FR1, FR2           |
| Pointer action row   | Presents an action, selectable option, or nested-menu entry through DropdownMenu. | `component:DropdownMenu`       | Prominent         | FR1, FR3, FR4      |
| Touch sheet frame    | Supplies the touch panel, scrolling area, handle, and optional scrim.             | `component:BottomSheet`        | Prominent         | FR1, FR3           |
| Touch menu surface   | Arranges ContextMenu-owned heading and content inside the sheet.                  | Current source and public docs | Prominent         | FR1, FR2           |
| Touch action list    | Groups data-driven touch actions using the spacious List presentation.            | `component:List`               | Prominent         | FR1, FR3, FR4      |
| Touch action row     | Presents one data-driven touch action or drill-in entry using ListItem.           | `component:List`               | Prominent         | FR1, FR3, FR4      |

The `context-menu` target intentionally appears on both alternative painted
menu surfaces. Trigger area content stays caller-owned and the 1px cursor
anchor is positioning infrastructure rather than consumer anatomy.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Trigger area": {
    "none": {
      "reason": "intentional: Caller-provided trigger content remains caller-owned and the ContextMenu wrapper has no public target."
    }
  },
  "Pointer menu surface": {"target": "context-menu"},
  "Pointer action row": {
    "delegatesTo": {
      "owner": "component:DropdownMenu",
      "target": "dropdown-menu-item"
    }
  },
  "Touch sheet frame": {
    "delegatesTo": {"owner": "component:BottomSheet", "target": "bottom-sheet"}
  },
  "Touch menu surface": {"target": "context-menu"},
  "Touch action list": {
    "delegatesTo": {"owner": "component:List", "target": "list"}
  },
  "Touch action row": {
    "delegatesTo": {"owner": "component:List", "target": "list-item"}
  }
}
```

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, local
  target mapping, presentation-specific rows, and delegation rules.
- `architecture:interaction-modality` owns the shared right-click, keyboard,
  long-press, pointer, touch, and adaptive-presentation boundaries.
- `architecture:layer-runtime` owns the current context-mode `useLayer` host and
  cursor-anchor positioning. ContextMenu closes the menu on an outside press itself (FR10), and joins shared Escape ordering through
  `useLayerDismissal`; touch hosting delegates
  to BottomSheet.
- `spec:AST-094` owns the touch press, lift, grow, and dismissal rules (FR5).
- `family:overlay-dismissal` owns shared Escape and platform-close ordering.
  ContextMenu's pointer presentation is a shared-stack adopter; the touch
  presentation delegates dismissal to BottomSheet, which is also a shared-stack
  owner.

## Verification map

| Contract            | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Representative states                                                             | Mutation or failure expectation                                                                                                                                                                                                                                                                                | Audit section                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| FR1, FR4            | `ContextMenu.test.tsx` rendering, invocation, bottom-sheet, adaptive, compound, and disabled cases ("renders menu with role=\"menu\"", "opens menu on right-click", "opens from a keyboard-invoked contextmenu (Shift+F10 / Menu key)", "opens on touch long-press", "opens the real menu content in a BottomSheet when requested", "uses the BottomSheet for adaptive presentation on compact touch", "renders menuContent as menu items", "does not open when isDisabled is true") | Right-click, keyboard, long press; pointer and sheet; data and compound; disabled | A missing invocation path, menu role, sheet, or compound interior, or a disabled trigger that opens, fails. Evidence gap: no test asserts that a disabled trigger leaves the native context menu alone.                                                                                                        | `audit:ContextMenu/anatomy`  |
| FR2                 | `themingTargets.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Rendered targets                                                                  | A rendered class absent from the documented targets fails. Evidence gap: no test asserts `context-menu` on either painted surface or its absence from the trigger.                                                                                                                                             | `audit:ContextMenu/theming`  |
| FR3                 | `ContextMenu.test.tsx` destructive-variant, section, divider, selectable, and alias cases                                                                                                                                                                                                                                                                                                                                                                                            | Shared rows through ContextMenu                                                   | A row that loses DropdownMenu's semantics or variant fails. Evidence gap: no test asserts the BottomSheet and List delegation beyond rendering.                                                                                                                                                                | `audit:ContextMenu/theming`  |
| FR5                 | `ContextMenu.test.tsx` "acts on the row under a finger release, once, and swallows the stray click" and outside-dismissal cases; `ContextMenuLongPress.a11y.chromium.spec.ts`                                                                                                                                                                                                                                                                                                        | Finger release; long press lift; tap, mouse, pen, and scroll outside              | A row acting on the press row, a stray click that acts, a long press that closes its own menu, or a tap or mouse press outside that leaves it open fails. Evidence gap: no test asserts the FR31 grow, the opening-finger handoff, or the FR33 lift; the scroll-outside and pen cases assert the current gaps. | `audit:ContextMenu/behavior` |
| FR6, AR1, ORD1      | `ContextMenu.test.tsx` "inline trigger (triggerAs)" and cursor-anchor cases; "does not put aria-haspopup on the role-less trigger wrapper (menus-15)"; `ContextMenu.triggerProps.test.tsx`; `ContextMenuCursorAnchor.a11y.browser.spec.ts`                                                                                                                                                                                                                                           | `span` in a paragraph; default `div`; pointer and keyboard anchors                | A block trigger in prose, a trigger with a role or `aria-haspopup`, or an anchor outside the trigger fails.                                                                                                                                                                                                    | `audit:ContextMenu/behavior` |
| FR7                 | `ContextMenu.test.tsx` "drills into nested data items inside the BottomSheet", "renders a submenu from a nested items array and keyboard-reaches an item after it", and "shows a sub-menu with a header or footer as its rows alone, and says why in development"                                                                                                                                                                                                                    | Sheet drill-in; pointer sub-menu; regions under ContextMenu                       | A missing sub-menu, an unreachable row after it, or a sub-menu dialog under ContextMenu fails. Evidence gap: no test here asserts the pointer drill-in on a phone.                                                                                                                                             | `audit:ContextMenu/behavior` |
| FR8                 | `ContextMenu.test.tsx` "wraps arrow navigation at the ends", typeahead cases, and "skips aria-disabled menuitemradio and menuitemcheckbox items during arrow navigation"                                                                                                                                                                                                                                                                                                             | Wrap; typeahead; disabled rows                                                    | A clamped arrow, a missing typeahead match, or a disabled row landed on fails. Evidence gap: no test asserts Page keys or auto-repeat.                                                                                                                                                                         | `audit:ContextMenu/behavior` |
| FR9                 | `ContextMenu.test.tsx` "lets a nested layer consume Escape before the context menu", "closes on Escape even when opened without auto-focus", and "ignores Escape during IME composition"                                                                                                                                                                                                                                                                                             | Nested layer; Escape; composition                                                 | A context menu that closes with its nested child, or on a composition Escape, fails.                                                                                                                                                                                                                           | `audit:ContextMenu/behavior` |
| FR10, PR1           | `ContextMenu.test.tsx` invocation and handler-composition cases ("composes the consumer context-menu handler with menu opening", "keeps component-owned opening when a consumer prevents default", "composes consumer touch handlers with long-press detection")                                                                                                                                                                                                                     | Right click, long press, keyboard                                                 | A context request that does not open the menu, or a dropped consumer handler, fails. Evidence gap: no test asserts listener cleanup on unmount; nothing tests a headless factory, which does not ship (the FR10 gap).                                                                                          | `audit:ContextMenu/behavior` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Canonical anatomy and target                                                      | Missing, extra, prefixed, stale, or unclassified mappings fail repository validation.                                                                                                                                                                                                                          | `audit:ContextMenu/theming`  |

## Current-state impact

- **No headless factory (FR10).** No headless context menu ships, so ContextMenu
  owns its invocation, open state, and outside-press listener itself, against
  `spec:AST-107` FR8.
- **Touch grow, pan dismissal, handoff, and lift (FR5).** Under a finger the
  menu keeps the layer's own entrance and exit instead of growing from where it
  was opened, a scroll that starts outside leaves it open, the held finger that
  opened it cannot slide to a row, and a block trigger is not lifted; a pen
  press outside closes it at the press. All are against `spec:AST-094` FR31,
  FR32, and FR33.

## Decision log

The press model decision lives in `module:DropdownMenu/useMenuPress`.

### DEC-1 — The trigger may be inline

**Reference:** `component:ContextMenu/DEC-1`

**Decider:** `cixzhang`, 2026-10-02

An entity reference inside running prose (a task id, a diff id) needs the three
doors of a context menu without becoming a block that breaks the paragraph.
`triggerAs` renders the Trigger area as a `span`. The default `div` and its
`position: relative` are unchanged.

Rejected: styling a block `div` as inline because it remains invalid inside a
`<p>`.

Rejected: `display: contents` because a box-less wrapper has no rect for pointer
or keyboard anchoring.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, menu examples, cursor and
long-press algorithms, implementation steps, or shared modality, layer,
dismissal, and theming rules. It links to their owners.
