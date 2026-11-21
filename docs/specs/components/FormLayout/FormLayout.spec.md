---
schema_version: 3
template_version: 7
kind: component
id: component:FormLayout
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-28
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Layer/layerScopedContext.test.tsx,
    .github/scripts/story-play-guard.js,
    .github/visual-baseline/manifest.json,
    packages/core/src/FormLayout/FormLayout.test.tsx,
    apps/storybook/stories/FormLayout.stories.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    packages/core/src/docPropLiterals.test.ts,
    packages/core/src/docPropReferences.test.ts,
  ]
modules: []
families: [family:input-fields]
design_specs: []
architecture:
  [
    architecture:public-component-api,
    architecture:component-theming-surface,
    architecture:component-test-sufficiency,
  ]
contributing: []
system_specs: [spec:AST-038, spec:AST-117]
---

# FormLayout component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `FormLayout` arranges caller-owned fields through `vertical`, `horizontal`, and `horizontal-labels` directions, provides form-level optionality and entry error behavior defaults, exports its context and supporting types, and accepts root `BaseProps`.                        |
| Behavior                | Vertical stacks children; horizontal creates one fractional grid track per child in logical inline order; horizontal-labels pairs Field labels and controls, then collapses below a 481px viewport.                                                                               |
| End-user impact         | People encounter predictable field spacing and order, and assistive technology receives required-state information even when the form-wide visual convention leaves the common case unmarked.                                                                                     |
| Builder impact          | Builders supply the fields and any semantic `<form>`, title, or footer; nested layouts replace the outer direction, optionality, and entry error behavior context for their descendants.                                                                                          |
| Compatibility/readiness | Released behavior recorded as current, plus the optional `defaultEntryErrorBehavior` prop (FR7), which leaves fields at their shipped behavior when unset.                                                                                                                        |
| Review checks           | Reject lost root props, physical inline ordering, changed collapse boundaries, caller-overridable direction reflection, lost nested-context shadowing, a visible optionality convention that disagrees with ARIA, or an entry error behavior default that outranks a field's own. |
| Governing rules         | Established public FormLayout interface; `family:input-fields` outer-arrangement ownership; `architecture:public-component-api/INV5–INV9`; `architecture:component-theming-surface/INV2–INV6`.                                                                                    |

This table is a review projection; the body below is authoritative.

## Intent

`FormLayout` owns the outer spatial relationship among caller-owned form fields. It does not create form submission, field state, labels, controls, or action regions.

## Compatibility and migration

- Released default preserved: yes; direction defaults to `vertical`, optionality remains field-owned when `defaultOptionality` is unset, and fields keep their shipped `'complete'` behavior when `defaultEntryErrorBehavior` is unset.
- Compatibility class: additive; `defaultEntryErrorBehavior` is a new optional prop (`spec:AST-117` FR2); no other public prop, default, or behavior changes.
- Controlled/uncontrolled behavior: not applicable; FormLayout owns no form value or submission state.
- Migration decision: none.

## Ownership boundary

**Owns**

- Outer field arrangement, spacing, direction, and the viewport collapse for horizontal labels.
- Form-level optionality and entry error behavior context, and nested-layout shadowing.
- The root DOM element, root prop composition, and the `form-layout` theme target.

**Does not own / non-goals**

- Form semantics, submission, validation, or action placement — owned by the product callsite and native `<form>`. FormLayout passes only the default moment at which inputs reveal their own rejections (FR7).
- Field labels, controls, status, and internal geometry — owned by `component:Field`, each input, and `family:input-fields`.
- The content or visual contract of caller-supplied titles and footers — owned by their rendered components or the callsite.

## Public concepts

