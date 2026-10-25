---
schema_version: 3
template_version: 3
kind: component
id: component:ContextMenu
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [accessibility, behavior, public-api, theming]
verified_by:
  [
    packages/core/src/ContextMenu/ContextMenu.test.tsx,
    packages/core/src/DropdownMenu/DropdownMenu.test.tsx,
    packages/core/src/BottomSheet/BottomSheet.test.tsx,
    packages/core/src/List/List.test.tsx,
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
system_specs: []
---

# ContextMenu component contract

## Intent

ContextMenu presents actions for a caller-provided region in either a
cursor-positioned pointer menu or a BottomSheet-hosted touch action list. The
record describes current consumer anatomy, presentation-specific ownership, and
theming reachability.

## Compatibility and migration

- Released default: `popover`. Under a finger, `spec:AST-094` FR33's lift
  becomes the default, and `presentation="popover"` keeps the released menu
  (`spec:AST-094` FR25).
- Compatibility class: compatible behavior correction; public API, DOM shape,
  styling, and targets are preserved; the default under a finger changes as
  above
- Controlled/uncontrolled behavior: internally managed open state
- Migration decision: `spec:AST-094` FR25 (a caller that needs the released
  menu under a finger passes `presentation="popover"`)

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The Trigger area's context-menu invocation wiring.
- The alternative Pointer menu surface and Touch menu surface and their shared
  current `context-menu` target.
- Cursor-anchor placement and current open-state coordination across the two
  presentation paths.

**Does not own / non-goals**

- Caller-provided Trigger area content.
- Pointer action-row presentation — delegated to `component:DropdownMenu`.
- The Touch sheet frame — delegated to `component:BottomSheet`.
- Data-driven Touch action-list and row presentation — delegated to
  `component:List`.
- Shared layer lifecycle or dismissal policy.

## Public concepts

Consumer props, content modes, and presentation policy remain documented in
`ContextMenu.doc.mjs`. One component-local concept is added by DEC-1:

| Concept         | Closed values or states | Meaning                                                                                                                                            | Availability by variant/orientation/state | Default | Owner                   | Stability | Invalid-value behavior           |
| --------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------- | ----------------------- | --------- | -------------------------------- |
| Trigger element | `div`, `span`           | What the Trigger area renders as: a block, or an inline wrapper so a reference inside prose can own a context menu without breaking the text flow. | Both presentations                        | `div`   | `component:ContextMenu` | stable    | An unknown value reads as `div`. |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Basis                                                                        | Draft review state                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| FR1 | Every render contains a caller-provided Trigger area. Pointer presentation opens a Pointer menu surface at the current local cursor anchor; touch presentation opens a Touch sheet frame containing a Touch menu surface and, for data mode, a Touch action list and Touch action rows.                                                                                                                                                                                                                                                                                                                                                                       | Current source, docs, and tests                                              | Current behavior; verified                          |
| FR2 | The current `context-menu` target remains on the painted Pointer menu surface and alternative Touch menu surface, not on the Trigger area or cursor anchor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source, docs, and tests                                              | Current inventory; verified                         |
| FR3 | Pointer action rows retain DropdownMenu ownership. The touch frame retains BottomSheet ownership, while data-driven touch lists and rows retain List ownership.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and owner docs                                                | Current delegation; verified                        |
| FR4 | Compound `menuContent` remains a caller-supplied pointer-menu interior and may also render inside the touch frame; the data-driven touch path instead converts the same item data to List and ListItem presentation.                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source and tests                                                     | Current branches; verified                          |
| FR5 | The Pointer menu surface carries `data-astryx-menu-press` and follows `module:DropdownMenu/useMenuPress` FR1–FR7: the row under the release acts, the highlight follows a held pointer, a mouse released outside closes and a finger leaves the menu open, the stray click never acts, and `touch-action` follows overflow. Under a finger the press follows `spec:AST-094` FR26–FR28 and FR30, and the menu's grow, dismissal, long-press lift and outside press follow FR31–FR33 and FR35 (pending implementation); a mouse press outside is unchanged. Right-click, Shift+F10, long-press invocation and keyboard navigation keep their existing behavior. | `module:DropdownMenu/useMenuPress`; `ContextMenu.test.tsx` press model suite | Current module projection; verified in jsdom        |
| FR6 | With `triggerAs="span"` the Trigger area MUST be an inline element that owns a box, so the cursor anchor measures from the trigger's own rect on every invocation path. Right-click, Shift+F10, long-press, and `context-menu` target placement all use that box.                                                                                                                                                                                                                                                                                                                                                                                             | `component:ContextMenu/DEC-1`                                                | Accepted; verified in jsdom                         |
| FR7 | Sub-menu rows follow `component:DropdownMenu` FR12 inside the pointer menu: ContextMenu mounts the same drill-in view stack, named after its `label`, so a sub-menu drills in on a phone here too.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `component:DropdownMenu/DEC-2`                                               | Proposed; verified in jsdom; owner decision pending |
| FR8 | In the pointer menu ArrowDown on the last enabled row wraps to the first and ArrowUp on the first to the last; PageDown and PageUp page as in DropdownMenu FR6; a held key's auto-repeat does not activate; typeahead matches the row's label element alone.                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests; shared `useListFocus` and `useTypeahead` suites    | Proposed; verified in jsdom; owner decision pending |
| FR9 | While the Pointer menu surface is open, it participates in `family:overlay-dismissal` through the shared stack and provides descendant depth. One Escape press affects only the top-most present nested surface; ContextMenu closes only when it is that surface.                                                                                                                                                                                                                                                                                                                                                                                             | `family:overlay-dismissal` FR1–FR6; `ContextMenu.test.tsx` nested-layer case | Current family projection; verified in jsdom        |

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

- Presentation resolution, cursor positioning, long-press handling, item
  rendering, and styling keep their current precedence.

### Performance and resources

- The component introduces no separate loading, listener, measurement, or render
  constraint beyond the owners named above.

## Accessibility contract

ContextMenu keeps its menu and dialog naming, keyboard invocation, long-press
path, keyboard navigation, item semantics, focus return, and presentation-specific
dismissal behavior. Pointer-menu Escape requests participate in the shared layer
stack; while a pointer is held in the pointer menu, the highlight is DOM focus per
`module:DropdownMenu/useMenuPress` AR1.

- **AR1 — An inline trigger keeps its semantics.** `triggerAs` changes the
  Trigger area's element and box only; it carries no role or `aria-haspopup`
  (menus-15) in any form, and the menu keeps its own name (`label`).

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
  cursor-anchor positioning. ContextMenu retains local outside-click handling and
  joins shared Escape ordering through `useLayerDismissal`; touch hosting delegates
  to BottomSheet.
- `family:overlay-dismissal` owns shared Escape and platform-close ordering.
  ContextMenu's pointer presentation is a shared-stack adopter; the touch
  presentation delegates dismissal to BottomSheet, which is also a shared-stack
  owner.

## Verification map

| Contract            | Verification                                                                                      | Representative states                               | Mutation or failure expectation                                                                    | Audit section                |
| ------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------- |
| FR1, FR4            | `ContextMenu.test.tsx` pointer, long-press, bottom-sheet, adaptive, compound, and drill-in suites | Pointer data/compound and touch data/compound       | Collapsing presentation-specific parts or content owners fails structure, role, or behavior tests. | `audit:ContextMenu/anatomy`  |
| FR2                 | ContextMenu target tests, source inspection, and theming target inventories                       | Pointer and touch menu surfaces                     | Moving `context-menu` to the trigger or removing it from a painted branch fails evidence.          | `audit:ContextMenu/theming`  |
| FR3                 | ContextMenu, DropdownMenu, BottomSheet, and List owner tests                                      | Pointer rows, touch frame, touch list/rows          | A composed part loses its owner target or is documented as a new ContextMenu target.               | `audit:ContextMenu/theming`  |
| Layer relationships | `ContextMenu.test.tsx` nested-layer case and current layer/dismissal architecture records         | Outside click, Escape, nested context layers, sheet | A Pointer menu bypassing the shared stack or dismissing with its nested child fails.               | `audit:ContextMenu/behavior` |
| FR5                 | `ContextMenu.test.tsx` press model case; `module:DropdownMenu/useMenuPress` map                   | Finger slide across rows, stray click               | A row acting on the press row or the stray click fails.                                            | `audit:ContextMenu/behavior` |
| FR6                 | `ContextMenu.test.tsx` keyboard case; shared `useListFocus` and `useTypeahead` suites             | wrap at both ends                                   | Clamping arrows fail.                                                                              | `audit:ContextMenu/behavior` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                     | Canonical anatomy and current target                | Missing, extra, prefixed, stale, or unclassified mappings fail repository validation.              | `audit:ContextMenu/theming`  |
| FR6, AR1            | `ContextMenu.test.tsx` "inline trigger (triggerAs)" suite                                         | `span` in a paragraph, default `div`                | A block trigger inside prose, or a lost invocation path, fails.                                    | `audit:ContextMenu/behavior` |

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
