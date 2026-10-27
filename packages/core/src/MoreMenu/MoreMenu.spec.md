---
schema_version: 3
template_version: 7
kind: component
id: component:MoreMenu
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-26
owners: [cixzhang]
review_triggers: [theming]
verified_by:
  [
    packages/core/src/MoreMenu/MoreMenu.test.tsx,
    packages/core/src/DropdownMenu/__tests__/MenuButton.a11y.test.tsx,
    packages/core/src/DropdownMenu/__tests__/MenuButton.a11y.chromium.spec.ts,
    apps/storybook/stories/MoreMenu.stories.tsx,
    packages/core/src/DropdownMenu/DropdownMenu.test.tsx,
    packages/core/src/Button/Button.test.tsx,
    packages/core/src/Icon/Icon.test.tsx,
    packages/core/src/List/List.test.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:icon-resolution-and-component-slots,
    architecture:interaction-modality,
    architecture:layer-runtime,
  ]
contributing: []
system_specs: [spec:AST-020]
---

# MoreMenu component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `MoreMenu` with `items`, `label` (default "More options"), `variant` (`ghost`), `size` (surrounding size context, else `md`), `icon`, `isDisabled`, `placement`, `alignment`, `presentation`, `isMenuOpen`, and `onOpenChange`; target `more-menu`. |
| Behavior                | An icon-only overflow Button with a tooltip that opens a DropdownMenu of `items`; MoreMenu forwards open state, placement, alignment, and presentation to DropdownMenu and adds no menu runtime of its own.                                         |
| End-user impact         | Users find secondary actions behind one named "More options" button; keyboard users open it as an APG menu button.                                                                                                                                  |
| Builder impact          | None.                                                                                                                                                                                                                                               |
| Compatibility/readiness | Records shipped behavior; no public change. Two implementation gaps (see Current-state impact).                                                                                                                                                     |
| Review checks           | Reject moving `more-menu` onto the trigger, a parallel menu runtime, or a trigger that loses its name, `aria-haspopup`, `aria-expanded`, or `aria-controls`.                                                                                        |
| Governing rules         | `spec:AST-020` (pattern bindings); `architecture:component-theming-surface`; `architecture:layer-runtime`; `family:overlay-dismissal`.                                                                                                              |

This table is a review projection; the body below is authoritative.

## Intent

