---
schema_version: 3
template_version: 7
kind: component
id: component:SegmentedControlItem
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
owners: [cixzhang]
review_triggers:
  [
    public-api,
    behavior,
    layout,
    interaction,
    motion,
    theming,
    styling,
    accessibility,
    visual,
    react-runtime,
    compatibility,
  ]
verified_by:
  [
    packages/core/src/SegmentedControl/SegmentedControl.test.tsx,
    packages/core/src/RadioList/__tests__/RadioGroup.a11y.test.tsx,
    packages/core/src/RadioList/__tests__/RadioGroup.a11y.chromium.spec.ts,
    packages/core/src/__tests__/PressedState.a11y.chromium.spec.ts,
  ]
modules: []
families: []
design_specs: [design:user-states]
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-020, spec:AST-085, spec:AST-102]
---

# SegmentedControlItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | None changes. SegmentedControlItem takes `value`, `label`, `isLabelHidden`, `icon`, `isDisabled`, and base props, and must sit inside a SegmentedControl.                                                                                                                                                                                                 |
| Behavior                | One segment: a `<button role="radio">` with `aria-checked`. A click, or Space or Enter on the focused segment, selects it unless it is selected, disabled, or the caller's `onClick` prevents default.                                                                                                                                                    |
| End-user impact         | People see the selected segment raised and bold, and pick another with one click. Icon-only segments are still named. A disabled selected segment drops out of the tab order.                                                                                                                                                                             |
| Builder impact          | None.                                                                                                                                                                                                                                                                                                                                                     |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. A disabled selected segment leaves the tab order, a caller `onClick` runs while disabled or cannot veto a press while focused, a caller `className` is replaced, segments hold a fixed height, and a truncated `sm` segment can be under 24 px wide; all are listed under Current-state impact. |
| Review checks           | Reject a segment without a name, a click that selects a disabled segment, press paint on the selected or a disabled segment, or a lost forced-colors selected state.                                                                                                                                                                                      |
| Governing rules         | `component:SegmentedControl`; WAI-ARIA radio pattern; `spec:AST-020` FR9, FR15, DEC-5; `spec:AST-085` FR1, FR2; `spec:AST-102` FR4; `design:user-states` DR1–DR3 (pressed overlay, disabled non-response, and selected-segment exception); `architecture:public-component-api` INV5, INV6; WCAG 1.4.11.                                                   |

This table is a review projection; the body below is authoritative.

## Intent

SegmentedControlItem is one choice in a SegmentedControl. It owns the
segment's radio semantics, click selection, naming, label and icon rendering,
item disabled state, and the segment's paint. Consumer usage lives in
`SegmentedControlItem.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`; label visible, enabled
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: controlled by the parent's `value`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The segment button, its radio role, checked and disabled state, and name.
- Click selection and `onClick` composition.
- Label and icon rendering, truncation, and segment paint per size and state.

**Does not own / non-goals**

- Tab stop, arrow navigation, selection-follows-focus, group disabled state,
  and the theming anatomy map — owned by `component:SegmentedControl`. The
  `segmented-control-item` target is declared in SegmentedControl's consumer
  docs and mapped in its record.
- Icon artwork — owned by the caller.
- Use outside SegmentedControl — not supported.

## Public concepts

