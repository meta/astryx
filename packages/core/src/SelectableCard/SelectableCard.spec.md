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
    .github/visual-baseline/manifest.json,
    packages/core/src/SelectableCard/SelectableCard.test.tsx,
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
system_specs: [spec:AST-009, spec:AST-020, spec:AST-085]
---

# SelectableCard component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | A Card that toggles a controlled `isSelected` through `onChange`, named by a required `label`, with `isDisabled` and Card's `variant`, `elevation`, `padding`, and sizing.                                  |
| Behavior                | A visually hidden native checkbox carries the role, name, and checked state; the whole surface toggles; selection draws an inset ring without moving layout.                                                |
| End-user impact         | Screen-reader users hear a named checkbox and its state; pointer users click anywhere on the card; disabled cards stay discoverable by keyboard.                                                            |
| Builder impact          | None; the record describes shipped behavior.                                                                                                                                                                |
| Compatibility/readiness | Released behavior recorded as current; no API, default, or output changes. Two implementation gaps are listed under Current-state impact.                                                                   |
| Review checks           | Reject a toggle that fires twice for one press, a disabled card that toggles or leaves the tab order, a ring that shifts layout, or a nested control that toggles the card.                                 |
| Governing rules         | `spec:AST-085/FR1,FR2,FR5,FR6`; `spec:AST-020/FR9`; `architecture:interaction-modality/INV3`; `architecture:component-theming-surface/INV6,INV14`; `architecture:public-component-api/INV5,INV6,INV7,INV8`. |

This table is a review projection; the body below is authoritative.

## Intent

SelectableCard turns a Card into one checkbox option for multi-select card
groups; each card is a checkbox, so single-select groups are out of scope. It owns the hidden checkbox semantics, whole-surface
toggling, and the selection ring; the caller owns the selection state.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default, DOM,
  or styling output changes
- Controlled/uncontrolled behavior: controlled only; `isSelected` and
  `onChange` are required
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Two focus indicators on nested controls (FR4, AR2).** The card draws its
  outline whenever any descendant has `:focus-visible`, so focusing a nested
  control shows the card outline and the control's own, where
  `architecture:interaction-modality` INV3 allows one indicator per focus move.
- **Disabled state not reflected on the target (FR5).** The
  `selectable-card` target carries no disabled state, so a theme cannot style it
  there, where `architecture:component-theming-surface` INV6 keeps state on the
  owning target.

## Ownership boundary

**Owns**

- The hidden native checkbox, its name, checked state, and disabled state.
- Toggling from the card surface, the checkbox, and Enter, and suppressing
  toggles from nested interactive content.
- The selection ring, the selected border color, hover and pressed overlays,
  the delegated focus indicator, and the disabled treatment.
- The `selectable-card` target and the public `--selectable-card-ring-color`
  variable.

**Does not own / non-goals**

- Card surface paint, padding, radius, elevation, and sizing — owned by
  `component:Card`.
- Group semantics and which options are selected — owned by the product
  callsite. Single-select groups need a radio pattern, which SelectableCard
  does not provide.
- Navigation and one-shot actions — owned by `component:ClickableCard`.

## Public concepts

| Concept   | Closed values or states        | Meaning                                                 | Availability by variant/orientation/state | Default   | Owner                      | Stability | Invalid-value behavior                                                                                               |
| --------- | ------------------------------ | ------------------------------------------------------- | ----------------------------------------- | --------- | -------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| Selection | selected; unselected           | Controlled checked state, reflected as `data-selected`. | Always                                    | Required  | `component:SelectableCard` | Stable    | —                                                                                                                    |
| Disabled  | enabled; disabled              | Blocks toggling while keeping the checkbox focusable.   | Always                                    | enabled   | `component:SelectableCard` | Stable    | —                                                                                                                    |
| Variant   | Card variants; theme additions | Card paint and the matching selection ring color.       | Always                                    | `default` | `component:Card`           | Stable    | A theme-added variant rings in `--selectable-card-ring-color` (default `--color-accent`) and keeps its border color. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1 | SelectableCard renders `component:Card` with the given `variant`, `elevation`, `padding`, and sizing. The root also carries the `selectable-card` target reflecting `variant` and `selected`, and the first child is a visually hidden native `input type="checkbox"` named by `label` with `checked` equal to `isSelected`.                                                                                                                                                                                                                                                                            | Current source and tests |
| FR2 | While enabled, a click on the card surface, a click or Space on the checkbox, or Enter on the checkbox calls `onChange(!isSelected)` exactly once. A click that belongs to nested interactive content or selected text does not toggle. A caller `onClick` runs after the toggle for a surface click, before it for a click or Space on the checkbox, and not at all for Enter; it also runs for clicks that do not toggle. A caller `onMouseUp` runs after the card's own handling.                                                                                                                    | Current source and tests |
| FR3 | Selection adds a 2px inset ring through Card's ring variable, so layout does not move, and composes with any elevation shadow. `default`, `transparent`, and `muted` ring in `--color-accent`; each palette variant rings in its `--color-border-<name>`; a theme-added variant rings in `--selectable-card-ring-color`. Selection also colors the border in the ring color where Card draws one, which is only the `default` variant.                                                                                                                                                                  | Current source and tests |
| FR4 | While enabled, the surface paints the shared hover overlay under a hover-capable pointer and the pressed overlay for mouse and touch presses. Keyboard focus on the hidden checkbox shows one indicator on the card root (`architecture:interaction-modality` INV3). Implementation gap: the root outlines while any descendant has `:focus-visible`, so focusing a nested control draws both the card outline and the control's own (Current-state impact).                                                                                                                                            | Current source and tests |
| FR5 | `isDisabled` dims the card to half opacity, removes the card's own click and mouseup handling and the caller's `onClick` and `onMouseUp` (other caller event props still reach the root) and the hover and pressed overlays (`spec:AST-085` FR6), and keeps the checkbox focusable with `aria-disabled="true"`; no click, Space, or Enter calls `onChange`. The disabled state is reflected on the owning target (`architecture:component-theming-surface` INV6). Implementation gap: the `selectable-card` target reflects `variant` and `selected` but not the disabled state (Current-state impact). | Current source and tests |
| FR6 | `ref` reaches the Card root. Supported DOM, ARIA, data, and event props reach the root; `xstyle`, `className`, and `style` merge after the component's interactive styles.                                                                                                                                                                                                                                                                                                                                                                                                                              | Current source and tests |

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
| Nested control | Activating the nested control does not toggle the card.                                           | Control type.     |