MoreMenu provides a visible icon-only overflow trigger and delegates its action
presentation to DropdownMenu. It owns the trigger's defaults, the `more-menu`
target on the composed panel, and what it forwards to DropdownMenu. Consumer
usage lives in `MoreMenu.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; runtime, DOM, styling,
  targets, and public API remain unchanged
- Controlled/uncontrolled behavior: `isMenuOpen` and `onOpenChange` pass to
  DropdownMenu unchanged
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **The bottom-sheet trigger drops the ref.** With `presentation="bottom-sheet"`,
  or `presentation="adaptive"` on a compact touch screen, DropdownMenu replaces the `ref` MoreMenu passes to the trigger, so a caller's
  ref stays empty. `architecture:public-component-api` INV8 has the ref reach
  the element the contract promises.
- **The arrow-key opening rows are advisory.** The shared menu-button binding
  runs AR1's ArrowDown and ArrowUp opening rows as advisory, so a keyboard open
  that misses the first or last row does not fail either binding lane.
  `spec:AST-020` FR9 makes an adopted expectation required.

## Ownership boundary

**Owns**

- The overflow-menu composition and its visible icon-only trigger defaults.
- The Menu surface's current `more-menu` target, which is a second class on the
  composed DropdownMenu panel.

**Does not own / non-goals**

- Trigger-button presentation — delegated to `component:Button`.
- Default semantic trigger artwork resolution — delegated to the Icon registry;
  the current artwork renders directly inside Button and does not carry Icon's
  `icon` target. Arbitrary caller-rendered trigger content remains caller-owned.
- Menu-panel lifecycle and presentation switching — owned by DropdownMenu and
  uncontracted here.
- Anchored action rows, sections, dividers, selectable indicators, and nested
  flyouts — owned by DropdownMenu and uncontracted here.
- BottomSheet action rows and lists — delegated through DropdownMenu to
  `component:List`; the touch frame remains owned by `component:BottomSheet`.
- Shared layer lifecycle or dismissal policy.

## Public concepts

No component-local concept. Action data and presentation values are
DropdownMenu's; consumer props are documented in `MoreMenu.doc.mjs`.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                    | Basis                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1 | Every render contains one icon-only Trigger button. The anchored presentation also renders one DropdownMenu-owned Menu surface; the bottom-sheet presentation renders its Menu surface only while the sheet is open. Anchored presentation uses Pointer action rows; BottomSheet presentation uses Touch action rows. The default trigger icon is the active registry's `moreHorizontal` artwork; `icon` replaces it with any React content. | Current source, docs, and tests |
| FR2 | The `more-menu` target is applied to the composed DropdownMenu panel as an additional class, before any caller `className`. It is not applied to the Trigger button.                                                                                                                                                                                                                                                                         | Current source, docs, and tests |
| FR3 | Button owns the Trigger button and the Icon registry owns default semantic trigger artwork resolution. DropdownMenu owns Pointer action rows; List owns Touch action rows rendered through DropdownMenu's BottomSheet path.                                                                                                                                                                                                                  | Current source and owner docs   |
| FR4 | MoreMenu forwards open state, placement, alignment, presentation, `xstyle`, `style`, and `data-testid` to DropdownMenu without adding a parallel menu runtime, and shows no chevron. Its default position matches DropdownMenu's.                                                                                                                                                                                                            | Current source and tests        |
| FR5 | The trigger is named by `label` (else the translated `@astryx.moreMenu.label`, "More options"), shows that name as its tooltip, uses `variant` (default `ghost`) and `size` (default from the surrounding size context, else `md`), forwards `ref` to the trigger in the anchored presentation, and honors `isDisabled`: a disabled trigger opens from no key or press.                                                                      | Current source and tests        |

### Allowed variation

- **AV1 — Trigger icon.** The default semantic three-dot icon may be replaced by
  an icon component or arbitrary React content without moving the MoreMenu target
  onto the trigger.
- **AV2 — Presentation.** DropdownMenu may resolve the current anchored or
  BottomSheet presentation while MoreMenu keeps the same trigger and Menu-surface
  ownership.
- **AV3 — Interior.** Action rows, sections, dividers, icons, selectable
  indicators, and nested actions may vary according to DropdownMenu's current
  data contract.

### Representative states

| State                  | Required invariant                                                                        | Allowed variation                                    |
| ---------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Default overflow menu  | Trigger button uses the default Icon-resolved glyph and Menu surface carries `more-menu`. | Button size, variant, placement, and alignment vary. |
| Arbitrary icon content | Trigger button remains Button-owned while caller content bypasses Icon ownership.         | Caller owns the rendered content.                    |
| Pointer presentation   | DropdownMenu owns the anchored Menu interior and Pointer action rows.                     | Rows, sections, dividers, and nested flyouts vary.   |
| Touch presentation     | DropdownMenu owns the BottomSheet-backed Menu interior; List owns Touch action rows.      | Touch rows and drill-in depth vary.                  |

### Transformation and precedence order

- **ORD1 — Trigger icon.** `icon`, then the registry's `moreHorizontal`.
- **ORD2 — Size.** `size`, then the surrounding size context, then `md`.

### Performance and resources

- No resource rule; MoreMenu adds no listener or measurement of its own.

## Accessibility contract

- **AR1 — The anchored trigger is a Menu Button.** In the anchored pointer
  presentation MoreMenu's icon-only trigger meets the APG Menu Button pattern's
  required parts: `button` role, its label as the name, `aria-haspopup="menu"`,
  `aria-expanded`, `aria-controls`, and Enter or Space opening with focus on the
  first enabled row. ArrowDown opening on the first and ArrowUp on the last
  enabled row go beyond the pattern's required set and are a named exception
  (`spec:AST-020` FR15), kept because they ship. A pointer open focuses the menu container, and the first
  ArrowDown then moves to the first row. In the bottom-sheet presentation the
  trigger opens a dialog and says `aria-haspopup="dialog"`, outside this
  pattern.

## Design relationships

| Anatomy or state                | Design requirement                                                               | Representation authority       | Hierarchy role    | Component contract |
| ------------------------------- | -------------------------------------------------------------------------------- | ------------------------------ | ----------------- | ------------------ |
| Trigger button                  | Provides the visible and discoverable entry point for secondary actions.         | `component:Button`             | Supporting        | FR1, FR3           |
| Icon-resolved trigger icon      | Draws semantic three-dot artwork from the active Icon registry.                  | Icon registry                  | Supporting        | FR1, FR3           |
| Caller-rendered trigger content | Presents arbitrary caller content supplied through the icon override.            | Caller-supplied content        | Context-dependent | FR1, FR3           |
| Menu surface                    | Adds MoreMenu's target to the composed DropdownMenu panel, not the trigger.      | Current source and public docs | Prominent         | FR1, FR2           |
| Pointer action row              | Presents an action or nested flyout trigger in the anchored presentation.        | DropdownMenu                   | Prominent         | FR1, FR3, FR4      |
| Touch action row                | Presents an action or drill-in entry through ListItem in the touch presentation. | `component:List`               | Prominent         | FR1, FR3, FR4      |

The Menu surface is the DropdownMenu panel itself. It carries both
`astryx-more-menu` and DropdownMenu's own panel target; the local class is not a
wrapper and does not retarget the trigger. DropdownMenu remains the owner of the
presentation runtime and anchored interior. Its touch path delegates action rows
to List rather than extending the pointer-row target into the BottomSheet
presentation.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Trigger button": {
    "delegatesTo": {"owner": "component:Button", "target": "button"}
  },
  "Icon-resolved trigger icon": {
    "none": {
      "reason": "unsettled: The current useIcon artwork renders directly inside Button; whether it should carry Icon's icon target needs an owner decision."
    }
  },
  "Caller-rendered trigger content": {
    "none": {
      "reason": "intentional: Arbitrary React icon content is caller-owned and receives no MoreMenu target."
    }
  },
  "Menu surface": {"target": "more-menu"},
  "Pointer action row": {
    "delegatesTo": {
      "owner": "component:DropdownMenu",
      "target": "dropdown-menu-item"
    }
  },
  "Touch action row": {
    "delegatesTo": {"owner": "component:List", "target": "list-item"}
  }
}
```

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, the local
  Menu-surface target, and composition delegation rules.
