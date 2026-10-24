---
schema_version: 3
template_version: 7
kind: component
id: component:DropdownMenuRadioItem
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility, theming, testing]
verified_by:
  [
    packages/core/src/DropdownMenu/DropdownMenuSelectable.test.tsx,
    packages/core/src/DropdownMenu/__tests__/Menu.a11y.test.tsx,
    packages/core/src/RadioList/__tests__/RadioGroup.a11y.test.tsx,
    packages/core/src/DropdownMenu/__tests__/DropdownMenuRadioItemAudit.a11y.chromium.spec.ts,
    apps/storybook/stories/DropdownMenuRadioItem.stories.tsx,
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
system_specs: [spec:AST-020, spec:AST-029]
---

# DropdownMenuRadioItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | One `menuitemradio` row inside a DropdownMenuRadioGroup with a required value and label, optional description, icon, end content, disabled state, root inputs, and an explicit React 19 ref. |
| Behavior                | Enabled activation emits the row value through the group, applies the group close policy, then runs the caller click handler; disabled activation does none of these.                        |
| End-user impact         | Assistive technology hears one radio option with its checked state; pointer and keyboard selection commit the same value, and a disabled option cannot be chosen.                            |
| Builder impact          | Place the row inside a DropdownMenuRadioGroup and give it a unique value and a label; caller handlers run alongside the row's own behavior.                                                  |
| Compatibility/readiness | Released subcomponent; observational draft of current behavior. Authority stays `draft` until owner approval.                                                                                |
| Review checks           | Reject a nested semantic radio, a second keyboard owner, local selection state, a dropped caller input, or disabled activation that selects, closes, or calls the caller click handler.      |
| Governing rules         | WAI-ARIA menu pattern; `architecture:public-component-api/INV5–INV8`; `architecture:component-theming-surface/INV4–INV6`; `spec:AST-020/FR1,FR2`.                                            |

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
- Compatibility class: no public API change; caller `onClick` and
  `onPointerMove` compose with the row's own behavior.
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

Draft requirements identify their basis so observed code is not mistaken for an
intentional decision.

| ID  | Candidate invariant                                                                                                                                                                                                                                                                    | Basis                                                                      | Draft review state |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------ |
| FR1 | The row MUST render one element with `role="menuitemradio"` whose `aria-checked` is true exactly when the group value equals the row value. It MUST NOT nest a native or ARIA radio.                                                                                                   | WAI-ARIA menu pattern; current source and focused tests                    | verify             |
| FR2 | Rendering the row outside a DropdownMenuRadioGroup MUST throw.                                                                                                                                                                                                                         | Current source and focused tests                                           | verify             |
| FR3 | Enabled activation, by pointer or by the parent's synthesized Enter/Space click, MUST call the group `onChange` with the row value, then ask DropdownMenu to close when the group's close policy is on, then call the caller `onClick`.                                                | Released behavior; `architecture:public-component-api/INV7`; focused tests | verify             |
| FR4 | A disabled row MUST expose `aria-disabled="true"`, render no `tabindex`, take no hover focus, and on any activation, including an assistive-technology click, MUST NOT call `onChange`, close the menu, or call the caller `onClick`. It paints at half opacity with a default cursor. | Current source, focused tests, and browser evidence                        | verify             |
| FR5 | Ref, supported host attributes and handlers, `className`, `style`, and `xstyle` MUST reach or compose on the row root. Caller `onPointerMove` MUST run after the row's hover focus, and caller handlers MUST NOT replace the row's own behavior.                                       | `architecture:public-component-api/INV5–INV8`; focused tests               | verify             |
| FR6 | The marker MUST be the shared radio Indicator, hidden from assistive technology, never the pointer target, sized `sm` in a small menu and `md` otherwise, at the row's inline start on a fine pointer and its inline end on a coarse pointer.                                          | Current source, focused tests, and browser evidence                        | verify             |
| FR7 | The row MUST carry the `dropdown-menu-item` target with the menu size and the marker MUST carry the `dropdown-menu-radio` target with size, checked, and disabled reflections.                                                                                                         | `architecture:component-theming-surface/INV4–INV6`; current source/docs    | verify             |
| FR8 | The row MUST add no key handler or tab stop of its own: enabled rows are `tabindex="-1"` for the parent's roving focus, and keyboard selection arrives as the parent's synthesized click.                                                                                              | `architecture:interaction-modality`; parent keyboard tests                 | verify             |

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
- **AR4 — Focus visibility (objective gap).** Keyboard focus MUST be
  perceivable (WCAG 2.2 SC 2.4.7 and 1.4.11). The row currently paints focus
  only as the menu overlay tint with no outline, which measures about 1.1:1
  against the menu surface and paints nothing under forced colors. The
  remediation is a shared row-visual decision with `component:DropdownMenuItem`
  (its OQ2); this draft records the gap and does not settle it.

## Design relationships

| Anatomy or state | Design requirement                                               | Representation authority         | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------------- | -------------------------------- | -------------- | ------------------ |
| Row              | Menu row paint and radius; focus paint is the AR4 objective gap. | Current source and menu tokens   | structural     | FR7, AR4           |
| Radio marker     | Shared radio Indicator at the menu's control size.               | Shared radio Indicator           | prominent      | FR1, FR6           |
| Disabled         | Half-opacity row with a default cursor.                          | Current source                   | supporting     | FR4                |
| Direction/touch  | Logical marker placement that mirrors and moves on touch.        | Bidirectionality and current CSS | structural     | FR6                |

No new component-local visual decision is settled by this draft.

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
- `spec:AST-029` keeps this observational draft separate from the audit receipt.

## Verification map

| Contract      | Verification                                                                                        | Representative states                                          | Mutation or failure expectation                                                                                              | Audit section                              |
| ------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| FR1, FR2, AR1 | `DropdownMenuSelectable.test.tsx`; reusable radio-group and Menu contracts; scoped axe              | checked, unchecked, outside a group                            | A nested radio, wrong checked row, extra announced control, or missing throw fails                                           | `audit:DropdownMenuRadioItem/§1,§4,§6`     |
| FR3, FR5, FR8 | `DropdownMenuSelectable.test.tsx` handler, keyboard, close, and ref cases; browser fixture counters | pointer and keyboard activation, close on/off, caller handlers | A dropped caller handler, wrong order, or missing close fails                                                                | `audit:DropdownMenuRadioItem/§3,§4,§6`     |
| FR4, AR2      | Disabled focused test with an assistive-technology click; browser disabled-hover frame              | disabled checked/unchecked                                     | Removing the disabled guard makes the focused test fail                                                                      | `audit:DropdownMenuRadioItem/§1,§4`        |
| AR4           | Exact-head keyboard-focus and forced-colors frames with rendered contrast                           | Neutral/Butter light/dark focus, forced colors                 | Current frames record the gap; a remediation passes only with a perceivable indicator in every theme and under forced colors | `audit:DropdownMenuRadioItem/§1,§5`        |
| FR6, FR7      | Marker and target tests; exact-head Neutral/Butter/RTL/narrow/size/coarse/focus frames              | sm/md/lg, fine/coarse, LTR/RTL, light/dark                     | A lost target or reflection, a marker that is announced, wrongly sized, or misplaced fails                                   | `audit:DropdownMenuRadioItem/§2,§5,§9,§10` |

## Decision log

None. This draft records current facts and introduces no product decision.

## Open questions

- **OQ1 — Should the shared `dropdown-menu-item` target reflect the disabled
  state its rows paint?** (`human-api`) Selectable and action rows paint disabled
  rows at half opacity, but the target reflects only size and variant, so a theme
  cannot style disabled rows through it. The target inventory is owned by
  `component:DropdownMenu`.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit scores,
screenshot matrices, implementation steps, or group/parent contracts. The audit
pull request owns the closed run evidence required by `spec:AST-029/FR5`.
