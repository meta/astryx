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
    packages/core/src/RadioList/RadioList.focusableDisabled.test.tsx,
    packages/core/src/RadioList/__tests__/RadioListDisabledForm.interaction.browser.spec.ts,
    packages/core/src/RadioList/RadioListItem.press.source-build.test.mjs,
    packages/core/src/RadioList/__tests__/RadioGroup.a11y.test.tsx,
    packages/core/src/RadioList/__tests__/RadioGroup.a11y.chromium.spec.ts,
    apps/storybook/rtl-audit/targets.json,
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

| Area                    | Contract                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | None changes. RadioListItem takes `label`, `aria-label`, `value`, `description`, `isDisabled`, `startContent`, `endContent`, `align`, and base props, and must sit inside a RadioList.                                                           |
| Behavior                | One option row: a visually hidden native radio drawn by the radio indicator, named by the visible label, with the whole row as its click target and the radio as its only tab stop.                                                              |
| End-user impact         | People can click anywhere on an option to choose it, and keyboard users reach one control per option. A disabled option stays reachable by keyboard, announces as disabled, and shows the focus indicator.                                       |
| Builder impact          | None.                                                                                                                                                                                                                                            |
| Compatibility/readiness | No API or default change. A disabled radio renders `aria-disabled` instead of native `disabled`. The pre-hydration value of a selected disabled option, two focus indicators, and the `startContent` docs are listed under Current-state impact. |
| Review checks           | Reject a second tab stop on the row, a link in the label that selects the option, a description that is not linked, a theme target off the painted row, or a selection while disabled.                                                           |
| Governing rules         | `component:RadioList`; `spec:AST-085` FR1–FR3, FR6; `design:user-states` DR1, DR2 (pressed overlay); `architecture:interaction-modality` INV1–INV3.                                                                                              |

This table is a review projection; the body below is authoritative.

## Intent

