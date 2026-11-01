---
schema_version: 3
template_version: 7
kind: component
id: component:DropdownMenuRadioItem
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-31
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, theming, testing]
verified_by:
  [
    packages/core/src/DropdownMenu/DropdownMenuSelectable.test.tsx,
    packages/core/src/DropdownMenu/__tests__/Menu.a11y.test.tsx,
    packages/core/src/RadioList/__tests__/RadioGroup.a11y.test.tsx,
    packages/core/src/DropdownMenu/__tests__/DropdownMenuRadioItemAudit.a11y.chromium.spec.ts,
    apps/storybook/rtl-audit/verified-not-applicable.json,
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
  ]
contributing: []
system_specs: [spec:AST-020]
---

# DropdownMenuRadioItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | One `menuitemradio` row inside a DropdownMenuRadioGroup with a required value and label, optional description, icon, end content, disabled state, root inputs, and a ref.               |
| Behavior                | Enabled activation emits the row value through the group, applies the group close policy, then runs the caller click handler; disabled activation does none of these.                   |
| End-user impact         | Assistive technology hears one radio option with its checked state; pointer and keyboard selection commit the same value, and a disabled option cannot be chosen.                       |
| Builder impact          | Place the row inside a DropdownMenuRadioGroup and give it a unique value and a label; caller handlers run alongside the row's own behavior.                                             |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change.                                                                                                                               |
| Review checks           | Reject a nested semantic radio, a second keyboard owner, local selection state, a dropped caller input, or disabled activation that selects, closes, or calls the caller click handler. |
| Governing rules         | `spec:AST-020` FR15; `architecture:public-component-api/INV5–INV8`; `architecture:component-theming-surface/INV4–INV6`; `spec:AST-020/FR1,FR2`.                                         |

This table is a review projection; the body below is authoritative.

## Intent

DropdownMenuRadioItem renders one selectable option of a single-choice group in
the pointer presentation of DropdownMenu. The row owns its `menuitemradio`
semantics, checked state, decorative radio marker, visible content, disabled
paint, and activation order. DropdownMenuRadioGroup owns the controlled value
and close policy; DropdownMenu owns focus movement, typeahead, keyboard
activation, and the menu lifecycle.

## Compatibility and migration

- Released default preserved: yes (`isDisabled=false`).
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change.
- Controlled behavior: the checked state always derives from the group `value`;
  the row holds no selection state.
- Migration decision: none.

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- One row root with `role="menuitemradio"` and `aria-checked` derived from the
  group value.
- Selection order: disabled guard, group `onChange(value)`, optional close, then
  the caller click handler.
- The decorative shared radio marker, its size, and its inline placement.
- Label, description, icon, and end content composition through Item.
- Disabled state exposure and paint, and hover focus for enabled rows.
- Root composition of ref, supported host inputs, `className`, `style`, and
  `xstyle`.

**Does not own / non-goals**

- The selected value, change callback, and close policy — owned by
  `component:DropdownMenuRadioGroup`.
- Focus entry, arrow-key navigation, typeahead, Enter/Space click synthesis,
  press gestures, and closing — owned by `component:DropdownMenu`.
- Touch bottom-sheet rendering of selectable rows — owned by the parent
  presentation.
- The radio marker's paint — owned by the shared radio Indicator.

## Public concepts

