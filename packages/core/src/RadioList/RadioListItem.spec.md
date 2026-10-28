---
schema_version: 3
template_version: 7
kind: component
id: component:RadioListItem
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
    packages/core/src/RadioList/RadioList.test.tsx,
    packages/core/src/RadioList/RadioListItem.press.source-build.test.mjs,
    packages/core/src/RadioList/__tests__/RadioGroup.a11y.test.tsx,
    packages/core/src/RadioList/__tests__/RadioGroup.a11y.chromium.spec.ts,
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
system_specs: [spec:AST-085]
---

# RadioListItem component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | None changes. RadioListItem takes `label`, `aria-label`, `value`, `description`, `isDisabled`, `startContent`, `endContent`, `align`, and base props, and must sit inside a RadioList.                                                                                   |
| Behavior                | One option row: a visually hidden native radio drawn by the radio indicator, named by the visible label, with the whole row as its click target and the radio as its only tab stop.                                                                                      |
| End-user impact         | People can click anywhere on an option to choose it, and keyboard users reach one control per option. An item-disabled option, or one in a group disabled without a reason, leaves the tab order; a focused disabled option shows the row outline but no indicator ring. |
| Builder impact          | None.                                                                                                                                                                                                                                                                    |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. Native `disabled`, two focus indicators, the missing indicator ring on a disabled option, and the `startContent` docs are listed under Current-state impact.                                                   |
| Review checks           | Reject a second tab stop on the row, a link in the label that selects the option, a description that is not linked, a theme target off the painted row, or a selection while disabled.                                                                                   |
| Governing rules         | `component:RadioList`; `spec:AST-085` FR1–FR3, FR6; `design:user-states` DR1, DR2 (pressed overlay); `architecture:interaction-modality` INV1–INV3.                                                                                                                      |

This table is a review projection; the body below is authoritative.

## Intent

