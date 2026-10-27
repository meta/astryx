---
schema_version: 3
template_version: 7
kind: component
id: component:TabMenu
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/core/src/TabList/TabList.test.tsx,
    apps/storybook/stories/TabList.stories.tsx,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: [design:reduced-motion]
architecture:
  [
    architecture:component-style-authoring,
    architecture:interaction-modality,
    architecture:public-component-api,
    architecture:component-theming-surface,
  ]
contributing: []
system_specs: []
---

# TabMenu component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `TabMenu` with `label` and `options` (`{value, label, icon?}`); targets `tab-menu`, `tab-menu-dropdown`, and `tab-menu-item`, plus `tab-indicator` when an option is selected.     |
| Behavior                | A TabList entry that groups several tab values behind a menu button. Its label shows the selected option, else `label`; choosing an option selects that value and closes the menu. |
| End-user impact         | Users reach overflow tab values from one entry and see which one is selected; keyboard users get APG menu-button behavior with a single tab stop inside the menu.                  |
| Builder impact          | None.                                                                                                                                                                              |
| Compatibility/readiness | Records shipped behavior; no public change. Six implementation gaps (see Current-state impact).                                                                                    |
| Review checks           | Reject options without `menuitemradio` and `aria-checked`, more than one tab stop in the open menu, or a closed menu that leaves focus stranded.                                   |
| Governing rules         | `component:TabList` (strip edge geometry); `family:overlay-dismissal`; `architecture:interaction-modality`.                                                                        |

This table is a review projection; the body below is authoritative.

## Intent

