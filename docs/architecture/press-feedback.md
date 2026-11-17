---
schema_version: 1
template_version: 3
kind: architecture
id: architecture:press-feedback
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-11-16
owners: [cixzhang]
applies_to:
  [
    packages/core/src/utils/pressFeedback.ts,
    packages/core/src/hooks/usePressFeedback.ts,
    packages/core/src/privateAttributes/press.ts,
    packages/core/src/privateAttributes/press.stylex.ts,
    packages/core/src/privateAttributes/pressBox.stylex.ts,
    packages/core/src/privateAttributes/pressGroupItem.stylex.ts,
    packages/core/src/privateAttributes/pressHeld.stylex.ts,
    packages/core/src/privateAttributes/pressHoldsDrag.stylex.ts,
    packages/core/src/privateAttributes/menuPressLit.stylex.ts,
    packages/core/src/hooks/useGroupPressTracking.ts,
    packages/core/src/gestures/PressTracker.ts,
    packages/core/src/hooks/useMenuPress.ts,
  ]
verified_by:
  [
    packages/core/src/utils/pressFeedback.test.ts,
    packages/core/src/privateAttributes/press.test.ts,
  ]
deciding_specs: [spec:AST-094/FR5, spec:AST-094/FR11, spec:AST-094/DEC-21]
---

# Press feedback architecture

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Governing contract      | How a press looks and when it shows: `spec:AST-094` FR5, FR8, FR11, FR20 and DEC-21; `design:user-states` DR1–DR5; `design:reduced-motion` DR1–DR2; `architecture:layer-runtime` INV22; `component:Item` FR9.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| System behavior         | One press engine, the page press controller, writes the pressed state of a single press; across a group, the group and menu owners of `architecture:interaction-modality` INV13 write it. Each pressable surface uses one of three recipes: a momentary control, a row-wide target, or a cell or menu row. A press paints and does nothing else: it never changes layout, the hit area, or hit-testing. Every release fades on the theme's exit motion tokens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| End-user impact         | A person sees the same press on every Astryx surface: the same tint, the same start delay inside scrolling content, the same release fade, and the same cancel when a scroll takes the touch. A press never moves a tap target, so a tap lands where the person aims it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Builder impact          | A component picks a recipe and states it in its own record. It adds no press attribute, tracker, timer, or tint variable of its own. A press fix lands once, in the engine or the recipe, and reaches every component that uses it. No public API changes; the recipes are exports of the private press modules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Compatibility/readiness | No public API change. INV1 gap: the touch-runtime press tracker (`PressTracker`, `usePressTracker`), which `architecture:react-component-runtime` INV13 lists for press feedback timing, keeps its current direct users (Switch, Slider, the SegmentedControl lens, Lightbox), and no other component reaches it directly; ClickableCard, SelectableCard, Thumbnail, Tab, Switch, Slider and the Selector-family triggers re-declare press styles (their own press variable, scale, or state) instead of using a recipe's. INV4 gap: Switch, Slider and the SegmentedControl lens release in a fixed 200 ms, and controller controls end a press after 10 px of drift outside scrolling content. INV2 gap: no component record names its recipe, and Table cells paint no press. INV3 and INV9 gap: under a finger, a press makes a control's root the containing block, so a stretched control's tap target shrinks to the control mid-press. INV5 gap: under a mouse or a pen, most surfaces paint CSS `:active`. INV7 gap: a mouse or pen press on a nested control still paints the container in Item rows (outside a RadioList row), TreeList rows, Token, ClickableCard and SelectableCard. INV9 gap: a press beside a stretched control paints the control instead of the row. INV8 gap: Selector-family triggers scale under reduced motion. |
| Review checks           | Reject a new press attribute, tracker, timer, or tint variable outside the recipes; a press style that changes layout, the containing block, or the hit area; a fixed release duration; a container that paints for a press on a nested control that does not activate it, or a control that paints for a press on its container's own surface; and press engine code moved off first load.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Governing rules         | `spec:AST-094` FR5, FR8, FR11, FR20, FR27, DEC-14, DEC-21; `family:action-groups` FR2; `design:user-states` DR1–DR5; `design:reduced-motion` DR1–DR2; `architecture:layer-runtime` INV22; `architecture:interaction-modality` INV13; `component:Item` FR9; `component:Button` FR15 and FR17; `module:DropdownMenu/useMenuPress` FR6; `architecture:component-import-boundaries` INV10; `spec:AST-013` FR9.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Purpose

