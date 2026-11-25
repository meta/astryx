---
schema_version: 3
template_version: 7
kind: component
id: component:SelectableCard
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/CheckboxInput/__tests__/Checkbox.a11y.test.tsx,
    packages/core/src/CheckboxInput/__tests__/Checkbox.a11y.chromium.spec.ts,
    packages/core/src/__tests__/CardPress.a11y.chromium.spec.ts,
    packages/core/src/__tests__/FocusRingOwner.a11y.chromium.spec.ts,
    packages/core/src/__tests__/ReducedMotionPress.a11y.chromium.spec.ts,
    .github/visual-baseline/manifest.json,
    packages/core/src/SelectableCard/SelectableCard.test.tsx,
    packages/core/src/SelectableCard/SelectableCardRadio.test.tsx,
    packages/core/src/SelectableCardGroup/SelectableCardGroup.test.tsx,
    packages/core/src/SelectableCardGroup/__tests__/SelectableCardGroupRadio.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    apps/storybook/stories/SelectableCard.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
system_specs:
  [spec:AST-002, spec:AST-009, spec:AST-020, spec:AST-038, spec:AST-085]
---

# SelectableCard component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A Card that toggles a controlled `isSelected` through `onChange` (`SelectableCardProps`), or, as a `SelectableCardGroup` member identified by `value` (`SelectableCardMemberProps`), takes its selection from the group; named by a required `label`, with `isDisabled` and Card's `variant`, `elevation`, `padding`, and sizing.                                                                                                                                                                              |
| Behavior                | A visually hidden native checkbox, or a radio in a single-choice group, carries the role, name, and checked state; the whole surface toggles, and a radio only selects; selection draws an inset ring without moving layout.                                                                                                                                                                                                                                                                                   |
| End-user impact         | Screen-reader users hear a named checkbox, or a radio in a single-choice group, and its state; pointer users click anywhere on the card; disabled cards stay discoverable by keyboard.                                                                                                                                                                                                                                                                                                                         |
| Builder impact          | At the next minor, a click inside an open layer inside the card (e.g. a Tooltip or HoverCard surface) no longer reaches the caller's `onClick`; a handler that needs those presses moves to the layer content. A theme's exit duration and easing set the touch press release (FR4). In a `SelectableCardGroup`, a card takes `value` in place of `isSelected` and `onChange`.                                                                                                                                 |
| Compatibility/readiness | Additive: `value` makes the card a group member, typed by `SelectableCardMemberProps`; `SelectableCardProps` stays an interface and gains only `value?: never`. One `[breaking]` behavior change is staged for the next minor: `onClick` stops receiving clicks inside an open layer (FR2 gap). Two implementation gaps are listed under Current-state impact. FR4 gap: a mouse or pen press that starts on a nested control still paints the card. The touch press release changes (FR4, `spec:AST-094` FR5). |
| Review checks           | Reject a toggle that fires twice for one press, a disabled card that toggles or leaves the tab order, a ring that shifts layout, a nested control that toggles the card, a group member that takes its own `isSelected` or `onChange`, or a radio card that deselects itself.                                                                                                                                                                                                                                  |
| Governing rules         | `spec:AST-085/FR1,FR2,FR5,FR6`; `spec:AST-020/FR9`; `architecture:interaction-modality/INV3`; `architecture:component-theming-surface/INV6,INV14`; `architecture:public-component-api/INV5,INV6,INV7,INV8`; `component:SelectableCard/FR4` (the touch press release); `spec:AST-094/FR5` (the press release's exit tokens); `component:SelectableCard/DEC-1` (group membership by `value`); `spec:AST-002/FR15`; `spec:AST-038/FR8`.                                                                           |

This table is a review projection; the body below is authoritative.

## Intent

SelectableCard turns a Card into one selectable option. On its own or in a
multiple-choice `SelectableCardGroup`, it is a checkbox; in a single-choice
group, it is a radio. It owns the hidden input's semantics, whole-surface
toggling, and the selection ring. The caller owns a standalone card's
selection; `component:SelectableCardGroup` owns a member's.

## Compatibility and migration

- Released default preserved: `no` for the touch press release: it fades on
  the theme's exit duration and easing, as FR4 and `spec:AST-094` FR5. A
  mouse press keeps the card's desktop press timing; where any press paints
  follows FR4 for every pointer (`architecture:press-feedback` INV7).
  Otherwise `yes` until the next minor; then `no` for the caller `onClick`
  (FR2).
- Compatibility class: additive: the `value` prop and the
  `SelectableCardMemberProps` type; `SelectableCardProps` keeps its members
  and gains `value?: never`; no default or DOM changes for a standalone card;
  the touch press release is a nonbreaking behavior change; one behavior change staged as `[breaking]` for the next minor
  (`CLN-0026`): a click inside an open layer inside the card (e.g. a Tooltip
  or HoverCard surface) stops at the layer root and no longer reaches the
  caller's `onClick` (`architecture:layer-runtime` INV17). Until then the
  caller's `onClick` still runs for those clicks, during capture, so before
  the layer's own handlers.
- Controlled/uncontrolled behavior: controlled only: a standalone card
  requires `isSelected` and `onChange`; a group member takes `value`, and the
  group is controlled
- Migration decision: at the next minor, a caller `onClick` handler that
  needs presses inside an open layer moves to the layer content

Consumer migration instructions belong in consumer docs and release notes.

### CLN-0026 — A click inside an open layer no longer reaches SelectableCard's `onClick`

| Field     | Value                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id        | `CLN-0026`                                                                                                                                                                           |
| lifecycle | No deprecation: the staged `[breaking]` change for FR2 (`architecture:layer-runtime` INV17)                                                                                          |
| delta     | Remove the card root's capture-phase handler that calls the caller's `onClick` for a click that starts inside an open layer within the card; that click then stops at the layer root |
| rollback  | Restore the capture-phase handler from the final-patch baseline                                                                                                                      |
| state     | `pending` — lands in a declared minor with its `[breaking]` Changeset                                                                                                                |

## Current-state impact

- **Caller `onClick` still receives clicks inside an open layer (FR2).** A
  click inside an open layer inside the card (a Tooltip or HoverCard surface)
  reaches the caller's `onClick` from a capture-phase handler on the card
  root, so before the layer's own handlers, because the layer boundary
  (`architecture:layer-runtime` INV17) stops it before the bubble phase; its
  `stopPropagation()` does not keep the press from the layer, its
  `preventDefault()` cancels only the browser's default and not the controls
  inside the layer, and a popover the caller writes without a layer root is
  not a layer. It does not toggle. At the next minor, staged as `[breaking]` (`CLN-0026`),
  that handler is removed and callers move a handler that needs those presses
  to the layer content.
- **Disabled state not reflected on the target (FR5).** The
  `selectable-card` target carries no disabled state, so a theme cannot style it
  there, where `architecture:component-theming-surface` INV6 keeps state on the
  owning target.

## Ownership boundary

**Owns**

- The hidden native input (a checkbox, or a radio in a single-choice group),
  its name, checked state, and disabled state.
- Toggling from the card surface, the checkbox, and Enter, and suppressing
  toggles from nested interactive content.
- The selection ring, the selected border color, hover and pressed overlays,
  the delegated focus indicator, and the disabled treatment.
- The `selectable-card` target and the public `--selectable-card-ring-color`
  variable.
- As a `SelectableCardGroup` member identified by `value`: reading its
  selection, input type (`radio` in a `type="single"` group, `checkbox` in a
  `type="multiple"` group), input name, and disabled default from the group,
  and sending the group its selection requests. The group provides them
  through a private context; no context is exported.

**Does not own / non-goals**

- Card surface paint, padding, radius, elevation, and sizing — owned by
  `component:Card`.
- Group semantics, the group label, and which options are selected — owned by
  `component:SelectableCardGroup` for members and by the product callsite for
  standalone cards.
- Navigation and one-shot actions — owned by `component:ClickableCard`.

## Public concepts

| Concept     | Closed values or states        | Meaning                                                                                                | Availability by variant/orientation/state | Default                                          | Owner                      | Stability | Invalid-value behavior                                                                                                                                                       |
| ----------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------ | -------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selection   | selected; unselected           | Controlled checked state, reflected as `data-selected`; a member's comes from its group.               | Always                                    | Required standalone; from the group for a member | `component:SelectableCard` | Stable    | —                                                                                                                                                                            |
| Disabled    | enabled; disabled              | Blocks toggling while keeping the input focusable; a group's `isDisabled` disables every member.       | Always                                    | enabled                                          | `component:SelectableCard` | Stable    | —                                                                                                                                                                            |
| Variant     | Card variants; theme additions | Card paint and the matching selection ring color.                                                      | Always                                    | `default`                                        | `component:Card`           | Stable    | A theme-added variant rings in `--selectable-card-ring-color` (default `--color-accent`) and keeps its border color.                                                         |
| Group value | a string                       | Identifies the card as a `SelectableCardGroup` member; the group's `value` names the selected members. | Inside `SelectableCardGroup`              | none                                             | `component:SelectableCard` | Stable    | TypeScript rejects `isSelected` or `onChange` beside it (`spec:AST-002` FR15). Outside a group, a card with a `value` warns in development and renders unselected and inert. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Basis                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | SelectableCard renders `component:Card` with the given `variant`, `elevation`, `padding`, and sizing. The root also carries the `selectable-card` target reflecting `variant` and `selected`, and the first child is a visually hidden native `input` named by `label`: `type="checkbox"`, or `type="radio"` with the group's name for a member of a single-choice group, with `checked` equal to the effective selection. A member's input carries its `value`; a checkbox member's carries the group's form name, and a selected, enabled radio member renders a hidden input after it that submits its `value` under that name.                                                                                                                                                                                                                                                                                                                                                                                           | Current source and tests |
| FR2 | While enabled, a click on the card surface, a click or Space on the input, or Enter on the input requests one change: a standalone card calls `onChange(!isSelected)` exactly once; a member asks its group once to toggle its `value`, or, as a radio, to select it when it is unselected. A click that belongs to nested interactive content, an open Tooltip or HoverCard surface (`component:Tooltip` FR11), or selected text does not toggle. A caller `onClick` runs after the toggle for a surface click, before it for a click or Space on the input, and not at all for Enter; it also runs for clicks that do not toggle, including a click inside an open Tooltip or HoverCard surface. At the next minor, staged as `[breaking]`, a click inside an open layer stops at the layer root and the caller `onClick` no longer receives it (`architecture:layer-runtime` INV17). FR2 gap: a click inside an open layer still reaches the caller's `onClick`. A caller `onMouseUp` runs after the card's own handling. | Current source and tests |
| FR3 | Selection adds a 2px inset ring through Card's ring variable, so layout does not move, and composes with any elevation shadow. `default`, `transparent`, and `muted` ring in `--color-accent`; each palette variant rings in its `--color-border-<name>`; a theme-added variant rings in `--selectable-card-ring-color`. Selection also colors the border in the ring color where Card draws one, which is only the `default` variant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests |
| FR4 | While enabled, the surface paints the shared hover overlay under a hover-capable pointer and the pressed overlay for mouse and touch presses; a press from any pointer that starts on a nested interactive element shows no pressed paint on the card, since it does not activate the card (`architecture:press-feedback` INV7). A touch press shows at once. Under the touch presentation, its release fades on the theme's exit motion tokens (`--duration-exit`, `--ease-exit`), per `spec:AST-094` FR5; a mouse press keeps the card's desktop press styling. Keyboard focus on the hidden input shows one indicator on the card root (`architecture:interaction-modality` INV3).                                                                                                                                                                                                                                                                                                                                        | Current source and tests |
| FR5 | `isDisabled`, or the group's `isDisabled`, dims the card to half opacity, removes the card's own click and mouseup handling and the caller's `onClick` and `onMouseUp` (other caller event props still reach the root) and the hover and pressed overlays (`spec:AST-085` FR6), and keeps the input focusable with `aria-disabled="true"`; no click, Space, or Enter requests a change. The disabled state is reflected on the owning target (`architecture:component-theming-surface` INV6). Implementation gap: the `selectable-card` target reflects `variant` and `selected` but not the disabled state (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                          | Current source and tests |
| FR6 | `ref` reaches the Card root. Supported DOM, ARIA, data, and event props reach the root; `xstyle`, `className`, and `style` merge after the component's interactive styles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source and tests |

### Allowed variation

- **AV1 — Content.** Caller content, including nested controls, keeps its own
  semantics and interaction.
- **AV2 — Theme paint.** A theme may restyle `selectable-card` per `variant` and
  `selected`, and set the ring color for an added variant.

### Representative states

| State          | Required invariant                                                                                | Allowed variation |
| -------------- | ------------------------------------------------------------------------------------------------- | ----------------- |
| Unselected     | Unchecked named checkbox; no ring.                                                                | Variant.          |
| Selected       | Checked; inset ring in the variant's color, and a matching border on `default`; layout unchanged. | Elevation.        |
| Keyboard focus | Focus outline on the card root.                                                                   | —                 |
| Disabled       | Focusable checkbox with `aria-disabled`; no toggle; half opacity.                                 | Selection.        |
| Radio member   | A checked native radio in the group's named set; activating it again changes nothing.             | Variant.          |
| Nested control | Activating the nested control does not toggle the card.                                           | Control type.     |

### Transformation and precedence order

- **ORD1 — Toggle.** Disabled → nothing runs, caller `onClick` and
  `onMouseUp` included; nested interactive target or selection → no toggle,
  caller handlers still run; otherwise one change request (FR2), with a
  caller `onClick` after it for a surface click, before it for a click or
  Space on the input, and not at all for Enter.
- **ORD2 — Ring color.** Built-in variant mapping → `--selectable-card-ring-color`
  for a theme-added variant.

### Performance and resources

- **PR1 — Shared resources only.** SelectableCard installs the shared press
  controller on mount and marks its root as a press surface only while
  enabled; it adds no listener, observer, or timer of its own.

## Accessibility contract

- **AR1 — Native input.** The hidden checkbox, or the radio in a single-choice
  group, supplies the role, name, and checked state; radios that share a
  group's name are one tab stop, and the arrow keys move between them; the
  card root adds no role or tab stop of its own, except
  that a fixed-height card whose content overflows is a scroll container that
  browsers may make an unnamed tab stop (`component:Card` AR1).
- **AR2 — Delegated focus indicator.** Keyboard focus on the hidden input is
  shown on the visible card root (`architecture:interaction-modality` INV3); a
  focused nested control shows only its own outline.
- **AR3 — Focusable disabled.** A disabled card keeps its tab stop, exposes
  `aria-disabled`, and blocks every toggle path (`spec:AST-085` FR1, FR2, FR5).
- **AR4 — Persistent selection.** Selection changes the
  checked state for assistive technology and draws a ring (and, on `default`,
  a border) that persists under hover and press, which still paint their
  overlays.
- **AR5 — Pointer cancellation.** A press that slides off the card before the
  lift does not toggle it (`spec:AST-020` FR9; WCAG 2.2 2.5.2).

## Design relationships

| Anatomy or state | Design requirement                                | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Container        | Interactive card with an inset ring on selection. | Current source and docs  | Prominent      | FR1, FR3–FR5       |
| Content          | Caller content inside the card.                   | Current source and docs  | Prominent      | FR2, AV1           |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Container": {"target": "selectable-card"},
  "Content": {
    "none": {
      "reason": "intentional: caller content keeps its own styling and has no component-owned paint target"
    }
  }
}
```

## Family and system relationships

- `component:Card` supplies paint, padding, and the ring and elevation
  variables SelectableCard sets.
- `spec:AST-085` owns focusable disabled controls; AR3 records conformance.
- `spec:AST-020` FR9 excludes SelectableCard from the slide-off exception;
  AR5 applies it.
- `architecture:component-theming-surface` sets the rules the
  `selectable-card` target follows and requires a safe baseline for the
  extensible `variant`, which `--selectable-card-ring-color` satisfies.
- `component:SelectableCardGroup` owns group semantics and selection for
  members identified by `value`.
- `spec:AST-038` FR8 stops group membership at a layer boundary: a card with a
  `value` in a layer opened inside a group is not a member.

## Verification map

| Contract                              | Verification                                                                                                                         | Representative states                                                                                                                  | Mutation or failure expectation                                                                                                                                                                                                                                                              | Audit section                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1, FR2                              | `SelectableCard.test.tsx` surface, checkbox, Enter, and Space tests                                                                  | Unselected, selected                                                                                                                   | A missed toggle, a wrong `onChange` value, or a doubled toggle from Space fails. Gap: surface-click tests assert only the value, not the call count, and no test asserts the `selectable-card` target or its reflection, or the order of a caller `onClick` or `onMouseUp`.                  | `audit:SelectableCard/behavior` |
| FR3                                   | `SelectableCard.test.tsx` elevation tests; stable visual baseline `core-selectablecard--single-select`; `SelectableCard.stories.tsx` | Selected with elevation; one selected default card beside unselected ones                                                              | A lost elevation while selected fails; a changed default ring or border comes back changed for review. Gap: palette and theme-added ring colors have no automated check.                                                                                                                     | `audit:SelectableCard/theming`  |
| FR4                                   | `SelectableCard.test.tsx` touch-press test; `CardPress.a11y.chromium.spec.ts` on `core-selectablecard--single-select`                | Rest; desktop hover and mouse press; touch press                                                                                       | A hover that does not paint over rest, a mouse press that does not paint over hover, or a touch press that does not match the desktop press or fade fails. `FocusRingOwner.a11y.chromium.spec.ts` fails if a focused nested button shows other than exactly one ring.                        | `audit:SelectableCard/design`   |
| FR5, AR3                              | `SelectableCard.test.tsx` disabled tests; `Checkbox.a11y.chromium.spec.ts` `card-disabled` state                                     | Disabled click, Enter, Space                                                                                                           | A toggle while disabled, or a disabled card that leaves keyboard reach, fails. Gap: the half opacity, the removed overlays, and the missing disabled reflection on the target have no automated check.                                                                                       | `audit:SelectableCard/a11y`     |
| FR2 (nested)                          | Shared clickable-container hook tests in other components                                                                            | Card with a nested control or selected text                                                                                            | Gap: no SelectableCard test or story covers nested-control or selection suppression.                                                                                                                                                                                                         | `audit:SelectableCard/behavior` |
| Theming anatomy map                   | `scripts/check-knowledge.mjs`                                                                                                        | Consumer anatomy and current target                                                                                                    | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                | `audit:SelectableCard/theming`  |
| AR1, AR2, AR4                         | `SelectableCard.test.tsx` checkbox tests; `Checkbox.a11y.test.tsx` and `Checkbox.a11y.chromium.spec.ts` SelectableCard states        | Unchecked, checked, disabled (`card-unchecked`, `card-checked`, `card-disabled`)                                                       | A lost checkbox role or name, a wrong checked state, or a disabled card that is not exposed as unavailable or not reachable fails, including at the accessibility tree. Gap: no test asserts that the root adds no role or tab stop, the root focus outline, or the ring winning over hover. | `audit:SelectableCard/a11y`     |
| FR6, PR1                              | Source review                                                                                                                        | Ref; caller props                                                                                                                      | Gap: no test asserts ref or passthrough routing, or fails if SelectableCard adds its own listener or timer.                                                                                                                                                                                  | `audit:SelectableCard/behavior` |
| AR5                                   | `Checkbox.a11y.chromium.spec.ts` aborted-press check on the SelectableCard states                                                    | Press that slides off the card before the lift                                                                                         | A toggle after a slide-off lift fails.                                                                                                                                                                                                                                                       | `audit:SelectableCard/a11y`     |
| Group membership (FR1, FR2, FR5, AR1) | `SelectableCardRadio.test.tsx`; SelectableCardGroup's tests and `SelectableCardGroupRadio.a11y.chromium.spec.ts`                     | Radio member, checkbox member, disabled group, a member disabled on its own, `value` outside a group, a card in a layer inside a group | A radio member that deselects itself, a single-choice member that renders a checkbox, a radio set that is not one tab stop, a member that ignores the group's disabled state, or a card in a layer that joins the group fails.                                                               | `audit:SelectableCard/behavior` |

## Decision log

### DEC-1 — A card joins a SelectableCardGroup by `value`

**Reference:** `component:SelectableCard/DEC-1`
**Decider:** `cixzhang`, `2026-11-05`

A member identified by `value` takes its selection and selection requests from
its group, as a ToggleButtonGroup member does (`family:buttons` FR11).

Rejected: a separate item component that wraps the card.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