| Concept  | Closed values or states   | Meaning                                            | Availability by variant/orientation/state | Default  | Owner                            | Stability | Invalid-value behavior              |
| -------- | ------------------------- | -------------------------------------------------- | ----------------------------------------- | -------- | -------------------------------- | --------- | ----------------------------------- |
| Value    | string                    | The value this segment selects.                    | Always.                                   | required | `component:SegmentedControlItem` | Stable    | TypeScript rejects a missing value. |
| Label    | string; visible or hidden | Visible text, or the name of an icon-only segment. | Always.                                   | visible  | `component:SegmentedControlItem` | Stable    | TypeScript rejects a missing label. |
| Disabled | off, item, group          | Blocks selection.                                  | Always.                                   | off      | `component:SegmentedControlItem` | Stable    | Not applicable.                     |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Basis                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| FR1 | Each segment renders one `<button type="button" role="radio">` with `aria-checked` true when its `value` equals the group value, `data-value`, and the `segmented-control-item` target reflecting `data-size`, `data-selected`, and `data-disabled`. A forwarded prop cannot override the role.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | WAI-ARIA radio pattern; current source and tests                             |
| FR2 | A click, including one from Space or Enter on the focused segment (native button activation; `spec:AST-020` FR15), runs the caller `onClick` first; unless it prevents default, an enabled, unselected segment passes its value to the group's `onChange`. Clicking the selected segment does nothing. The caller's `preventDefault()` MUST veto every press. Implementation gap: a press while focus is already in the group selects through `component:SegmentedControl` FR3 before the click, so the veto does not apply to it.                                                                                                                                                                                                                                                            | `spec:AST-020` FR15; current tests                                           |
| FR3 | The segment renders its icon (sized to the segment size) followed by its label. With `isLabelHidden`, the label is not rendered and becomes `aria-label`, and the segment does not shrink. A visible label truncates with an ellipsis when the segment is narrower than it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current tests                                                                |
| FR4 | A segment disabled by its own `isDisabled` or by the group sets `aria-disabled`, refuses selection, shows disabled text color, and shows no hover or press paint. A disabled selected segment MUST keep the Tab stop (`spec:AST-085` FR1); for a value that matches no segment, `component:SegmentedControl` FR2 places the stop. Implementation gap: a disabled selected segment leaves the tab order, except in a group disabled with a reason when it is not itself `isDisabled`, and a caller `onClick` still runs on a disabled segment (`spec:AST-085` FR2).                                                                                                                                                                                                                            | `spec:AST-085` FR1, FR2; current tests                                       |
| FR5 | The selected segment paints a raised surface with a low shadow and semibold primary text; under forced colors it paints `Highlight` with `HighlightText`. Unselected enabled segments paint the shared hover tint and, under `design:user-states` DR1 and DR2, the pressed overlay; the selected segment keeps its raised surface during a press (DR3).                                                                                                                                                                                                                                                                                                                                                                                                                                       | WCAG 1.4.11; `design:user-states` DR1–DR3; current tests                     |
| FR6 | Segment height is the element height for the size minus 4 CSS px (24, 28, or 32) as a minimum that grows with a set text size under `spec:AST-102` FR4 (implementation gap: the height is fixed), with corners concentric with the control; `sm` uses supporting text and tighter padding. Keyboard focus paints the shared focus outline.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `architecture:interaction-modality` INV1; current source; `spec:AST-102` FR4 |
| FR7 | The segment owns `role`, `aria-checked`, `aria-disabled`, `aria-label` (set from the label when hidden), `tabIndex`, `type`, `data-value`, and `data-size`, and writes `data-selected`, `data-disabled`, and the press marker `data-astryx-pressable` in their own states; a caller value for an owned attribute is replaced, while a caller `data-selected`, `data-disabled`, or `data-astryx-pressable` passes through on segments outside that state. `ref`, other `data-*`, `style`, other ARIA such as `aria-describedby`, and other base props reach the button; `xstyle` composes last. Caller `className` MUST compose with the component's classes (`architecture:public-component-api` INV5, INV6). Implementation gap: the component's merged class replaces a caller `className`. | `architecture:public-component-api` INV5, INV6; current tests                |

### Allowed variation

- **AV1 — Content.** Label text and icon vary within their types.

### Representative states

| State      | Required invariant                                                  | Allowed variation |
| ---------- | ------------------------------------------------------------------- | ----------------- |
| Unselected | `aria-checked="false"`; hover and press overlay.                    | Icon.             |
| Selected   | `aria-checked="true"`; raised; bold; Highlight under forced colors. | —                 |
| Icon-only  | Named by `aria-label`; does not shrink.                             | —                 |
| Disabled   | `aria-disabled`; no paint feedback; no selection.                   | Item or group.    |

### Transformation and precedence order

- **ORD1 — Click.** Caller `onClick`, then selection unless prevented,
  disabled, or already selected; today a press while focus is in the group
  selects through focus first (FR2 gap).

### Performance and resources

- **PR1 — Bounded resources.** No state, effect, or listener of its own; press
  feedback shares the press controller's window and document listeners.

## Accessibility contract

- **AR1 — Radio semantics.** Each segment exposes the radio role, checked
  state, disabled state, and a name (FR1, FR3).
- **AR2 — Target size.** The smallest segment is 24 CSS px tall. A labelled
  `sm` segment that truncates under `component:SegmentedControl` FR5 can shrink
  below 24 CSS px wide, short of WCAG 2.5.8 (implementation gap).