### Transformation and precedence order

- **ORD1 — Toggle.** Disabled → nothing runs, caller `onClick` and
  `onMouseUp` included; nested interactive target or selection → no toggle,
  caller handlers still run; otherwise one `onChange(!isSelected)`, with a
  caller `onClick` after it for a surface click, before it for a click or
  Space on the checkbox, and not at all for Enter.
- **ORD2 — Ring color.** Built-in variant mapping → `--selectable-card-ring-color`
  for a theme-added variant.

### Performance and resources

- **PR1 — Shared resources only.** SelectableCard installs the shared press
  controller on mount and marks its root as a press surface only while
  enabled; it adds no listener, observer, or timer of its own.

## Accessibility contract

- **AR1 — Native checkbox.** The hidden checkbox supplies the role, name, and
  checked state; the card root adds no role or tab stop of its own, except
  that a fixed-height card whose content overflows is a scroll container that
  browsers may make an unnamed tab stop (`component:Card` AR1).
- **AR2 — Delegated focus indicator.** Keyboard focus on the hidden checkbox is
  shown on the visible card root (`architecture:interaction-modality` INV3).
  Implementation gap: a focused nested control shows a second outline.
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

## Verification map

| Contract            | Verification                                                                                                                         | Representative states                                                            | Mutation or failure expectation                                                                                                                                                                                                                                                              | Audit section                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| FR1, FR2            | `SelectableCard.test.tsx` surface, checkbox, Enter, and Space tests                                                                  | Unselected, selected                                                             | A missed toggle, a wrong `onChange` value, or a doubled toggle from Space fails. Gap: surface-click tests assert only the value, not the call count, and no test asserts the `selectable-card` target or its reflection, or the order of a caller `onClick` or `onMouseUp`.                  | `audit:SelectableCard/behavior` |
| FR3                 | `SelectableCard.test.tsx` elevation tests; stable visual baseline `core-selectablecard--single-select`; `SelectableCard.stories.tsx` | Selected with elevation; one selected default card beside unselected ones        | A lost elevation while selected fails; a changed default ring or border comes back changed for review. Gap: palette and theme-added ring colors have no automated check.                                                                                                                     | `audit:SelectableCard/theming`  |
| FR4                 | `SelectableCard.test.tsx` touch-press test; `CardPress.a11y.chromium.spec.ts` on `core-selectablecard--single-select`                | Rest; desktop hover and mouse press; touch press                                 | A hover that does not paint over rest, a mouse press that does not paint over hover, or a touch press that does not match the desktop press or fade fails. Gap: the focus outline, and the double indicator on nested controls, have no automated check.                                     | `audit:SelectableCard/design`   |
| FR5, AR3            | `SelectableCard.test.tsx` disabled tests; `Checkbox.a11y.chromium.spec.ts` `card-disabled` state                                     | Disabled click, Enter, Space                                                     | A toggle while disabled, or a disabled card that leaves keyboard reach, fails. Gap: the half opacity, the removed overlays, and the missing disabled reflection on the target have no automated check.                                                                                       | `audit:SelectableCard/a11y`     |
| FR2 (nested)        | Shared clickable-container hook tests in other components                                                                            | Card with a nested control or selected text                                      | Gap: no SelectableCard test or story covers nested-control or selection suppression.                                                                                                                                                                                                         | `audit:SelectableCard/behavior` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                        | Consumer anatomy and current target                                              | Missing, extra, or stale mappings fail repository validation.                                                                                                                                                                                                                                | `audit:SelectableCard/theming`  |
| AR1, AR2, AR4       | `SelectableCard.test.tsx` checkbox tests; `Checkbox.a11y.test.tsx` and `Checkbox.a11y.chromium.spec.ts` SelectableCard states        | Unchecked, checked, disabled (`card-unchecked`, `card-checked`, `card-disabled`) | A lost checkbox role or name, a wrong checked state, or a disabled card that is not exposed as unavailable or not reachable fails, including at the accessibility tree. Gap: no test asserts that the root adds no role or tab stop, the root focus outline, or the ring winning over hover. | `audit:SelectableCard/a11y`     |
| FR6, PR1            | Source review                                                                                                                        | Ref; caller props                                                                | Gap: no test asserts ref or passthrough routing, or fails if SelectableCard adds its own listener or timer.                                                                                                                                                                                  | `audit:SelectableCard/behavior` |
| AR5                 | `Checkbox.a11y.chromium.spec.ts` aborted-press check on the SelectableCard states                                                    | Press that slides off the card before the lift                                   | A toggle after a slide-off lift fails.                                                                                                                                                                                                                                                       | `audit:SelectableCard/a11y`     |

## Decision log

None recorded. The record describes shipped behavior.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
