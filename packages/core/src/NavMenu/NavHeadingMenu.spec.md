---
schema_version: 3
template_version: 7
kind: component
id: component:NavHeadingMenu
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
owners: [cixzhang]
review_triggers: [behavior, theming, accessibility]
verified_by:
  [
    packages/core/src/NavMenu/NavHeadingMenu.test.tsx,
    apps/storybook/stories/NavMenu.stories.tsx,
    packages/core/src/Icon/Icon.test.tsx,
    packages/core/src/Text/Text.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:navigation-destinations, family:action-groups]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:icon-resolution-and-component-slots,
    architecture:interaction-modality,
    architecture:layer-runtime,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-005/DEC-1, spec:AST-020, spec:AST-085]
---

# NavHeadingMenu component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `NavHeadingMenu` with `children`, `size` (`sm`, `md`, `lg`; default `md`), and `minWidth`; `NavHeadingMenuItem` with `label`, `description`, `icon`, `href`, `onClick`, and `isDisabled`; targets `nav-heading-menu` and `nav-heading-menu-item` with a `size` state. |
| Behavior                | A `role="menu"` list of `menuitem` rows inside a heading popover, with arrow, Home, End, typeahead, Enter, Space, and Escape support. Selecting an enabled item runs it and, where the host heading supplies a close action, closes the heading menu.                 |
| End-user impact         | Users switch products or accounts from the heading menu by pointer or keyboard; disabled rows are skipped by keyboard and typeahead.                                                                                                                                  |
| Builder impact          | None.                                                                                                                                                                                                                                                                 |
| Compatibility/readiness | Records shipped behavior; no public change. Six implementation gaps (see Current-state impact).                                                                                                                                                                       |
| Review checks           | Reject losing `menu`/`menuitem` roles to caller props, keyboard focus landing on a disabled item, or a caller `onKeyDown` that silently disables the keyboard model.                                                                                                  |
| Governing rules         | `family:navigation-destinations` FR7; `architecture:interaction-modality`; `architecture:component-theming-surface`; `architecture:layer-runtime`.                                                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

NavHeadingMenu presents selectable actions inside a SideNavHeading or
TopNavHeading popover. It owns the menu list, its keyboard model, and each
item's row. `NavMenu.doc.mjs` documents NavHeadingMenu and NavHeadingMenuItem
together, and NavHeadingMenuItem has no consumer doc of its own, so this record
covers both.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; runtime, DOM, styling,
  targets, and public API remain unchanged
- Controlled/uncontrolled behavior: not applicable
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **A disabled link item still navigates.** A disabled NavHeadingMenuItem with
  `href` keeps its link destination and does not cancel the click, so a pointer
  click navigates even though the item reports `aria-disabled` and skips its
  `onClick`. `family:navigation-destinations` FR7 has members keep their own
  disabled semantics, and `spec:AST-085` FR2 has a disabled control block
  navigation.
- **The documented composition nests two menus.** Passed as the `menu` of
  SideNavHeading or TopNavHeading, as its consumer doc directs, NavHeadingMenu's
  `role="menu"` sits directly inside the heading's own `role="menu"` wrapper.
  WAI-ARIA 1.2 allows a `menu` to own only `menuitem`-family items and groups,
  so assistive technology meets a menu nested in a menu.
- **Inside a heading, arrow keys move twice.** Inside SideNavHeading or
  TopNavHeading, the heading's own list handler also moves focus over every
  `menuitem`, so one ArrowDown moves two items, and in a two-item menu ArrowDown
  never moves focus. The APG menu pattern moves focus one item per arrow press.
- **The menu has no name of its own.** NavHeadingMenu's `menu` carries no
  accessible name unless the caller passes `aria-label`; inside a heading only
  the heading's wrapper `menu` is named. The APG menu pattern, which
  `spec:AST-020` FR15 adopts, names each menu.
- **A disabled item changes focusability.** A disabled item drops the
  `tabIndex=-1` enabled items carry: a disabled link item becomes a page tab
  stop, and a disabled action item cannot take focus at all. `spec:AST-085` FR1
  keeps a disabled control's focus order as it is when enabled.
- **Focus is shown only by fill.** An item removes the outline and marks focus
  with the hover fill; it does not use the shared focus outline that
  `architecture:interaction-modality` provides.

## Ownership boundary

**Owns**

- The Menu container, menu semantics, keyboard movement, typeahead, and current
  `nav-heading-menu` target.
- Each Item's action/link row, selection handling, size treatment, and current
  `nav-heading-menu-item` target.
- The content layout that contains either the text-rendered or caller-rendered
  label path and the optional description.

**Does not own / non-goals**

- Icon artwork and the `icon` target — delegated to `component:Icon` for values
  rendered through Icon.
- String label and description typography and their `text` target — delegated to
  `component:Text`.
- Non-string label content — owned by the caller.
- The SideNavHeading or TopNavHeading trigger, popup surface, positioning,
  dismissal lifecycle, or close-state ownership — owned by
  `component:SideNavHeading` and `component:TopNavHeading`.
