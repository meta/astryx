---
schema_version: 3
template_version: 7
kind: component
id: component:CheckboxInput
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
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
    packages/core/src/CheckboxInput/CheckboxInput.test.tsx,
    packages/core/src/CheckboxInput/__tests__/Checkbox.a11y.test.tsx,
    packages/core/src/CheckboxInput/__tests__/Checkbox.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    packages/core/src/__tests__/BusyOwnerAnnouncement.test.tsx,
  ]
modules: []
families: []
design_specs: [design:user-states]
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:component-test-sufficiency,
    architecture:interaction-modality,
  ]
contributing: []
system_specs: [spec:AST-021, spec:AST-085, spec:AST-086]
---

# CheckboxInput component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `CheckboxInput` is a controlled native checkbox with a required `label` and `value`; it supports synchronous and transition-backed change handlers, loading, disabled, disabled-reason, read-only, validation, sizing, and field content.                                                                |
| Behavior                | The native input owns role, state, focus, form participation, and activation. A replaceable CheckboxIndicator owns the visible box while CheckboxInput owns its focus ring and pressed overlay.                                                                                                          |
| End-user impact         | People can identify and operate available choices, review inert values as read-only, discover disabled reasons from the keyboard, and perceive busy, validation, focus, and pressed states.                                                                                                              |
| Builder impact          | None. Builders control the value and may use `onChange`, `changeAction`, or both; the meaning of omitting both stays an open question (OQ1).                                                                                                                                                             |
| Compatibility/readiness | Records shipped behavior; no API, default, or DOM change. A handlerless checkbox declares no read-only state, a mixed value can lose its native mixed state on activation, and caller key handlers run while disabled; all are listed under Current-state impact.                                        |
| Review checks           | Reject state/name drift, duplicate activation, disabled or read-only mutation, lost form semantics, missing focus/pressed feedback, inaccessible supporting text, or target ownership changes.                                                                                                           |
| Governing rules         | `spec:AST-021/FR4–FR10`; `spec:AST-085/FR1–FR3`; `design:user-states/DR1–DR5`; `architecture:interaction-modality/INV1–INV5,INV9`; `architecture:public-component-api/INV1,INV5–INV9`; `architecture:component-theming-surface/INV3–INV8,INV12`; WCAG 2.2 1.3.1, 1.4.11, 2.1.1, 2.4.7, 3.3.1, and 4.1.2. |

This table is a review projection; the body below is authoritative.

## Intent

Render one controlled checkbox choice whose visible value, accessible state, interaction availability, and supporting field content remain aligned across pointer, keyboard, touch, forms, and assistive technology.

## Compatibility and migration

- Released default preserved: yes
- Compatibility class: records shipped behavior; no public prop, default, export, or DOM change
- Controlled/uncontrolled behavior: controlled only; `value` remains required and all state changes remain caller-owned
- Migration decision: none; handlerless semantics stay open (OQ1)

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- Native checkbox role, checked/mixed state, label, description/status relationships, focus, activation, availability, read-only state, required/invalid/busy state, and form participation.
- Composition of the resolved checkbox indicator, owner-painted focus ring and pressed overlay, disabled-reason tooltip, field label, description, and detached status.
- Ordering between `onChange`, `preventDefault`, optimistic pending state, and `changeAction`.

**Does not own / non-goals**

- The checkbox indicator's internal paint and theme targets — owned by CheckboxIndicator and the Indicator registry.
- Multi-option grouping, collection values, and group-level disabled reasons — owned by CheckboxList.
- Generic label, status-message, spinner, tooltip, or icon implementation.
- A new uncontrolled/default-value API or any change to checked-value serialization.

## Public concepts