| Concept      | Closed values or states                        | Meaning                                                           | Availability by variant/orientation/state | Default  | Owner                             | Stability | Invalid-value behavior                                   |
| ------------ | ---------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------- | -------- | --------------------------------- | --------- | -------------------------------------------------------- |
| Option value | any string                                     | The value the group emits and compares to decide the checked row. | Every row                                 | required | `component:DropdownMenuRadioItem` | stable    | A value no group value matches leaves the row unchecked. |
| Checked      | checked; unchecked                             | Whether the group value equals this row's value.                  | Every row                                 | derived  | group context and row             | stable    | No local override exists.                                |
| Availability | enabled; disabled                              | Whether the row can take hover focus and commit its value.        | Every row                                 | enabled  | `component:DropdownMenuRadioItem` | stable    | Disabled blocks every activation path.                   |
| Content      | label; description; icon; end content          | Visible identification of the option, in reading order.           | Every row                                 | label    | row through Item                  | stable    | `label` is required by the public type.                  |
| Root surface | ref; DOM/data/ARIA; class/style/xstyle; events | Extends the row root while preserving its role and checked state. | Every row                                 | omitted  | public component API              | stable    | `role`, `aria-checked`, and `tabIndex` are not accepted. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                   | Basis                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| FR1 | The row renders one element with `role="menuitemradio"` whose `aria-checked` is true exactly when the group value equals the row value. It nests no native or ARIA radio.                                                                                                                   | `spec:AST-020`; current source and tests                             |
| FR2 | Rendering the row outside a DropdownMenuRadioGroup throws.                                                                                                                                                                                                                                  | Current source and focused tests                                     |
| FR3 | Enabled activation, by pointer or by the parent's synthesized Enter/Space click, calls the group `onChange` with the row value, then asks DropdownMenu to close when the group's close policy is on, then calls the caller `onClick`.                                                       | `architecture:public-component-api` INV7; current behavior and tests |
| FR4 | A disabled row exposes `aria-disabled="true"`, renders no `tabindex`, takes no hover focus, and on any activation, including an assistive-technology click, calls neither `onChange` nor the caller `onClick` and does not close the menu. It paints at half opacity with a default cursor. | Current source and tests                                             |
| FR5 | Ref, supported host attributes and handlers, `className`, `style`, and `xstyle` reach or compose on the row root. Caller `onPointerMove` runs after the row's hover focus, and caller handlers do not replace the row's own behavior.                                                       | `architecture:public-component-api` INV5–INV8; current tests         |
| FR6 | The marker is the shared radio Indicator, hidden from assistive technology, never the pointer target, sized `sm` in a small menu and `md` otherwise, at the row's inline start on a fine pointer and its inline end on a coarse pointer.                                                    | Current source and tests                                             |
| FR7 | The row carries the `dropdown-menu-item` target with the menu size and the marker carries the `dropdown-menu-radio` target with size, checked, and disabled reflections.                                                                                                                    | `architecture:component-theming-surface`; current source and docs    |
| FR8 | The row adds no key handler or tab stop of its own: enabled rows are `tabindex="-1"` for the parent's roving focus, and keyboard selection arrives as the parent's synthesized click.                                                                                                       | `architecture:interaction-modality`; parent keyboard tests           |

### Allowed variation

- **AV1 — Content.** Label, description, icon, and end content may vary in
  length and kind; long string labels truncate on one line.
- **AV2 — Size.** The marker follows the parent menu size: `sm` in a small
  menu, `md` otherwise. Row padding does not currently vary with the menu size,
  unlike action rows; this is an observation, not an invariant.
- **AV3 — Root styling.** Caller style inputs may extend the row while its role,
  checked state, and marker remain intact.

### Representative states

| State          | Required invariant                                                        | Allowed variation                                              |
| -------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Checked        | `aria-checked=true`; the marker shows its checked dot.                    | Content, size, theme, and mode.                                |
| Unchecked      | `aria-checked=false`; the marker shows an empty circle.                   | Content, size, theme, and mode.                                |
| Focused        | The row holds focus.                                                      | Pointer hover or keyboard arrival; focus paint is the AR4 gap. |
| Disabled       | `aria-disabled=true`, no tab stop, half opacity, and no activation.       | Checked or unchecked value.                                    |
| Coarse pointer | The marker sits at the inline end of the row.                             | Direction mirrors the placement.                               |
| RTL / narrow   | Content and marker follow logical order with no horizontal page overflow. | Parent menu placement and width.                               |

### Transformation and precedence order

- **ORD1 — Activation.** Disabled guard → group `onChange(value)` → close when
  the group's close policy is on → caller `onClick`.
- **ORD2 — Pointer move.** Hover focus for an enabled row → caller
  `onPointerMove`.
- **ORD3 — Root composition.** Base row styles → disabled paint → caller
  `xstyle`; caller `className` and `style` merge with the row target.

### Performance and resources

- **PR1 — Render only.** The row owns no Effect, listener, observer, timer,
  request, or local state.

## Accessibility contract

- **AR1 — One radio option.** The row is the only announced control; its
  accessible name comes from its visible content and its state from
  `aria-checked`.
- **AR2 — Disabled state.** A disabled row exposes `aria-disabled` and cannot
  commit a value through any input.
- **AR3 — Keyboard ownership.** DropdownMenu owns focus movement and activation;
  the row adds no key handling. Whether disabled rows stay keyboard-discoverable
  is owned by `component:DropdownMenu` (its OQ1).
- **AR4 — Focus visibility.** Keyboard focus paints only the menu overlay
  tint, about 1.1:1 against the menu surface in the default themes, with no
  outline, and nothing under forced colors. The shared row
  treatment is `component:DropdownMenuItem` OQ2.

## Design relationships

| Anatomy or state | Design requirement                                        | Representation authority         | Hierarchy role | Component contract |
| ---------------- | --------------------------------------------------------- | -------------------------------- | -------------- | ------------------ |
| Row              | Menu row paint and radius; focus paint is AR4.            | Current source and menu tokens   | structural     | FR7, AR4           |
| Radio marker     | Shared radio Indicator at the menu's control size.        | Shared radio Indicator           | prominent      | FR1, FR6           |
| Disabled         | Half-opacity row with a default cursor.                   | Current source                   | supporting     | FR4                |
| Direction/touch  | Logical marker placement that mirrors and moves on touch. | Bidirectionality and current CSS | structural     | FR6                |