| Concept              | Closed values or states                          | Meaning                                                                           | Availability by variant/orientation/state                    | Default              | Owner                  | Stability | Invalid-value behavior |
| -------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------- | ---------------------- | --------- | ---------------------- |
| direction            | `vertical`; `horizontal`; `horizontal-labels`    | Selects the outer arrangement and provides that value to descendants.             | All layouts.                                                 | `vertical`           | `component:FormLayout` | Stable    | Type-constrained       |
| default optionality  | unset; `optional`; `required`                    | Marks only exceptions while controls preserve resolved required state.            | All directions; the nearest nested layout shadows the outer. | unset / per-field    | `component:FormLayout` | Stable    | Type-constrained       |
| root composition     | DOM/data/ARIA/events; ref; class/style/`xstyle`  | Extends the root layout container without replacing owned reflection.             | All directions.                                              | no caller decoration | `component:FormLayout` | Stable    | Shared merge contract  |
| entry error behavior | unset; `complete`; `blur-or-enter`               | Sets when descendant inputs reveal their own rejections; a field's own prop wins. | All directions; the nearest nested layout shadows the outer. | unset / `complete`   | `spec:AST-117`         | Stable    | Type-constrained       |
| layout context       | direction, optionality, and entry error behavior | Lets Field and inputs adapt layout, required state, and rejection timing.         | Descendants in the same layer scope.                         | vertical / unset     | `component:FormLayout` | Stable    | Nearest provider wins  |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Basis                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| FR1 | `vertical` (the default) stacks children in a flex column with a `--spacing-4` gap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Released source, tests, and stories                             |
| FR2 | `horizontal` places every direct child in one `1fr` grid column in the document's logical inline order, with a `--spacing-4` gap and no component-owned wrap rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Released source, tests, and stories                             |
| FR3 | `horizontal-labels` is a two-column grid (`auto 1fr`) with a `--spacing-3` row gap and `--spacing-4` column gap, items aligned to the start, so Field labels sit on the inline-start side of their controls; at a viewport width of 480px or below it becomes one flex column with a `--spacing-4` gap. OQ1 holds whether the collapsed label and control need a tighter pair gap.                                                                                                                                                                                                                                                                                                                                                   | Released source, Field composition, and tests                   |
| FR4 | FormLayout provides its direction, `defaultOptionality`, and `defaultEntryErrorBehavior` to descendants in the same layer; a nested FormLayout replaces all three for its own descendants, an unset value included, and content in a layer opened inside a FormLayout starts without them (`spec:AST-038` FR7, FR8).                                                                                                                                                                                                                                                                                                                                                                                                                 | Context source and tests                                        |
| FR5 | `defaultOptionality` suppresses only the visible marker that restates the form default; descendant controls still expose the resolved `aria-required`, while native `required` stays tied to an explicit field `isRequired`. Unset keeps each field's own indicators. Exception: CheckboxList, CheckboxInput, and Switch treat an empty selection, an unchecked box, or an off switch as an answer, so `defaultOptionality` gives them no required state: they take neither `aria-required` nor native `required` from it. CheckboxInput and Switch are required only through their own `isRequired`, and a CheckboxList and its rows take no required state from the form default; the marker rule above applies to them unchanged. | Tests; `family:input-fields` ownership                          |
| FR6 | The root is a `div`. `ref`, DOM, data, ARIA, and event props, `xstyle`, class name, and inline style reach or compose on the root without replacing `data-direction` or the `form-layout` target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `architecture:public-component-api/INV5–INV8`; source and tests |
| FR7 | `defaultEntryErrorBehavior` sets the entry error behavior of DateInput, DateTimeInput, TimeInput, and NumberInput descendants that do not set their own `entryErrorBehavior`; unset leaves them at `'complete'`, their shipped behavior (`spec:AST-117` FR2, FR3). It changes no other descendant and no caller `status`. NumberInput behaves the same under both values (`component:NumberInput` FR14).                                                                                                                                                                                                                                                                                                                             | `spec:AST-117` DEC-2; context source and tests                  |

### Allowed variation

- **AV1 — Caller content.** Any caller-owned field, heading, explanatory content, or action region may be a child; FormLayout does not inspect or rewrite it.
- **AV2 — Nested arrangement.** Builders may nest vertical and horizontal layouts; each provider owns only its descendant scope.
- **AV3 — Root styling.** Caller styling may change the container's presentation while preserving the public direction and child contracts.

### Representative states