This record owns the shared press code. Component records name the recipe they
use and state only what differs for them. The rules for how a press looks and
when it shows stay in their deciding records; this record says how Core builds
them once.

## System model

The engine is the page press controller (`usePressFeedback` and
`utils/pressFeedback.ts`). It finds the innermost element marked pressable,
writes the private press attribute (`on`, then `fading`), starts the delay
timer, and ends the press on a release, a cancel, or a scroll that takes the
touch. The recipe styles paint from that attribute.

| Recipe               | Used by                                                                                                                                           | What paints                                                                                                                                                                                                                                | Start                                                                                                       | End                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1. Momentary control | Button family, Link, Switch, Tab, Token, SegmentedControl segment, TopNavItem, SideNavItem, NavItem, Selector-family triggers, Step, Calendar day | The system pressed tint on the control's own press layer. A standalone control may also scale, as its record states. Option: keeps its press through a drag (Slider thumb, SegmentedControl lens, Switch thumb; `design:user-states` DR4). | Touch-down outside scrolling content; 150 ms after touch-down inside it (`spec:AST-094` FR11).              | The lift, with the release fade. A scroll that takes the touch ends it with no fade. |
| 2. Row-wide target   | Item and ListItem, TreeList rows, CheckboxList and RadioList rows, Collapsible trigger, ClickableCard, SelectableCard, Thumbnail                  | The pressed tint on the whole row or card for a press on its own surface; a press on a nested control that does not activate the row paints only that control (INV7).                                                                      | As recipe 1.                                                                                                | As recipe 1.                                                                         |
| 3. Cell or menu row  | Menu rows, picker options, CommandPalette rows, Table cells (INV2 gap)                                                                            | The pressed tint on the row. At most one row of a menu is lit; a sliding finger moves the light (`module:DropdownMenu/useMenuPress` FR6).                                                                                                  | 150 ms after touch-down inside scrolling content; at once in a menu whose rows fit (`spec:AST-094` DEC-14). | The lift acts on the lit row. A scroll that takes the touch ends it with no fade.    |

## Boundaries and invariants

- **INV1 — One engine.** The page press controller writes the pressed state
  of a single press in Core. Across a group, the owners
  `architecture:interaction-modality` INV13 names write it: the action-group
  tracker for `family:action-groups` members, reached through
  `useGroupPressTracking`, and `module:DropdownMenu/useMenuPress` for menus
  and Selector's and MultiSelector's options. They are this record's group and
  menu profiles. A press held through a drag is a profile of the engine. No
  other code writes a pressed state, and a component adds no press attribute,
  tracker, timer, or tint variable of its own.
- **INV2 — Three recipes.** Every pressable Core surface uses one recipe from
  the table above, and its record names the recipe. The recipes are exports of
  the private press modules; they add no module and no public API.
- **INV3 — A press only paints.** A press never changes layout, an element's
  size, the containing block of a descendant, the hit area, or hit-testing. It
  never writes a caller's `::before` or `::after`. A layer anchors to its
  trigger's untransformed box (`architecture:layer-runtime` INV22).
- **INV4 — One timing source.** Every profile reads its start delay, cancel,
  and release from the engine. For a press no group or menu profile tracks, a
  control keeps its press until the pointer leaves its bounds expanded by
  UIControl's tracking margin (70 pt, measurement M-G12), and a row, card, or
  cell ends its press at the cell profile's travel, the pan hysteresis. A group
  member follows `family:action-groups` FR2, and a menu row follows
  `spec:AST-094` FR27. Inside a scroll view, a scroll that takes the touch ends
  any press (`spec:AST-094` FR20). Every release that fades plays the theme's
  exit motion tokens, with the reduced-motion treatment of
  `design:reduced-motion` DR2 (`spec:AST-094` FR5, FR8). No profile uses a
  fixed duration.
- **INV5 — Every pointer through the engine.** A mouse or pen press paints at
  once on `pointerdown` through the engine, with the same release fade as a
  finger's, in place of CSS `:active` (`spec:AST-094` DEC-21; `component:Button` FR15).