- **AR3 — Non-color state.** FR5.

## Design relationships

| Anatomy or state | Design requirement                                | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Segment          | Transparent button; raised surface when selected. | Current source           | Prominent      | FR1, FR5, FR6      |
| Label            | Medium text; semibold when selected; truncates.   | Current source           | Prominent      | FR3, FR5           |
| Icon             | Caller artwork sized to the segment.              | Current source           | Supporting     | FR3                |

The target mapping for these parts lives in `component:SegmentedControl`'s
theming anatomy.

## Family and system relationships

- `component:SegmentedControl` supplies the value, size, layout, and group
  disabled state, and owns keyboard navigation.
- `spec:AST-085` owns disabled focusability; FR4 records the gap.
- `design:user-states` owns the pressed treatment.

## Verification map

| Contract | Verification                                                                                                                                                                                                       | Representative states                         | Mutation or failure expectation                                                                                                                                                                                                                                                                                                 | Audit section                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| FR1      | `SegmentedControl.test.tsx` aria-checked and data-testid cases; `RadioGroup.a11y.test.tsx` and `RadioGroup.a11y.chromium.spec.ts` (in `RadioList/__tests__`) `segmented-option-*` states                           | Selection change; data-testid                 | Stale `aria-checked` fails. Evidence gap: no test passes `role` to a segment; the role-override case covers the radiogroup.                                                                                                                                                                                                     | `audit:SegmentedControlItem/accessibility` |
| FR2      | `SegmentedControl.test.tsx` click and onClick-composition cases                                                                                                                                                    | Click; selected click; prevented click        | A selected or prevented click that selects fails. Evidence gap: no test covers a press while focus is already in the group.                                                                                                                                                                                                     | `audit:SegmentedControlItem/behavior`      |
| FR3      | `SegmentedControl.test.tsx` icon, icon-only, and truncation cases                                                                                                                                                  | Icon and label; icon-only; long label         | A missing name, or an icon that truncates, fails.                                                                                                                                                                                                                                                                               | `audit:SegmentedControlItem/anatomy`       |
| FR4      | `SegmentedControl.test.tsx` disabled cases; `RadioGroup.a11y.test.tsx` and `RadioGroup.a11y.chromium.spec.ts` (in `RadioList/__tests__`) `segmented-option-disabled` and `segmented-option-group-disabled*` states | Item and group disabled                       | A disabled segment that selects fails. Evidence gap: no test asserts the disabled text color, absent hover paint, or the caller `onClick` while disabled. The `segmented-option-group-disabled` state declares a checked, group-disabled segment with `tabReachable: false`, asserting the current FR4 gap pending conformance. | `audit:SegmentedControlItem/accessibility` |
| FR5      | `SegmentedControl.test.tsx` forced-colors and pressed-state cases; `PressedState.a11y.chromium.spec.ts` segmented-control cases                                                                                    | Selected under forced colors; press; disabled | Lost forced-colors state, or press paint on a disabled segment, fails. Evidence gap: no test asserts the raised selected surface or the hover tint.                                                                                                                                                                             | `audit:SegmentedControlItem/visual`        |
| FR6, FR7 | Evidence gap: no test of segment heights, text growth, focus outline, `ref`, or `xstyle` order                                                                                                                     | —                                             | —                                                                                                                                                                                                                                                                                                                               | `audit:SegmentedControlItem/layout`        |

## Current-state impact

- **Narrow target (AR2).** A labelled `sm` segment that truncates can shrink
  below 24 CSS px wide, short of WCAG 2.5.8.
- **Press veto (FR2).** A caller `onClick` cannot veto a press made while focus
  is already in the group, which selects before the click.
- **Caller className (FR7).** A caller `className` on a segment is replaced by
  the component's class, against `architecture:public-component-api` INV5 and
  INV6.
- **Caller onClick while disabled (FR4).** A disabled segment still runs a
  caller's `onClick`, against `spec:AST-085` FR2.
- **Fixed height (FR6).** Segments hold a fixed height instead of growing with
  a set text size, against `spec:AST-102` FR4.
- **Disabled selected segment (FR4).** A disabled selected segment leaves the
  tab order, except in a group disabled with a reason when it is not itself
  `isDisabled`, against `spec:AST-085` FR1.

## Decision log

No component-local decision.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