| State                      | Required invariant                                                                              | Allowed variation                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| vertical                   | One block-axis stack with tokenized gaps.                                                       | Any caller-owned children.                                                                             |
| horizontal                 | One `1fr` grid track per child in logical inline order.                                         | Child count and content.                                                                               |
| horizontal labels / wide   | Label/control pairs share consistent two-column tracks.                                         | Label and control content.                                                                             |
| horizontal labels / narrow | One vertical column at 480px or below with a `--spacing-4` gap and no component-owned overflow. | Caller-owned content may wrap; OQ1 asks whether each label and control pair should keep a tighter gap. |
| optional by default        | Only explicitly required fields show the exception marker.                                      | Field and input type.                                                                                  |
| required by default        | Only explicitly optional fields show the exception marker.                                      | Field and input type.                                                                                  |
| nested                     | Inner direction, optionality, and entry error behavior replace outer values.                    | Any supported inner direction/default combination.                                                     |
| `blur-or-enter` by default | Members without their own `entryErrorBehavior` reveal their own rejections only at commit.      | Field and input type; a field's own `entryErrorBehavior`.                                              |

### Transformation and precedence order

- **ORD1 — Context.** Explicit props resolve against `vertical` and unset defaults, then the nearest provider exposes the resolved values to descendants.
- **ORD2 — Root props.** FormLayout-owned target and direction reflection compose with StyleX and caller styling; caller DOM props reach the same root without replacing owned reflection.
- **ORD3 — Optionality.** The layout default establishes the unmarked majority; a field-level `isRequired` or `isOptional` marks the exception and controls native validation only when explicitly requested. CheckboxList, CheckboxInput, and Switch are the FR5 exception: the default sets no required state for them, so only their own `isRequired` makes them required.
- **ORD4 — Entry error behavior.** A field's own `entryErrorBehavior` wins over the nearest layout's `defaultEntryErrorBehavior`, which wins over `'complete'` (`spec:AST-117` FR2).

### Performance and resources

- **PR1 — Stable context identity.** Descendants receive one memoized context value per direction, optionality, and entry error behavior combination; FormLayout owns no listener, observer, timer, or external resource.

## Accessibility contract

- **AR1 — Layout remains nonsemantic.** FormLayout renders a `<div>` and does not imply `<form>`, group, label, or submission semantics; callers provide those when their composition needs them.
- **AR2 — Required state remains perceivable.** A form-wide optionality convention may remove redundant visible markers, but descendant controls preserve the resolved required state for assistive technology. This does not apply to the FR5 exception (CheckboxList, CheckboxInput, Switch), whose unmarked state is an answer, not a missing required value; a control marked `isRequired` still exposes its required state.
- **AR3 — Logical order is preserved.** Every direction retains DOM order and logical inline flow; FormLayout does not create a separate keyboard order.

## Design relationships

| Anatomy or state | Design requirement                                          | Representation authority | Hierarchy role | Component contract |
| ---------------- | ----------------------------------------------------------- | ------------------------ | -------------- | ------------------ |
| Layout container | Outer arrangement and spacing of caller fields.             | Current source and docs  | Supporting     | FR1–FR3, FR6       |
| Form title       | Caller content; not rendered or styled by FormLayout.       | Caller-owned             | Prominent      | —                  |
| Fields           | Caller Field and input components.                          | Their own components     | Prominent      | FR4, FR5           |
| Footer           | Caller action region; not rendered or styled by FormLayout. | Caller-owned             | Supporting     | —                  |