- `architecture:icon-resolution-and-component-slots` owns active-theme icon
  resolution. MoreMenu's default artwork uses that registry but currently
  bypasses Icon's painted `icon` target.
- `architecture:interaction-modality` owns the shared pointer, touch, keyboard,
  and adaptive-presentation boundaries inherited through DropdownMenu.
- `architecture:layer-runtime` owns the current DropdownMenu Popover host, native
  light-dismiss reconciliation, and BottomSheet host distinction. MoreMenu adds
  no parallel layer runtime.
- `family:overlay-dismissal` owns shared Escape and platform-close ordering and
  records MoreMenu as a shared owner through its composed DropdownMenu root;
  BottomSheet presentation retains BottomSheet's recorded local-only adoption
  gap.

## Verification map

| Contract            | Verification                                                                                                                                                                                                                                                                                  | Representative states                                                           | Mutation or failure expectation                                                                                                                           | Audit section                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR1, FR4            | `MoreMenu.test.tsx` render, pointer, bottom-sheet, and placement suites                                                                                                                                                                                                                       | Default, custom icon, pointer, touch                                            | Replacing the composition or changing forwarded behavior fails existing render/interaction tests.                                                         | `audit:MoreMenu/anatomy`       |
| FR2                 | MoreMenu target test, source inspection, and theming target inventories                                                                                                                                                                                                                       | Closed trigger and composed menu panel                                          | Moving `more-menu` onto the trigger or removing it from the panel fails target evidence.                                                                  | `audit:MoreMenu/theming`       |
| FR3                 | MoreMenu, DropdownMenu, Button, Icon, and List source/owner tests                                                                                                                                                                                                                             | Trigger, icon branches, pointer rows, touch rows                                | A composed part loses its owner target or is documented as a new MoreMenu-owned descendant.                                                               | `audit:MoreMenu/theming`       |
| FR5                 | `MoreMenu.test.tsx` label, custom-label, ref, disabled-keys, and closed-while-disabled tests                                                                                                                                                                                                  | Default and custom label; disabled                                              | A lost name, or a disabled trigger that opens, fails.                                                                                                     | `audit:MoreMenu/behavior`      |
| AR1                 | `MoreMenu.test.tsx` label, popup, and pointer-focus tests; the menu-button pattern binding `MenuButton.a11y.test.tsx` and `MenuButton.a11y.chromium.spec.ts`, which render MoreMenu states; `DropdownMenu.test.tsx` ArrowDown and ArrowUp trigger-key tests on the shared Button trigger path | Default and custom-icon triggers; closed/open; Enter, Space, ArrowDown, ArrowUp | The trigger loses its label, `aria-haspopup="menu"`, `aria-expanded` or `aria-controls`, or an Enter or Space open does not land on the first enabled row | `audit:MoreMenu/accessibility` |
| Layer relationships | `MoreMenu.test.tsx`, `DropdownMenu.test.tsx`, and current layer/dismissal records                                                                                                                                                                                                             | Light dismiss, Escape, pointer, touch                                           | Documentation gives MoreMenu a parallel runtime or misstates the current dismissal owner.                                                                 | `audit:MoreMenu/behavior`      |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                 | Canonical anatomy and current target                                            | Missing, extra, prefixed, stale, or unclassified mappings fail repository validation.                                                                     | `audit:MoreMenu/theming`       |

Read from source, with no focused test yet:

- FR1: the registry's `moreHorizontal` as the default trigger icon.
- FR2: `more-menu` coming before a caller `className`, and its absence from the
  Trigger button.
- FR4: forwarding `isMenuOpen`, `onOpenChange`, `xstyle`, and `style`, and the
  absence of a chevron.
- FR5: the tooltip, the `ghost` default, the size from the surrounding size
  context, the `md` default, and the ref reaching the trigger button.
- AR1: `aria-haspopup="dialog"` in the bottom-sheet presentation.

## Decision log

No component-local decision is recorded.

## Open questions

- **OQ1 — Should the default trigger artwork render through Icon's public
  target?** (`human-api`) The current registry lookup preserves semantic artwork
  replacement but leaves the painted glyph outside the `icon` target.

## Content boundary

This file does not duplicate consumer prop tables, DropdownMenu item examples,
icon-resolution rules, implementation steps, or shared modality, layer,
dismissal, and theming rules. It links to their owners.