RadioListItem is one option in a RadioList. It owns the option's native radio,
naming and description, row-surface click delegation, item disabled state,
pressed and hover feedback on the radio, and the `radio-list-item` target.
Consumer usage lives in `RadioListItem.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: nonbreaking; no public prop, default, or export
  change. A disabled radio renders `aria-disabled` instead of native
  `disabled` (FR6).
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

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Basis                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| FR1  | RadioListItem throws when rendered outside a RadioList.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Current source                                                                    |
| FR2  | The option renders an Item row whose start content is a visually hidden native `<input type="radio">` (the group's `name`, this `value`, checked when the group value matches) layered over the radio indicator, followed by any `startContent`.                                                                                                                                                                                                                                                                                                                        | Current source and tests                                                          |
| FR3  | The radio is named by the visible label element through `aria-labelledby`, for text and node labels alike; `aria-label` replaces that name and never reaches the row. A renderable `description` is linked through `aria-describedby`; one that renders nothing adds no link.                                                                                                                                                                                                                                                                                           | Current tests                                                                     |
| FR4  | The radio is the option's only tab stop. Clicks on the row surface (label, description, empty area) are delegated to the radio; links and buttons inside the label, description, or end content keep their own behavior. A caller `onClick`, typed for the row, runs on the radio for direct and delegated clicks; that routing is shipped behavior, not a requirement until OQ2 is ruled.                                                                                                                                                                              | WCAG 4.1.2; current tests                                                         |
| FR5  | Selecting the radio calls the group's `onChange(value)` unless the option is disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current tests                                                                     |
| FR6  | Disabled when the item or the group is disabled. A disabled radio MUST stay focusable with `aria-disabled="true"`, submit no value and never block a submit, refuse selection, and run no caller `onClick` (`spec:AST-085` FR1–FR3). The group's radios stay one native radio group, apart from every other group, with one Tab stop. Disabled options show no hover tint or pressed overlay. Implementation gap: before hydration, server-rendered markup submits a selected, individually disabled option's value; the exclusion applies once the component hydrates. | `spec:AST-085`; current source and tests                                          |
| FR7  | Keyboard focus on the radio paints the shared focus ring on the radio indicator, and Item's row focus-within outline on the row, on an enabled or disabled option alike (`spec:AST-085` FR6). One focus move MUST have one owning indicator (`architecture:interaction-modality` INV3); which element owns it is OQ1. Implementation gap: both paint.                                                                                                                                                                                                                   | `architecture:interaction-modality` INV1–INV3; `spec:AST-085` FR6; current source |
| FR8  | Hovering the enabled row tints the radio indicator. RadioListItem applies `design:user-states` DR1 and DR2 for the pressed overlay, painting it on the indicator while the enabled row is pressed. The row itself paints no padding, radius, hover, or press background by default.                                                                                                                                                                                                                                                                                     | `design:user-states`; current tests                                               |
| FR9  | The radio's hit area is at least 24 by 24 CSS pixels on coarse pointers, and its position follows the inline direction.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | WCAG 2.5.8; current tests                                                         |
| FR10 | Under forced colors, the selected dot stays visible.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | WCAG 1.4.11; current tests                                                        |
| FR11 | The painted row element carries `astryx-radio-list-item` (alongside Item's own target) and reflects `data-size`, `data-selected` when checked, and `data-disabled` when disabled. A theme's `radio-list-item` styles override the bare default row.                                                                                                                                                                                                                                                                                                                     | `architecture:component-theming-surface` INV6; current tests                      |
| FR12 | `ref`, `className`, `style`, `xstyle`, `align`, `data-*`, `id`, and ARIA other than `aria-label` reach the row.                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current tests                                                                     |

### Allowed variation

- **AV1 — Content.** Label, description, start and end content vary within
  their types.
- **AV2 — Theme paint.** Themes may restore row padding, radius, hover, and
  selected paint through `radio-list-item`.

### Representative states

| State         | Required invariant                                                                                          | Allowed variation |
| ------------- | ----------------------------------------------------------------------------------------------------------- | ----------------- |
| Unselected    | Radio named by label; row click selects.                                                                    | Content.          |
| Selected      | Radio checked; `data-selected`; dot visible under forced colors.                                            | Theme paint.      |
| Rich label    | Name from the label text; a link inside it does not select.                                                 | —                 |
| Item disabled | Focusable with `aria-disabled`; no hover or press feedback; the focus indicator shows under keyboard focus. | —                 |

### Transformation and precedence order

- **ORD1 — Name.** `aria-label`, else the visible label element.
- **ORD2 — Availability.** Group disabled or item disabled; every disabled
  radio stays focusable.

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
- `spec:AST-085` owns disabled focusability; RadioListItem meets its FR1, FR2
  and FR6, and FR3 once hydrated (FR6's implementation gap).

## Verification map

| Contract                | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                  | Representative states                                                                                                                 | Mutation or failure expectation                                                                                                                                                                                                                                  | Audit section                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| FR1                     | Evidence gap: no test renders RadioListItem outside a RadioList                                                                                                                                                                                                                                                                                                                                                                               | —                                                                                                                                     | —                                                                                                                                                                                                                                                                | `audit:RadioListItem/behavior`      |
| FR2–FR5, ORD1, AR1, AR2 | `RadioList.test.tsx` selection, rich-content, and rest-forwarding cases; `RadioGroup.a11y.test.tsx` and `RadioGroup.a11y.chromium.spec.ts`                                                                                                                                                                                                                                                                                                    | Text and node labels; `aria-label`; description; link in label                                                                        | A wrong name, dangling description, or link that selects fails. Evidence gap: no test asserts a caller `onClick` on the radio for direct and delegated clicks.                                                                                                   | `audit:RadioListItem/accessibility` |
| FR6, ORD2               | `RadioList.test.tsx` item-disabled and form cases; `RadioList.focusableDisabled.test.tsx` focusability, click, required, and form-owner cases; `RadioListDisabledForm.interaction.browser.spec.ts` submitted entries and validity in a real browser; `RadioGroup.a11y.test.tsx` and `RadioGroup.a11y.chromium.spec.ts` `radio-list-option-disabled`, `radio-list-option-group-disabled`, and `radio-list-option-disabled-with-message` states | Item and group disabled; group reason; selected option disabled; every option disabled and required; a shared field name in two forms | A native `disabled` attribute, a disabled option that selects or runs a caller `onClick`, a submitted disabled value, a blocked submit, or a split or merged native group fails.                                                                                 | `audit:RadioListItem/accessibility` |
| FR7                     | Evidence gap: no test of focus-ring placement on the indicator or the indicator count; the disabled ring is checked in a real browser only                                                                                                                                                                                                                                                                                                    | —                                                                                                                                     | —                                                                                                                                                                                                                                                                | `audit:RadioListItem/accessibility` |
| FR8                     | `RadioList.test.tsx` pressed-state and bare-row cases; `RadioListItem.press.source-build.test.mjs`                                                                                                                                                                                                                                                                                                                                            | Enabled, disabled, touch                                                                                                              | Press paint on a disabled option, or a default row background, fails. Evidence gap: no test asserts the hover tint.                                                                                                                                              | `audit:RadioListItem/visual`        |
| FR9, FR10, AR3, AR4     | `RadioList.test.tsx` coarse-pointer, RTL, and forced-colors cases                                                                                                                                                                                                                                                                                                                                                                             | Coarse pointer; RTL; forced colors                                                                                                    | Evidence gap: the forced-colors case passes on any matching rule (the checkbox mark supplies one), so it does not prove the dot; the coarse-pointer and RTL cases check only the direction-symmetric centering class, not the 24 by 24 minimum or RTL placement. | `audit:RadioListItem/accessibility` |
| FR11, FR12              | `RadioList.test.tsx` theme-target and rest-forwarding cases                                                                                                                                                                                                                                                                                                                                                                                   | Sizes; selected; disabled                                                                                                             | A target off the painted row, or a missing state, fails. Evidence gap: no test asserts `ref`, `className`, `style`, or `xstyle` on the row.                                                                                                                      | `audit:RadioListItem/theming`       |
| PR1                     | Evidence gap: no test asserts the absence of observers or global listeners                                                                                                                                                                                                                                                                                                                                                                    | —                                                                                                                                     | —                                                                                                                                                                                                                                                                | `audit:RadioListItem/behavior`      |
| RTL relation            | RTL audit curated D2 target (`apps/storybook/rtl-audit/targets.json`) on `RadioList / Default`                                                                                                                                                                                                                                                                                                                                                | Indicator and label; LTR and RTL                                                                                                      | An indicator that is not at the inline start of its label fails D2.                                                                                                                                                                                              | `audit:RadioListItem/i18n-rtl`      |

## Current-state impact

- **Selected disabled option before hydration (FR6).** Server-rendered markup
  submits a selected, individually disabled option's value until the component
  hydrates, against `spec:AST-085` FR3.
- **Two focus indicators (FR7).** Keyboard focus paints both Item's row outline
  and the radio indicator ring, against `architecture:interaction-modality`
  INV3.
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