RadioListItem is one option in a RadioList. It owns the option's native radio,
naming and description, row-surface click delegation, item disabled state,
pressed and hover feedback on the radio, and the `radio-list-item` target.
Consumer usage lives in `RadioListItem.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public prop, default,
  export, or DOM change
- Controlled/uncontrolled behavior: controlled by the parent RadioList's
  `value`
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The option's native radio, its name, description link, and form value.
- Row-surface click delegation to the radio and `onClick` routing.
- Item disabled state and the disabled, selected, and size reflection on
  `radio-list-item`.
- The radio indicator's hover tint and pressed overlay, and its focus ring (FR7,
  OQ1).
- The bare default row appearance.

**Does not own / non-goals**

- The group, its value, name, size, disabled reason, and required and status
  semantics — owned by `component:RadioList`.
- Row layout of label, description, start and end content — owned by Item.
- The radio indicator's paint — owned by the Indicator registry's radio
  indicator.
- Use outside RadioList — not supported; it throws.

## Public concepts

| Concept  | Closed values or states                     | Meaning                                                        | Availability by variant/orientation/state | Default        | Owner                     | Stability | Invalid-value behavior                           |
| -------- | ------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- | -------------- | ------------------------- | --------- | ------------------------------------------------ |
| Naming   | `label` node or text; `aria-label`          | Names the radio; `aria-label` replaces the visible-label name. | Always.                                   | label required | `component:RadioListItem` | Stable    | TypeScript rejects a missing label.              |
| Value    | string                                      | The value the group selects and submits.                       | Always.                                   | required       | `component:RadioListItem` | Stable    | TypeScript rejects a missing value.              |
| Disabled | off, item, group, group with reason         | Blocks selection.                                              | Always.                                   | off            | `component:RadioListItem` | Stable    | Not applicable.                                  |
| Content  | `description`, `startContent`, `endContent` | Supporting text and caller content around the label.           | Always.                                   | none           | caller                    | Stable    | A description that renders nothing adds no link. |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| FR1  | RadioListItem throws when rendered outside a RadioList.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source                                                                    |
| FR2  | The option renders an Item row whose start content is a visually hidden native `<input type="radio">` (the group's `name`, this `value`, checked when the group value matches) layered over the radio indicator, followed by any `startContent`.                                                                                                                                                                                                                                                                                                                                                        | Current source and tests                                                          |
| FR3  | The radio is named by the visible label element through `aria-labelledby`, for text and node labels alike; `aria-label` replaces that name and never reaches the row. A renderable `description` is linked through `aria-describedby`; one that renders nothing adds no link.                                                                                                                                                                                                                                                                                                                           | Current tests                                                                     |
| FR4  | The radio is the option's only tab stop. Clicks on the row surface (label, description, empty area) are delegated to the radio; links and buttons inside the label, description, or end content keep their own behavior. A caller `onClick`, typed for the row, runs on the radio for direct and delegated clicks; that routing is shipped behavior, not a requirement until OQ2 is ruled.                                                                                                                                                                                                              | WCAG 4.1.2; current tests                                                         |
| FR5  | Selecting the radio calls the group's `onChange(value)` unless the option is disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current tests                                                                     |
| FR6  | Disabled when the item or the group is disabled. A disabled radio MUST stay focusable with `aria-disabled="true"`, be detached from the form, and refuse selection (`spec:AST-085` FR1–FR3); disabled options show no hover tint or pressed overlay. Implementation gap: only a group-disabled radio with a group reason renders that shape; an item-disabled radio, and a group-disabled radio without a reason, get native `disabled`, which removes them from the tab order. A focusable disabled radio also still runs a caller `onClick`, on a click or an arrow key onto it (`spec:AST-085` FR2). | `spec:AST-085`; current source and tests                                          |
| FR7  | Keyboard focus on the radio paints the shared focus ring on the radio indicator, and Item's row focus-within outline on the row. One focus move MUST have one owning indicator (`architecture:interaction-modality` INV3); which element owns it is OQ1. Implementation gap: both paint. On a focused disabled option the indicator ring is skipped, against `spec:AST-085` FR6; only the row outline shows, and whether it is enough follows OQ1.                                                                                                                                                      | `architecture:interaction-modality` INV1–INV3; `spec:AST-085` FR6; current source |
| FR8  | Hovering the enabled row tints the radio indicator. RadioListItem applies `design:user-states` DR1 and DR2 for the pressed overlay, painting it on the indicator while the enabled row is pressed. The row itself paints no padding, radius, hover, or press background by default.                                                                                                                                                                                                                                                                                                                     | `design:user-states`; current tests                                               |
| FR9  | The radio's hit area is at least 24 by 24 CSS pixels on coarse pointers, and its position follows the inline direction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | WCAG 2.5.8; current tests                                                         |
| FR10 | Under forced colors, the selected dot stays visible.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | WCAG 1.4.11; current tests                                                        |
| FR11 | The painted row element carries `astryx-radio-list-item` (alongside Item's own target) and reflects `data-size`, `data-selected` when checked, and `data-disabled` when disabled. A theme's `radio-list-item` styles override the bare default row.                                                                                                                                                                                                                                                                                                                                                     | `architecture:component-theming-surface` INV6; current tests                      |
| FR12 | `ref`, `className`, `style`, `xstyle`, `align`, `data-*`, `id`, and ARIA other than `aria-label` reach the row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current tests                                                                     |

### Allowed variation

- **AV1 — Content.** Label, description, start and end content vary within
  their types.
- **AV2 — Theme paint.** Themes may restore row padding, radius, hover, and
  selected paint through `radio-list-item`.

### Representative states

| State         | Required invariant                                                                                                                                                                               | Allowed variation |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| Unselected    | Radio named by label; row click selects.                                                                                                                                                         | Content.          |
| Selected      | Radio checked; `data-selected`; dot visible under forced colors.                                                                                                                                 | Theme paint.      |
| Rich label    | Name from the label text; a link inside it does not select.                                                                                                                                      | —                 |
| Item disabled | Focusable with `aria-disabled`; no hover or press feedback; the focus indicator shows under keyboard focus. Implementation gap: native `disabled`, and the indicator ring is skipped (FR6, FR7). | —                 |

### Transformation and precedence order

- **ORD1 — Name.** `aria-label`, else the visible label element.
- **ORD2 — Availability.** Group disabled or item disabled; only the group
  reason keeps the radio focusable.

### Performance and resources

- **PR1 — Bounded resources.** The item owns no observer or global listener; its
  press feedback uses the shared press controller.

## Accessibility contract

- **AR1 — Radio semantics.** Each option is a native radio with a name,
  optional description, and checked state.
- **AR2 — One tab stop.** FR4.
- **AR3 — Target size.** FR9.
- **AR4 — Non-color state.** FR10.

## Design relationships

| Anatomy or state | Design requirement                                      | Representation authority                                                                                | Hierarchy role | Component contract |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------- | ------------------ |
| Radio            | Indicator with hover tint, pressed overlay, focus ring. | `design:user-states` for the pressed overlay; current source for the hover tint; FR7 for the focus ring | Prominent      | FR2, FR7, FR8      |
| Label            | Names the option.                                       | Item                                                                                                    | Prominent      | FR3                |
| Description      | Supporting text linked to the radio.                    | Item                                                                                                    | Supporting     | FR3                |
| Row              | Bare, full-width click target.                          | Current source and tests                                                                                | Supporting     | FR4, FR8, FR11     |

No design record beyond `design:user-states` governs RadioListItem.

## Family and system relationships

- `component:RadioList` supplies the name, value, size, and group availability.
- `design:user-states` owns the pressed treatment the radio indicator paints.
- `spec:AST-085` owns disabled focusability; FR6 and FR7 record the gaps.

## Verification map

| Contract                | Verification                                                                                                                                                                                                                                | Representative states                                          | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                 | Audit section                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| FR1                     | Evidence gap: no test renders RadioListItem outside a RadioList                                                                                                                                                                             | —                                                              | —                                                                                                                                                                                                                                                                                                                                                                                                               | `audit:RadioListItem/behavior`      |
| FR2–FR5, ORD1, AR1, AR2 | `RadioList.test.tsx` selection, rich-content, and rest-forwarding cases; `RadioGroup.a11y.test.tsx` and `RadioGroup.a11y.chromium.spec.ts`                                                                                                  | Text and node labels; `aria-label`; description; link in label | A wrong name, dangling description, or link that selects fails. Evidence gap: no test asserts a caller `onClick` on the radio for direct and delegated clicks.                                                                                                                                                                                                                                                  | `audit:RadioListItem/accessibility` |
| FR6, ORD2               | `RadioList.test.tsx` item-disabled and form cases; `RadioGroup.a11y.test.tsx` and `RadioGroup.a11y.chromium.spec.ts` `radio-list-option-disabled`, `radio-list-option-group-disabled`, and `radio-list-option-disabled-with-message` states | Item and group disabled; group reason                          | A disabled option that selects, or a submitted value from a group disabled with a reason, fails; the binding expects `tabReachable: false` for `radio-list-option-group-disabled`, which fails when that gap closes. Evidence gap: no state guards item-disabled focusability, since `radio-list-option-disabled` binds a radio that is not the group's Tab stop. No form case submits an item-disabled option. | `audit:RadioListItem/accessibility` |
| FR7                     | Evidence gap: no test of focus-ring placement on the indicator, the disabled ring, or the indicator count                                                                                                                                   | —                                                              | —                                                                                                                                                                                                                                                                                                                                                                                                               | `audit:RadioListItem/accessibility` |
| FR8                     | `RadioList.test.tsx` pressed-state and bare-row cases; `RadioListItem.press.source-build.test.mjs`                                                                                                                                          | Enabled, disabled, touch                                       | Press paint on a disabled option, or a default row background, fails. Evidence gap: no test asserts the hover tint.                                                                                                                                                                                                                                                                                             | `audit:RadioListItem/visual`        |
| FR9, FR10, AR3, AR4     | `RadioList.test.tsx` coarse-pointer, RTL, and forced-colors cases                                                                                                                                                                           | Coarse pointer; RTL; forced colors                             | Evidence gap: the forced-colors case passes on any matching rule (the checkbox mark supplies one), so it does not prove the dot; the coarse-pointer and RTL cases check only the direction-symmetric centering class, not the 24 by 24 minimum or RTL placement.                                                                                                                                                | `audit:RadioListItem/accessibility` |
| FR11, FR12              | `RadioList.test.tsx` theme-target and rest-forwarding cases                                                                                                                                                                                 | Sizes; selected; disabled                                      | A target off the painted row, or a missing state, fails. Evidence gap: no test asserts `ref`, `className`, `style`, or `xstyle` on the row.                                                                                                                                                                                                                                                                     | `audit:RadioListItem/theming`       |
| PR1                     | Evidence gap: no test asserts the absence of observers or global listeners                                                                                                                                                                  | —                                                              | —                                                                                                                                                                                                                                                                                                                                                                                                               | `audit:RadioListItem/behavior`      |

## Current-state impact

- **Two focus indicators (FR7).** Keyboard focus paints both Item's row outline
  and the radio indicator ring, against `architecture:interaction-modality`
  INV3.
- **Caller onClick while disabled (FR6).** A focusable disabled radio still
  runs a caller's `onClick`, against `spec:AST-085` FR2.
- **Disabled focusability (FR6).** Item-disabled radios, and group-disabled
  radios without a reason, use native `disabled`, against `spec:AST-085` FR1.
- **Disabled focus ring (FR7).** The indicator ring is skipped on a focused
  disabled option, against `spec:AST-085` FR6; only the row outline shows.
- **Consumer docs (FR2).** `RadioListItem.doc.mjs` and the `startContent` prop
  JSDoc in `RadioListItem.tsx` say `startContent` renders before the radio
  circle; it renders after it.

## Decision log

No component-local decision.

## Open questions

- **OQ1 — Which element paints the option's focus ring, the row or the radio
  indicator?** (`human-design`) `architecture:interaction-modality` INV3
  requires one indicator; CheckboxListItem composes the same two painters.
- **OQ2 — Which element owns a caller `onClick`?** (`human-api`) It is typed
  for the row but runs on the radio, as CheckboxListItem's matching open
  question records.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