No component-local visual decision is recorded.

## Family and system relationships

- `component:DropdownMenuRadioGroup` owns value, change callback, and close policy.
- `component:DropdownMenu` owns keyboard navigation, the press model, the
  `dropdown-menu-item` and `dropdown-menu-radio` target inventory, disabled
  keyboard discoverability (its OQ1), and forced-colors row focus together with
  `component:DropdownMenuItem` (its OQ2).
- `architecture:public-component-api` owns root input and handler composition.
- `architecture:component-theming-surface` owns target placement and state
  reflection.
- `architecture:component-test-sufficiency` owns proportionate observable evidence.
- `spec:AST-020` supplies WCAG/APG adoption and evidence-layer boundaries.

## Verification map

| Contract | Verification                                                                                                                                                                                                                                                                                                                                                                      | Representative states                            | Mutation or failure expectation                                                                                                                                                                      | Audit section                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| FR1, AR1 | `DropdownMenuSelectable.test.tsx` "renders the shared radio indicator in the menu marker" and "composes caller root inputs without replacing the row semantics"; `Menu.a11y.test.tsx` menu binding cases                                                                                                                                                                          | Checked and unchecked                            | A row that is not `menuitemradio` or a wrong `aria-checked` fails. Evidence gap: no test asserts the absence of a nested radio.                                                                      | `audit:DropdownMenuRadioItem/semantics` |
| FR2      | `DropdownMenuSelectable.test.tsx` "throws when a radio item is used outside a group"                                                                                                                                                                                                                                                                                              | Outside a group                                  | A row that renders outside a group fails.                                                                                                                                                            | `audit:DropdownMenuRadioItem/behavior`  |
| FR3, FR8 | `DropdownMenuSelectable.test.tsx` "calls onChange with the selected value", "composes the caller click handler with the selection", "composes the caller click handler on keyboard activation", "keeps the menu open while controlled selection updates when requested"; `DropdownMenu.test.tsx` "activates a focused menuitemradio with Enter and a menuitemcheckbox with Space" | Pointer and keyboard activation; close off       | A missing `onChange`, a dropped caller `onClick`, or a close despite the opt-out fails. Evidence gap: no test asserts the `onChange`, close, `onClick` order or the `tabindex="-1"` on enabled rows. | `audit:DropdownMenuRadioItem/behavior`  |
| FR4, AR2 | `DropdownMenuSelectable.test.tsx` "does not select, close, or call the caller click handler when disabled"; `DropdownMenu.test.tsx` "does not move focus on hover for a disabled item"                                                                                                                                                                                            | Disabled                                         | A selection, close, or caller `onClick` while disabled, or hover focus on a disabled row, fails. Evidence gap: no test asserts the absent `tabindex` or the half-opacity paint.                      | `audit:DropdownMenuRadioItem/behavior`  |
| FR5      | `DropdownMenuSelectable.test.tsx` "composes caller root inputs without replacing the row semantics", "composes the caller pointer-move handler with menu hover focus", and "a ref reaches the menuitemradio element"                                                                                                                                                              | Ref, host attributes, class, style, pointer move | A dropped ref, attribute, class, style, or handler fails. Evidence gap: no test asserts `xstyle` on the row.                                                                                         | `audit:DropdownMenuRadioItem/api`       |
| FR6, FR7 | `DropdownMenuSelectable.test.tsx` "renders the shared radio indicator in the menu marker"; `DropdownMenuRadioItemAudit.a11y.chromium.spec.ts`                                                                                                                                                                                                                                     | Marker in the row                                | A missing shared radio marker fails. Evidence gap: no test asserts the marker size by menu size, its fine and coarse placement, or the `dropdown-menu-radio` reflections.                            | `audit:DropdownMenuRadioItem/visual`    |
| AR4, PR1 | Evidence gap: no test asserts the focus paint, forced-colors focus, or the absence of lifecycle resources                                                                                                                                                                                                                                                                         | —                                                | —                                                                                                                                                                                                    | `audit:DropdownMenuRadioItem/visual`    |

## Current-state impact

- **Focus visibility (AR4).** Keyboard focus on a radio row shows only an
  overlay tint about 1.1:1 against the menu surface, and no indicator in
  forced-colors mode; the shared row treatment is
  `component:DropdownMenuItem` OQ2.

## Decision log

No component-local decision.

## Open questions

- **OQ1 — Should the shared `dropdown-menu-item` target reflect the disabled
  state its rows paint?** (`human-api`) Selectable and action rows paint disabled
  rows at half opacity, but the target reflects only size and variant, so a theme
  cannot style disabled rows through it. The target inventory is owned by
  `component:DropdownMenu`.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit scores,
screenshot matrices, implementation steps, or group/parent contracts. It links to their owners.