| Concept        | Closed values or states                   | Meaning                                                                                                                              | Availability by variant/orientation/state               | Default               | Owner                      | Stability                              | Invalid-value behavior                       |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | --------------------- | -------------------------- | -------------------------------------- | -------------------------------------------- |
| value          | `false`, `true`, `indeterminate`          | Controlled visible and native checkbox state.                                                                                        | All paths.                                              | required              | caller                     | stable                                 | rejected by the public type                  |
| change path    | `onChange`, `changeAction`, both, neither | Accepts immediate and/or transition-backed user intent; neither leaves the controlled value inert but does not settle its semantics. | Enabled, non-busy controls.                             | neither               | caller and component       | shipped; handlerless meaning unsettled | no handler means no component-owned mutation |
| availability   | enabled, disabled, disabled with reason   | Controls activation, form submission, opacity, and reason discovery.                                                                 | All values.                                             | enabled               | component                  | stable                                 | disabled wins over activation                |
| read-only      | explicit                                  | Preserves a focusable, full-opacity controlled value while blocking mutation.                                                        | All values; disabled may coexist and wins availability. | false                 | component                  | stable                                 | boolean only                                 |
| busy           | explicit loading or optimistic transition | Preserves focus, blocks duplicate change, exposes busy state, and replaces the indicator mark with Spinner.                          | Enabled and read-only values.                           | false                 | component                  | stable                                 | boolean/transition state only                |
| field content  | label, description, status, labelIcon     | Names and explains the choice and communicates validation.                                                                           | All values and availability states.                     | label required        | caller and composed owners | stable                                 | typed values only                            |
| size and width | `sm`, `md`; `SizeValue`                   | Sizes the indicator row and the complete field.                                                                                      | All states.                                             | `md`; intrinsic width | component                  | stable                                 | rejected by public types                     |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Basis                                                                                                               |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| FR1  | The role-bearing element MUST remain a native `input[type=checkbox]` named by the rendered label, with `checked` derived from the shown value being `true` and the native `indeterminate` property from the shown value being `'indeterminate'`; the shown value is `value`, or the pending optimistic value (ORD1). Implementation gap: activating a mixed checkbox whose `value` stays mixed (no handler, or an `onChange` that keeps it) clears the native mixed state, and only the disabled, busy, or read-only path restores it, so the input reads as not checked while the indicator shows mixed. | shipped source; shared checkbox contract; WCAG 4.1.2                                                                |
| FR2  | Enabled activation MUST call `onChange` first with the next boolean value, then call `changeAction` only when present and the event was not prevented.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | shipped source and component tests                                                                                  |
| FR3  | While `isLoading`, or while the shown value differs from `value` (a pending `changeAction` whose value `value` has not accepted), the input MUST expose busy state, refuse another change, show Spinner in the indicator without losing focus, and announce the busy start once (`spec:AST-086` FR8).                                                                                                                                                                                                                                                                                                     | shipped source, tests, and stories; `architecture:interaction-modality/INV5`                                        |
| FR4  | `isDisabled` MUST keep the input focusable with `aria-disabled="true"` and no native `disabled`, block every change and the caller `onClick`, withhold `name`, and detach the input from its form so it neither submits nor blocks submission. With `disabledMessage`, a tooltip opens on row hover and keyboard focus and describes the input. Implementation gap: other caller DOM handlers, such as `onKeyDown`, still run while disabled.                                                                                                                                                             | `spec:AST-085` FR1–FR3; shipped source and component tests; WCAG 2.1.1 and 4.1.2                                    |
| FR5  | Explicit `isReadOnly` MUST preserve the controlled value and ordinary focusability, expose read-only state, remain full-opacity, and refuse mutation.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | shipped source and shared checkbox binding; WCAG 4.1.2                                                              |
| FR6  | Description, status, disabled reason, and caller-provided `aria-describedby` ids MUST compose without dropping any source; error status MUST expose invalid state.                                                                                                                                                                                                                                                                                                                                                                                                                                        | shipped source and tests; WCAG 1.3.1, 3.3.1, 4.1.2                                                                  |
| FR7  | Explicit required state MUST retain native form validation; inherited required presentation MUST expose `aria-required` without silently enabling native validation.                                                                                                                                                                                                                                                                                                                                                                                                                                      | shipped source and shared checkbox binding                                                                          |
| FR8  | Caller DOM props MUST reach the input, while component-owned type, checked, disabled, read-only, required, busy, invalid, description, ref, and styling values retain precedence.                                                                                                                                                                                                                                                                                                                                                                                                                         | `architecture:public-component-api/INV5–INV8`; component tests                                                      |
| FR9  | The outer field MUST retain `checkbox-input`, the label MUST retain `checkbox-label`, and the built-in CheckboxIndicator path MUST retain its canonical targets. Replacement indicators are not required to accept target classes.                                                                                                                                                                                                                                                                                                                                                                        | source/docs target inventory; replacement component tests; `architecture:component-theming-surface/INV4–INV8,INV12` |
| FR10 | Keyboard/programmatic focus on the hidden native input MUST paint the shared focus-visible outline on the resolved indicator element, including a replacement indicator that forwards no props.                                                                                                                                                                                                                                                                                                                                                                                                           | `architecture:interaction-modality/INV1–INV3`; component tests                                                      |
| FR11 | CheckboxInput applies `design:user-states` DR1 and DR2 for the pressed overlay, painting it on the indicator while the row is pressed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `design:user-states/DR1–DR5`                                                                                        |
| FR12 | `sm` and `md` MUST keep the native input, indicator, focus paint, and row geometry aligned; field `width` MUST size the whole field rather than only the input.                                                                                                                                                                                                                                                                                                                                                                                                                                           | shipped source, tests, and stories                                                                                  |
| FR13 | With neither `onChange` nor `changeAction`, activation changes nothing the caller can observe. Implementation gap: the checkbox declares no read-only or unavailable state; its meaning is OQ1 (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                    | shared checkbox known-failure record                                                                                |

### Allowed variation

- **AV1 — Indicator replacement.** A theme may replace the named checkbox indicator if it preserves the Indicator prop and decorative ownership contracts; CheckboxInput still paints focus and pressed feedback on the resolved root.
- **AV2 — Theme paint.** Canonical component targets and semantic tokens may change admitted visual properties without changing native semantics, state precedence, or interaction ownership.
- **AV3 — Caller field content.** Label, description, status text, icon/content, and width may vary within their public types.

### Representative states

| State                     | Required invariant                                                                                                | Allowed variation                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| unchecked, checked, mixed | Native and visual states agree; activation proposes the next boolean value.                                       | Theme-owned paint and indicator replacement. |
| loading/pending           | Focus remains; busy is exposed; duplicate change is blocked; Spinner replaces the mark.                           | Caller-controlled loading duration.          |
| disabled                  | Focusable with `aria-disabled`; inoperable; excluded from form data.                                              | Optional disabled-reason text.               |
| read-only                 | Explicit `isReadOnly` keeps the value visible, focusable, submitted, and immutable with read-only semantics.      | Caller-controlled explicit state.            |
| handlerless               | Activation changes nothing the caller can observe; its read-only or unavailable meaning is OQ1 (known gap today). | —                                            |
| invalid/status            | Status is described and errors expose invalid state.                                                              | Error, warning, or success content.          |
| hidden label              | The label remains in the accessibility tree and names the input.                                                  | Visual hiding only.                          |

### Transformation and precedence order

- **ORD1 — State precedence.** Controlled `value` → optimistic pending value → visible indicator state.
- **ORD2 — Activation precedence.** disabled/busy/read-only guard → next native boolean → `onChange` → `preventDefault` check → optimistic `changeAction`.
- **ORD3 — Availability precedence.** disabled owns availability and form exclusion; a disabled reason changes focusability but not operability; read-only applies only to value mutation.
- **ORD4 — Attribute precedence.** caller rest props → component-owned semantic/form attributes → component-owned StyleX props.

### Performance and resources

- **PR1 — Bounded resources.** The component owns no global listener or observer. Tooltip and transition resources remain scoped to their existing hooks and component lifetime.

## Accessibility contract

- **AR1 — Native checkbox semantics.** Name, role, checked/mixed state, required, invalid, busy, disabled, and read-only state MUST remain programmatically determinable.
- **AR2 — Keyboard parity.** Space activation follows the same availability and change-order rules as pointer activation; focus remains on the native input.
- **AR3 — Focus visibility.** The hidden input's focus MUST remain visibly represented on the indicator for keyboard modality, including indicator replacements.
- **AR4 — Supporting content.** Visible descriptions, statuses, and disabled reasons MUST be referenced without replacing caller descriptions.
- **AR5 — Visual state.** Meaningful checkbox boundaries, marks, focus rings, and busy indicators MUST remain perceivable under supported themes and forced colors.

## Design relationships

| Anatomy or state | Design requirement                                                              | Representation authority                                               | Hierarchy role      | Component contract      |
| ---------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------- | ----------------------- |
| Checkbox         | Visible state cue, pressed overlay, and focus ring align with the native input. | Indicator owner plus `design:user-states` and interaction architecture | primary control     | FR1, FR3–FR5, FR10–FR12 |
| Label            | Visible or visually hidden text names the native input.                         | FieldLabel composition                                                 | primary content     | FR1, FR6                |
| Description      | Supporting text remains associated without entering the accessible name.        | FieldLabel composition                                                 | supporting content  | FR6                     |
| Status message   | Detached status communicates validation and participates in description.        | FieldStatus composition                                                | supporting feedback | FR6                     |

The consumer record includes composed targets owned by CheckboxIndicator, FieldLabel, and FieldStatus, which keep their own target ownership; this record carries no anatomy-theming map.

## Family and system relationships

- `spec:AST-021` owns the reusable checkbox accessibility binding, state inventory, evidence layers, and exact known-failure lifecycle.
- `design:user-states` owns enabled/disabled pointer-hold paint for CheckboxInput.
- `architecture:interaction-modality` owns focus-visibility modality and the boundary between semantic focus and indicator paint.
- `architecture:component-theming-surface` owns target placement and state reflection.
- `spec:AST-085` owns disabled focusability; FR4 records the handler gap.
- `spec:AST-086` FR8 owns the busy announcement.
- CheckboxIndicator, FieldLabel, FieldStatus, Spinner, Tooltip, and the Indicator registry retain their own implementation and theming ownership when composed here.

## Verification map

| Contract                    | Verification                                                                                                                                                                                                                                                                                                                           | Representative states                                                                                                   | Mutation or failure expectation                                                                                                                                                                                                    | Audit section                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| FR1, FR4–FR7, FR13, AR1–AR4 | `Checkbox.a11y.test.tsx` and `Checkbox.a11y.chromium.spec.ts` over the shared state list                                                                                                                                                                                                                                               | Value states; hidden and described label; disabled; disabled reason; loading; read-only; handlerless; required; invalid | A role, name, state, focusability, or description expectation fails, or a removed known failure becomes stale.                                                                                                                     | `audit:CheckboxInput/a11y`     |
| FR2, FR3                    | `CheckboxInput.test.tsx` change, changeAction-only, and loading cases; `BusyOwnerAnnouncement.test.tsx` CheckboxInput case                                                                                                                                                                                                             | Click, label click, description click; `isLoading`                                                                      | A wrong `onChange` value, a missing `aria-busy`, or a busy start announced more than once, or by the Spinner, fails. Evidence gap: no test asserts `changeAction` after `onChange` with `preventDefault`, or the optimistic value. | `audit:CheckboxInput/behavior` |
| FR4, FR6, FR7               | `CheckboxInput.test.tsx` disabled, disabledMessage, description, status, and form suites                                                                                                                                                                                                                                               | Disabled with and without reason; required; error                                                                       | A toggling disabled box, a submitted disabled value, or a dropped description fails. Evidence gap: no test asserts that caller `onKeyDown` still runs while disabled (the FR4 gap).                                                | `audit:CheckboxInput/behavior` |
| FR8                         | `CheckboxInput.test.tsx` passthrough, id, ref, and rest-precedence cases                                                                                                                                                                                                                                                               | Caller `id`, `data-*`, ref                                                                                              | A caller prop overriding `checked`, `disabled`, or `type` fails.                                                                                                                                                                   | `audit:CheckboxInput/api`      |
| FR9                         | `CheckboxInput.test.tsx` label-target case; `themingTargets.test.ts`                                                                                                                                                                                                                                                                   | Label; built-in indicator                                                                                               | A missing label target, or a rendered class absent from the documented targets, fails. Evidence gap: no test asserts the root `checkbox-input` target.                                                                             | `audit:CheckboxInput/theming`  |
| FR10, AR3                   | `CheckboxInput.test.tsx` focus-ring ownership suite                                                                                                                                                                                                                                                                                    | Built-in and prop-dropping replacement indicators; blur                                                                 | A ring on the wrong element, or none, fails.                                                                                                                                                                                       | `audit:CheckboxInput/a11y`     |
| FR11                        | `CheckboxInput.test.tsx` pressed-state suite                                                                                                                                                                                                                                                                                           | Enabled press; disabled; touch fade                                                                                     | A missing overlay, or one on a disabled box, fails.                                                                                                                                                                                | `audit:CheckboxInput/visual`   |
| FR12, AR5                   | `CheckboxInput.test.tsx` coarse-pointer, RTL, and forced-colors suites                                                                                                                                                                                                                                                                 | `sm`, `md`; RTL; forced colors                                                                                          | A misplaced hit target or a mark lost in forced colors fails. Evidence gap: no test asserts field `width`.                                                                                                                         | `audit:CheckboxInput/layout`   |
| ORD1–ORD4, PR1              | ORD4 is covered by the FR8 rest-precedence case and ORD3 by the shared accessibility suite's disabled, disabled-reason, and read-only states. Evidence gap: no test asserts the optimistic value between `value` and the indicator (ORD1), the `preventDefault` check before `changeAction` (ORD2), or the absence of global listeners | —                                                                                                                       | —                                                                                                                                                                                                                                  | `audit:CheckboxInput/behavior` |

## Current-state impact

- **Mixed state after activation (FR1, FR13).** Activating a mixed
  CheckboxInput whose `value` stays mixed clears the native mixed state while
  the indicator still shows mixed, so assistive technology reads it as not
  checked (WCAG 2.2 4.1.2).
- **Handlerless checkbox (FR13).** A CheckboxInput with neither handler
  declares no read-only state, so accessibility consumers cannot tell its fixed
  value from an editable one (WCAG 2.2 4.1.2). The shared checkbox suite
  records this as a known failure; the intended meaning is OQ1.
- **Caller handlers while disabled (FR4).** Caller DOM handlers other than
  `onClick`, such as `onKeyDown`, still run while disabled, against
  `spec:AST-085` FR2.

## Decision log

No component-local decision. CheckboxInput applies `spec:AST-021`, `spec:AST-085`, and `design:user-states`.

## Open questions

- **OQ1 — What does a controlled CheckboxInput with neither `onChange` nor `changeAction` mean?** (`human-api`) Current behavior is inert while exposed as editable. The options are read-only, unavailable, or invalid usage.

## Content boundary

This file does not duplicate consumer prop tables/examples, implementation steps, generated evidence, or shared-component contracts. It links to their owners.