- Destination acceptance and blocking — owned by
  `family:navigation-destinations`.

## Public concepts

| Concept | Closed values or states | Meaning                                                 | Availability by variant/orientation/state | Default | Owner                      | Stability | Invalid-value behavior           |
| ------- | ----------------------- | ------------------------------------------------------- | ----------------------------------------- | ------- | -------------------------- | --------- | -------------------------------- |
| Size    | `sm`, `md`, `lg`        | Menu minimum width (160, 200, 240 px) and item padding. | Menu and every item through context.      | `md`    | `component:NavHeadingMenu` | Stable    | TypeScript rejects other values. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Basis                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1 | NavHeadingMenu renders one Menu `div` carrying `role="menu"`, the current `nav-heading-menu` target with `size`, the forwarded `ref`, `data-testid`, and other DOM props; caller props cannot replace the role. `minWidth` overrides the size's minimum width.                                                                                                                                                                                                                                                                                                                                                                                                              | Current source, docs, and tests |
| FR2 | NavHeadingMenuItem renders one Item carrying `role="menuitem"` and the current `nav-heading-menu-item` target with the menu's size, as the `LinkProvider` link (else `<a>`) when `href` is supplied and a `div` otherwise. Caller props cannot replace its role, tab index, or disabled state.                                                                                                                                                                                                                                                                                                                                                                              | Current source, docs, and tests |
| FR3 | An optional Icon-rendered icon delegates to Icon's `icon` target. String labels and all descriptions render through Text's `text` target on one line; non-string labels render directly as caller-owned content.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Current source and target docs  |
| FR4 | The host heading owns the popup runtime. Where it supplies a close callback (TopNavHeading and the collapsed SideNavHeading), NavHeadingMenu calls it on Escape and on successful Item selection; an expanded SideNavHeading supplies none, so the menu stays open after a choice (`component:SideNavHeading` FR7).                                                                                                                                                                                                                                                                                                                                                         | Current source and tests        |
| FR5 | Enabled items are focusable but not tab stops. In a standalone menu, ArrowDown and ArrowUp move one enabled item and wrap; Home and End go to the first and last; typing a character moves to the matching enabled item; Enter or Space activates the focused item.                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and tests        |
| FR6 | Activating an enabled item runs its `onClick` and then the close callback; a disabled item carries `aria-disabled="true"`, MUST stay focusable outside the tab order as an enabled item is (`spec:AST-085` FR1), is skipped by keyboard movement and typeahead, and does not run `onClick` or close the menu. Implementation gap: a disabled item drops `tabIndex=-1` (Current-state impact).                                                                                                                                                                                                                                                                               | Current source and tests        |
| FR7 | A caller `onKeyDown` on the menu runs first; the keyboard model still runs unless that caller calls `preventDefault()` on an event no item handler has already cancelled; an item handler that cancels does not stop arrow navigation.                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current source and tests        |
| FR8 | In the open menu, a press (finger, pen or mouse) that lands on an enabled item and slides across the items acts on the one it lifts on, once, through that item's own activation, with the highlight following the pointer; a lift outside acts on nothing, and a mouse released outside closes the menu. The menu adopts `module:DropdownMenu/useMenuPress` for this (`family:action-groups` FR1–FR5; `module:DropdownMenu/useMenuPress` DEC-7). A press on caller content that is not an item, and a Ctrl-, Cmd- or Shift-click or a middle click on a link item, stays that content's or the browser's own, and keyboard and assistive-technology behavior is unchanged. | Current source and tests        |

### Allowed variation

- Items may render as links or callback actions and may be enabled or disabled
  without changing anatomy ownership.
- Icon may be absent. A label may take the string path rendered through Text or
  the non-string path rendered directly as caller-owned content. Item
  description may be absent and, when present, renders through Text.
- Menu size and minimum width may vary without creating separate anatomy parts
  or targets.

### Representative states

| State             | Required invariant                                                | Allowed variation                                         |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| Link Item         | Item is an anchor with menuitem semantics and its current target. | Destination, text, description, and icon may vary.        |
| Action Item       | Item is a div with menuitem semantics and its current target.     | Selection callback may vary.                              |
| Disabled Item     | Item remains present and reflects disabled semantics.             | It is skipped by keyboard navigation and typeahead.       |
| String-label Item | Text-rendered item label delegates to Text's current target.      | Label value, destination, description, and icon may vary. |
| Custom-label Item | Caller-rendered item label remains caller-owned.                  | Caller controls the non-string label content.             |
| Described Item    | Item description delegates to Text's current target.              | Description content may vary or be absent.                |

### Transformation and precedence order

- **ORD1 — Menu width.** `minWidth`, then the size's minimum width.
- **ORD2 — Keyboard.** Caller `onKeyDown`, then the menu keyboard model (FR7).

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Menu semantics.** One `menu` holds `menuitem` rows (FR1, FR2). It is
  named only by a caller `aria-label`; inside a heading, the heading names its
  own wrapper `menu`, not this one (Current-state impact).