TabMenu is a TabList entry that holds several tab values in a menu. It owns its
trigger, the option menu, and how choosing an option selects a value. Consumer
usage lives in `TabMenu.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: selection is the TabList's `value`; the
  menu's open state is internal
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **A hidden label twin reserves the selected width.** The trigger's visible
  label renders a second, `aria-hidden` copy that reserves the label's selected
  weight. `architecture:component-style-authoring` INV7 has content render once
  and has CSS size or reserve it on the element that shows it.
- **Hover decoration is an element.** The trigger's hover fill is an
  `aria-hidden` span rather than a pseudo-element;
  `architecture:component-style-authoring` INV7 has decoration without a
  semantic role carried by a pseudo-element.
- **The open menu repeats the label.** The menu's heading repeats `label`,
  which the trigger also shows while no option is selected, so that text
  renders twice while the menu is open. `architecture:component-style-authoring`
  INV7 has content render once.
- **Motion under reduced motion.** The chevron's turn and the trigger and item
  color and fill transitions still animate when reduced motion is requested;
  `design:reduced-motion` DR1–DR3 allow no travel and, for a fine pointer, no
  animated property.
- **The `tab-menu` and `tab-menu-item` targets reflect no state.** The trigger
  takes selected styling and a checked option takes medium weight, but neither
  target reflects a state. `architecture:component-theming-surface` INV6 has a
  state that changes paint reflected on the owning target.
- **Selection mounts extra elements.** The trigger mounts its `tab-indicator`
  only while an option is selected, and an option mounts its check mark only
  while checked. `architecture:component-style-authoring` INV7 has states
  expressed through attributes, classes, and styles on existing elements, never
  through extra elements.

## Ownership boundary

**Owns**

- The trigger, its label and tab stop, the option menu, and selection from it
  (FR1–FR6).

**Does not own / non-goals**

- Selected value, size, and strip keyboard movement — owned by TabList and
  uncontracted here; strip edge geometry — owned by `component:TabList`.
- Popover hosting and light dismiss — owned by the shared popover and layer
  runtime; Escape ordering — owned by `family:overlay-dismissal`.

## Public concepts

No component-local concept beyond the consumer props.

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Basis                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | The trigger is a `<button>` with `aria-haspopup="menu"`, `aria-expanded`, and `aria-controls` naming the menu; its props type omits `role`, and caller props cannot set its tab index or popup attributes. It carries `tab-menu` and forwards `ref` and other DOM props.                                                                                                                                                                                                                                  | Current source and tests |
| FR2 | The trigger shows the label of the option whose value is selected, else `label`, reserving semibold width; when an option is selected it uses selected styling and shows the selected indicator. It takes part in the strip's single tab stop like a Tab (`component:Tab` FR3): it starts as the stop when one of its options is selected, and the stop moves with arrow-key focus; where the stop starts when nothing in the strip is selected, or the selected entry is disabled, is uncontracted here. | Current source and tests |
| FR3 | Clicking the trigger toggles a non-modal popover below it and, on open, focuses the first option; a caller `onClick` runs after the toggle.                                                                                                                                                                                                                                                                                                                                                               | Current source and tests |
| FR4 | The menu is a `role="menu"` named by `label`, carrying `tab-menu-dropdown`, with a presentational heading repeating `label`, then one `role="menuitemradio"` per option with `aria-checked` for the selected value, an optional icon, and a check mark when selected.                                                                                                                                                                                                                                     | Current source and tests |
| FR5 | Inside the menu one option is a tab stop, and ArrowUp, ArrowDown, Home, and End move it; ArrowLeft and ArrowRight are left to the strip; Enter, Space, or click on an option selects its value through the TabList and closes the menu; Escape and Tab close it. Closing returns focus to the trigger.                                                                                                                                                                                                    | Current source and tests |
| FR6 | The trigger and options paint the shared focus outline.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source           |

### Allowed variation

- **AV1 — Options.** Any number of options, each with an optional icon.

### Representative states

| State              | Required invariant                                                                                                                                                                                  | Allowed variation |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| No option selected | Trigger shows `label`; while another enabled entry is selected it is not the starting stop (Tab FR3); with nothing selected, or the selected entry disabled, where the stop starts is uncontracted. | —                 |
| Option selected    | Trigger shows that option's label and indicator.                                                                                                                                                    | —                 |
| Open               | Named menu; first option focused; one tab stop.                                                                                                                                                     | —                 |

### Transformation and precedence order

- **ORD1 — Trigger label.** Selected option's label, then `label`.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Menu button.** FR1 and FR5 follow the APG menu-button pattern.
- **AR2 — Radio options.** Options are `menuitemradio` with `aria-checked`.

## Design relationships

| Anatomy or state | Design requirement                                    | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Trigger          | Tab-styled button with chevron and indicator.         | Current source and public docs | Prominent      | FR2                |
| Menu             | Heading, then options with a check mark on selection. | Current source                 | Supporting     | FR4                |

`TabMenu.doc.mjs` declares no anatomy of its own, so no anatomy-theming map is
recorded.

## Family and system relationships

- TabList supplies value, size, and the strip; `component:TabList` contracts
  its edge geometry.
- `family:overlay-dismissal` owns shared Escape ordering.

## Verification map

| Contract | Verification                                                       | Representative states                             | Mutation or failure expectation              | Audit section                 |
| -------- | ------------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------- | ----------------------------- |
| FR1, FR3 | `TabList.test.tsx` TabMenu and host-attribute tests                | Closed, open                                      | Lost popup attributes fail.                  | `audit:TabMenu/accessibility` |
| FR2, FR4 | `TabList.test.tsx` TabMenu label, heading, and menuitemradio tests | Selected and unselected                           | Wrong label or missing `aria-checked` fails. | `audit:TabMenu/behavior`      |
| FR5      | `TabList.test.tsx` TabMenu keyboard navigation tests               | ArrowUp, ArrowDown, Home, End, Tab, Escape, Enter | Extra tab stops or a menu left open fails.   | `audit:TabMenu/accessibility` |

Read from source, with no focused test yet:

- FR1: the `tab-menu` target, the forwarded `ref`, and owned attributes winning
  over caller props.
- FR2: the reserved semibold width, the selected styling and indicator, and the
  trigger's part in the strip's tab stop.
- FR3: the popover's placement, focus moving to the first option on open, and
  the caller `onClick` running after the toggle.
- FR4: the `tab-menu-dropdown` and `tab-menu-item` targets, option icons, and
  the check mark.
- FR3: a second click closing the menu.
- FR5: Space selecting, the menu closing on selection, ArrowLeft and ArrowRight
  left to the strip, and focus returning to the trigger on close.
- FR6.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, or TabList strip
behavior. It links to their owners.