No shared design record prescribes a FormLayout-specific representation;
spacing uses the token scale.

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Layout container": {"target": "form-layout"},
  "Form title": {
    "none": {
      "reason": "intentional: A title is caller-owned content; FormLayout neither renders nor styles a title part."
    }
  },
  "Fields": {
    "none": {
      "reason": "intentional: Caller-owned Field and input components retain their own theming targets."
    }
  },
  "Footer": {
    "none": {
      "reason": "intentional: A footer is caller-owned content; FormLayout neither renders nor styles an action region."
    }
  }
}
```

The root target reflects the closed `direction` axis. It owns the outer arrangement container and does not claim the visual parts rendered by child components.

## Family and system relationships

- `family:input-fields` identifies FormLayout as the owner of outer arrangement, spacing, direction, form-level optionality, and the form-level entry error behavior default.
- `spec:AST-117` owns entry error behavior; FR7 and ORD4 project its FR2.
- `component:Field` consumes horizontal-label direction and optionality while retaining label, control, description, and status ownership.
- `architecture:public-component-api` owns root prop, styling, event, ref, and released-type composition.
- `architecture:component-theming-surface` sets the rules the `form-layout` target and its reflected direction follow.
- `architecture:component-test-sufficiency` owns bounded, mutation-sensitive evidence selection.

## Verification map

| Contract       | Verification                                                                                                                        | Representative states                                                                                                                                                                                                                           | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Audit section                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| FR1–FR3        | `FormLayout.test.tsx` direction snapshots; `FormLayout.stories.tsx` play checks; stable visual baseline `core-formlayout--vertical` | Vertical, horizontal, horizontal-labels wide and narrow                                                                                                                                                                                         | A changed style class set fails the snapshots; a narrow horizontal-labels control narrower than the layout, or a wide label not before its control, fails the play checks; a changed vertical layout comes back changed for review. The story play guard also runs the AuditMatrix play right-to-left at 320px and the default width, where mirrored horizontal columns are asserted. Gap: no right-to-left check asserts that a horizontal-labels label sits on the inline-start side of its control. | `audit:FormLayout/behavior`      |
| FR4, ORD1      | `FormLayout.test.tsx` context and nesting tests; `Layer/layerScopedContext.test.tsx`                                                | Default, explicit, nested; content in a fixed Layer and an inline Dialog                                                                                                                                                                        | A lost default or value, lost shadowing by an inner layout's explicit values, or content inside a layer that still reads the outer `defaultOptionality` fails. Gap: no test covers an inner layout with unset props (which supplies its own defaults) or `direction` across a layer boundary.                                                                                                                                                                                                          | `audit:FormLayout/behavior`      |
| FR5, ORD3, AR2 | `FormLayout.test.tsx` optionality and `aria-required` tests                                                                         | Required, optional, unset defaults; explicit exceptions                                                                                                                                                                                         | A redundant marker, a missing `aria-required`, or a native `required` from the default fails. FileInput, Slider, Typeahead, and Tokenizer tests cover a `required` default.                                                                                                                                                                                                                                                                                                                            | `audit:FormLayout/accessibility` |
| FR5            | `FormLayout.test.tsx` "required default gives an unmarked checkbox, switch and checkbox group no required state"                    | Under `defaultOptionality="required"`, an unmarked CheckboxInput, Switch and CheckboxList (each box) carry no `aria-required` and no `required`, while a TextInput beside them still carries `aria-required`; the markers follow FieldLabel FR4 | An unmarked checkbox, switch or checkbox group carrying `aria-required` fails.                                                                                                                                                                                                                                                                                                                                                                                                                         | `audit:FormLayout/accessibility` |
| FR6, ORD2      | `FormLayout.test.tsx` ref, passthrough, and owned-metadata tests; `themingTargets.test.ts`                                          | Ref, attributes, colliding `data-direction`                                                                                                                                                                                                     | A ref on a non-`div`, a dropped `id` or `role`, or a replaced `data-direction` fails. Gap: no test covers event props or the styling-input merge order.                                                                                                                                                                                                                                                                                                                                                | `audit:FormLayout/api`           |
| AR1, AR3       | `FormLayout.test.tsx` div and passthrough tests; `FormLayout.stories.tsx` play checks                                               | Plain root; caller `role`                                                                                                                                                                                                                       | A non-`div` root or a dropped caller `role` fails. Horizontal columns that do not mirror right-to-left fail the AuditMatrix play under the story play guard. Gap: no check fails if FormLayout adds a role of its own.                                                                                                                                                                                                                                                                                 | `audit:FormLayout/accessibility` |
| FR7, ORD4      | `FormLayout.test.tsx` "FormLayout defaultEntryErrorBehavior" cases                                                                  | Unset, `complete`, `blur-or-enter`; a field with its own `entryErrorBehavior`; a nested layout with and without a value; a field in a layer                                                                                                     | A member that ignores the default, a default that outranks the field, or a nested or layered field that keeps the outer default fails.                                                                                                                                                                                                                                                                                                                                                                 | `audit:FormLayout/behavior`      |
| PR1            | Source review                                                                                                                       | Every direction                                                                                                                                                                                                                                 | Gap: no automated check covers context identity or added resources.                                                                                                                                                                                                                                                                                                                                                                                                                                    | `audit:FormLayout/behavior`      |

## Decision log

None recorded here. `spec:AST-117` DEC-2 decides the entry error behavior default.

## Open questions

- **OQ1 — At 480px and below, should each horizontal-label pair preserve a smaller intra-field label/control gap than the gap between adjacent fields?** (`human-design`)

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