- **INV6 — The first press.** The engine's core stays on first load: it finds
  the pressable element, writes the attribute, starts the delay timer, and
  ends the press on a scroll. Optional profiles (the group slide, the menu
  scrub, a press held through a drag, a row's box hold) cost an unused page at
  most what `architecture:component-import-boundaries` INV10 allows. Nothing
  is painted into server HTML that has not hydrated (`spec:AST-013` FR9).
- **INV7 — The surface under the finger paints.** A press paints the surface
  it lands on that invokes the action, and nothing else, for every pointer. A
  press on a nested interactive element that does not activate the row or card
  paints that element only, never the row or card. A press on a row's or card's
  own surface (its padding, icon, label, own action, delegated control, or
  box) paints the row or card, never a control inside it. In a row whose root
  is a link or that carries a parent-supplied `role`, a press on a nested
  control activates the row, so the row paints (`component:Item` FR9;
  `component:CheckboxListItem` AR3).
- **INV8 — Reduced motion and disabled.** Under reduced motion no press
  scales (`design:reduced-motion` DR1). A disabled surface paints no press
  (`design:user-states` DR2). A control whose own popup is open does not scale
  (`component:Button` FR15).
- **INV9 — A stretched control.** When a caller's styles make a control's
  root static so that its `::after` covers a row (`component:Button` FR17),
  the whole row stays the tap target for the whole press. Under INV7, a press
  on the control's own box paints the control, and a press on the rest of the
  row paints the row, not the control.

## Change coupling

- A change to the engine's timing, cancel, or release changes every recipe at
  once; update this record and the evidence for each recipe together.
- A new pressable component names its recipe in its own record. A component
  that needs behavior no recipe covers amends this record before it builds.
- A component record that restates a rule here points at the recipe instead.

## Owning code

- Engine: `packages/core/src/utils/pressFeedback.ts`,
  `packages/core/src/hooks/usePressFeedback.ts`.
- Recipe styles and attribute: `packages/core/src/privateAttributes/press.ts`
  and the `press*.stylex.ts` modules beside it.
- Group and menu profiles (`architecture:interaction-modality` INV13):
  `packages/core/src/hooks/useGroupPressTracking.ts`,
  `packages/core/src/hooks/useMenuPress.ts`, with its
  `menuPressOnItems.ts` and `menuPressGesture.ts` modules
  (`module:DropdownMenu/useMenuPress`).
- Other press tracker (INV1 gap): `packages/core/src/gestures/PressTracker.ts`.

## Deciding specs

- `spec:AST-094` FR5, FR11, DEC-21: the release, the press profiles, and the
  fine-pointer profile.
- Decider: `cixzhang`, 2026-11-16 11:40 PT, the paint rule (INV7, INV9): the
  surface a press lands on that invokes the action paints, and nothing else;
  a press on a control inside a row or card paints only that control, and a
  press on the row or card paints only the row or card, for every pointer.

## Verification

| Invariant | Evidence                                                                                                                                                                        | Failure signal                                                                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV1      | Review: no new press attribute, tracker, or tint variable outside the recipe modules                                                                                            | A component writes its own pressed state                                                                                                                                                                                                      |
| INV2      | Each pressable component record names its recipe                                                                                                                                | A record restates press rules without a recipe                                                                                                                                                                                                |
| INV3      | `pressFeedback.test.ts`; a browser test that a point inside a caller's stretched target still hits during a press                                                               | A tap during a press misses its target, or layout shifts                                                                                                                                                                                      |
| INV4      | Computed release durations follow the theme's exit tokens and tempo on every recipe                                                                                             | A fixed duration, or two surfaces of one recipe and one profile that cancel the same drift differently                                                                                                                                        |
| INV5      | A mouse press test per recipe asserts the press attribute, not `:active`                                                                                                        | A mouse press paints with no shared release fade                                                                                                                                                                                              |
| INV6      | Size report: the engine core is on first load; optional profiles within INV10                                                                                                   | The engine core moves off first load, or an unused profile exceeds INV10                                                                                                                                                                      |
| INV7      | A press on a nested control in a row and in a card, for finger, pen, and mouse; a press on a nested control in a link-root or role row                                          | A press on a nested control that does not activate the container paints the container, a press on the row's own action, delegated control, or box does not paint the row, or a press that activates a link-root or role row does not paint it |
| INV8      | Reduced-motion and disabled press tests per recipe                                                                                                                              | A scale under reduced motion, or paint on a disabled surface                                                                                                                                                                                  |
| INV9      | A browser test: a point inside a caller's stretched target still hits during a press; a press on the control tints the control and a press on the rest of the row tints the row | A tap during a press misses, a press on the control paints the row, or a press on the row paints the control                                                                                                                                  |