- **AR2 — Keyboard.** FR5 and FR6.
- **AR3 — Disabled.** Disabled items are exposed as disabled and unreachable by
  keyboard movement.

## Design relationships

| Anatomy or state           | Design requirement                                                        | Representation authority       | Hierarchy role    | Component contract |
| -------------------------- | ------------------------------------------------------------------------- | ------------------------------ | ----------------- | ------------------ |
| Menu                       | Groups nav-heading actions with menu semantics and keyboard navigation.   | Current source and public docs | Prominent         | FR1, FR4           |
| Item                       | Presents one selectable action or navigation destination.                 | Current source and public docs | Prominent         | FR2                |
| Icon                       | Presents optional Icon-owned artwork before the label.                    | `component:Icon`               | Supporting        | FR3                |
| Text-rendered item label   | Presents a string label through Text's body treatment.                    | `component:Text`               | Prominent         | FR2, FR3           |
| Caller-rendered item label | Presents a non-string label directly through caller-owned content.        | Caller-supplied content        | Context-dependent | FR2, FR3           |
| Item description           | Presents optional supporting content through Text's supporting treatment. | `component:Text`               | Supporting        | FR2, FR3           |

The menu is popup content, not the popup host. SideNavHeading or TopNavHeading
owns the layer lifecycle and supplies the close callback through context.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Menu": {"target": "nav-heading-menu"},
  "Item": {"target": "nav-heading-menu-item"},
  "Icon": {
    "delegatesTo": {"owner": "component:Icon", "target": "icon"}
  },
  "Text-rendered item label": {
    "delegatesTo": {"owner": "component:Text", "target": "text"}
  },
  "Caller-rendered item label": {
    "none": {
      "reason": "intentional: Non-string label content is rendered directly and remains caller-owned"
    }
  },
  "Item description": {
    "delegatesTo": {"owner": "component:Text", "target": "text"}
  }
}
```

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, local
  target mapping, component delegation, and factual `none` dispositions.
- `architecture:icon-resolution-and-component-slots` owns Icon slot resolution;
  this record states the current Icon delegation.
- `architecture:layer-runtime` owns the shared popup host lifecycle used by the
  parent nav heading. NavHeadingMenu owns only its menu behavior and consumes the
  heading-provided close callback.
- `architecture:public-component-api` owns the stable props and subcomponent
  surface.
- `family:navigation-destinations` owns the shared accept/block result for a
  NavHeadingMenuItem `href`; `spec:AST-005/DEC-1` requires native and
  custom-router item paths to preserve that result.

## Verification map

| Contract            | Verification                                                                   | Representative states                                                        | Mutation or failure expectation                                                                                                                                                                        | Audit section                   |
| ------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| FR1, FR2            | `NavHeadingMenu.test.tsx` role, render, link, and disabled suites              | Menu with link, action, and disabled Items                                   | Removing menu/item semantics, content, or current rendering branches fails existing role, tag, attribute, and text checks.                                                                             | `audit:NavHeadingMenu/anatomy`  |
| FR3                 | NavHeadingMenuItem source inspection plus Icon and Text target metadata        | Icon, string label, caller-rendered label, and description paths             | Source proves Icon-slot delegation, conditional label rendering, and Text-wrapped description; focused tests assert string and description content but not target placement or custom-label ownership. | `audit:NavHeadingMenu/theming`  |
| FR4–FR7             | `NavHeadingMenu.test.tsx` context, keyboard, disabled, and pass-through suites | Selection, Escape, arrows, Home/End, typeahead, disabled, caller handlers    | Breaking close callback consumption, keyboard behavior, or role precedence fails focused interaction assertions.                                                                                       | `audit:NavHeadingMenu/behavior` |
| Target inventory    | Source inspection and `themingTargets.test.ts`                                 | Menu, Item, and delegated Icon targets                                       | Runtime and documented target metadata drift fails target validation.                                                                                                                                  | `audit:NavHeadingMenu/theming`  |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                  | Canonical anatomy and both current local targets                             | Missing, extra, prefixed, or stale mappings fail repository validation.                                                                                                                                | `audit:NavHeadingMenu/theming`  |
| FR8                 | `NavHeadingMenu.test.tsx` action-group suite (touch and mouse slides)          | Touch and mouse slides across items; a disabled item; undraggable link items | Removing the adoption fails the slide tests.                                                                                                                                                           | —                               |

Read from source, with no focused test yet:

- FR1: the forwarded `ref`, and the menu role winning over caller props.
- FR2: the `nav-heading-menu-item` target and the `LinkProvider` link.
- FR3.
- FR5: that enabled items are focusable but not tab stops.
- FR6: that a disabled item does not close the menu.
- FR4, FR5, and AR1 inside SideNavHeading or TopNavHeading.
- The Menu and Item target placements in the theming map.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, keyboard or layer
algorithms, implementation steps, or system rules. It links to their owners.
