---
schema_version: 3
template_version: 7
kind: component
id: component:Switch
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
    packages/core/src/Switch/Switch.test.tsx,
    packages/core/src/Switch/Switch.focusRing.source-build.test.mjs,
    packages/core/src/Switch/switchTouch.test.ts,
    packages/core/src/Switch/__tests__/Switch.interaction.browser.spec.ts,
    packages/core/src/Switch/__tests__/SwitchPointer.interaction.browser.spec.ts,
    packages/core/src/Switch/__tests__/Switch.a11y.test.tsx,
    packages/core/src/Switch/__tests__/Switch.a11y.chromium.spec.ts,
    packages/core/src/__tests__/PressedState.a11y.chromium.spec.ts,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: [design:user-states, design:reduced-motion]
architecture:
  [
    architecture:component-theming-surface,
    architecture:interaction-modality,
    architecture:public-component-api,
  ]
contributing: []
system_specs:
  [
    spec:AST-020/DEC-5,
    spec:AST-020/FR9,
    spec:AST-021,
    spec:AST-085,
    spec:AST-086,
    spec:AST-094,
    spec:AST-094/FR4,
    spec:AST-094/FR6,
    spec:AST-094/FR18,
    spec:AST-094/FR24,
  ]
---

# Switch component contract

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/core/src/motion/uikit/switch.ts"]
}
```

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | None changes. Switch takes `label`, `value`, `onChange`, `changeAction`, `isLoading`, `isDisabled`, `disabledMessage`, `isRequired`, `isOptional`, `status`, `size`, `labelPosition`, `labelSpacing`, field content, and base props.                                                                                                                                                 |
| Behavior                | A native checkbox with `role="switch"` drawn as a track and thumb. A change calls `onChange`, then an optional `changeAction` with the optimistic value; while busy the switch shows a Spinner in the thumb and refuses changes. Its press and drag work for every pointer, and under a finger it follows the finger as the iOS switch does (FR13–FR15).                             |
| End-user impact         | People flip a setting that takes effect at once and hear when it is saving. Keyboard and screen-reader users can reach a disabled switch and its reason.                                                                                                                                                                                                                             |
| Builder impact          | None.                                                                                                                                                                                                                                                                                                                                                                                |
| Compatibility/readiness | Under a finger a hold and a press slid off now toggle the switch, and under a mouse or a pen a drag past the flip distance now flips it (FR15); a coarse pointer's hit area grows toward 44 px (FR10); no API, default, or DOM change. Caller handlers other than `onClick` run while disabled, and caller ARIA lands on the field root; both are listed under Current-state impact. |
| Review checks           | Reject a lost switch role or name, a change while disabled or busy, focus moving on change, a ring painted anywhere but the track, a thumb that travels the wrong way under RTL, or a disabled switch that submits.                                                                                                                                                                  |
| Governing rules         | `spec:AST-021` switch pattern; `spec:AST-085` FR1–FR3, FR5, FR6; `spec:AST-086` FR8; `design:user-states` DR1, DR2 (pressed overlay); `design:reduced-motion` DR1; WCAG 2.5.2, 3.2.2, 1.4.11; `spec:AST-094` FR4, FR11, FR13, FR24, FR42, FR43; `spec:AST-020` FR9 (DEC-5).                                                                                                          |

This table is a review projection; the body below is authoritative.

## Intent

Switch presents a labelled boolean setting whose change takes effect
immediately. It owns the switch control, its change and Action pipeline, busy
and disabled behavior, label placement, and the field's theming anatomy.
Its press and drag work for a mouse, a pen and a finger (FR15). Under a touch
presentation it follows a finger the way the iOS switch does (FR13–FR15);
under a fine primary pointer it keeps its released look, and a keyboard or
assistive technology keeps its released behavior. Consumer usage lives in `Switch.doc.mjs`.

## Compatibility and migration

- Released default preserved: `no` under a finger, where a hold and a press
  slid off now toggle the switch (FR15), and under a mouse or a pen, where a
  drag past the flip distance now flips it (FR15); `yes` for a keyboard and
  assistive technology; `size="md"`, `labelPosition="end"`,
  `labelSpacing="hug"`
- Compatibility class: a touch presentation adds the finger behavior
  (FR13–FR15), a mouse or a pen drags the switch by the same flip rule
  (FR15), and a coarse pointer's hit area grows toward 44 × 44 px (FR10); the
  look under a fine pointer and every public prop, default, export, and DOM
  element stay as they were
- Controlled/uncontrolled behavior: controlled only; `value` is required, and
  the switch shows an optimistic value only while a `changeAction` is pending
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The switch field, track, thumb, and label presentations represented by the
  existing `switch-field`, `switch`, `switch-thumb`, and `switch-label` targets.
- The native switch input, its name, description, state, and form
  participation.
- The change and Action pipeline, busy state, and busy announcement.
- Disabled and disabled-reason behavior.
- The track's focus ring, hover tint, and pressed overlay.

**Does not own / non-goals**

- Description styling through a dedicated public target; none currently exists.
- Validation-message presentation — owned by `component:FieldStatus`.
- Loading-indicator presentation — owned by `component:Spinner`.
- Tooltip surfaces used for shared label and disabled-reason behavior.
- Label rendering — owned by FieldLabel.

## Public concepts

| Concept        | Closed values or states | Meaning                                             | Availability by variant/orientation/state                   | Default  | Owner              | Stability | Invalid-value behavior                         |
| -------------- | ----------------------- | --------------------------------------------------- | ----------------------------------------------------------- | -------- | ------------------ | --------- | ---------------------------------------------- |
| Value          | on, off                 | The setting's state.                                | Always.                                                     | required | `component:Switch` | Stable    | TypeScript rejects non-booleans.               |
| Size           | `sm`, `md`              | Track 32×20 or 40×24 CSS px.                        | Always.                                                     | `md`     | `component:Switch` | Stable    | TypeScript rejects other values.               |
| Label position | `start`, `end`          | Label before or after the switch.                   | Always.                                                     | `end`    | `component:Switch` | Stable    | TypeScript rejects other values.               |
| Label spacing  | `hug`, `spread`         | Label beside the switch, or pushed to the far edge. | Always.                                                     | `hug`    | `component:Switch` | Stable    | TypeScript rejects other values.               |
| Busy           | idle, busy              | A change is loading or being saved.                 | `isLoading`, or while the shown state differs from `value`. | idle     | `component:Switch` | Stable    | Not applicable.                                |
| Disabled       | off, on, on with reason | Blocks changes.                                     | A reason applies only with `isDisabled`.                    | off      | `component:Switch` | Stable    | A reason without `isDisabled` renders nothing. |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Basis                                                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| FR1  | The current render places a thumb inside the switch track and arranges that control with its label: a visually hidden native `<input type="checkbox" role="switch">` sits over a decorative track, with the label after it by default or before it with `labelPosition="start"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `spec:AST-021`; current source, docs, and focused tests                                                                                 |
| FR2  | The field, track, thumb, and label carry their existing local targets. The field reflects `data-label-position` and `data-label-spacing` only for non-default values; the track reflects `data-size`, `data-checked`, and `data-disabled`; the thumb reflects `data-size` and `data-checked`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `architecture:component-theming-surface`; current source and tests                                                                      |
| FR3  | A busy switch renders Spinner inside the thumb; a status message renders through detached FieldStatus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current source, docs, and focused tests                                                                                                 |
| FR4  | The input is named by its label (or a caller `aria-labelledby`) and described by any caller description, then the description, status message, and disabled reason that exist; the description is not part of the name. A click on the label or description toggles the switch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `spec:AST-021`; current tests                                                                                                           |
| FR5  | A change calls `onChange(checked, event)`; unless that call prevents default, `changeAction(checked, event)` runs in a transition and the switch shows the proposed state while the Action is pending, and `value` once it settles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current tests                                                                                                                           |
| FR6  | While `isLoading`, or while the shown state differs from `value`, the input sets `aria-busy`, ignores pointer input, refuses changes, keeps focus, and the switch announces its busy start once per busy period through the shared channel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `spec:AST-086` FR8; current tests                                                                                                       |
| FR7  | Disabled: `aria-disabled="true"` on a focusable input, no `name`, detached from its form (so it neither submits nor blocks submission when required), no change, no caller `onClick` on the field, no hover or press paint, and a half-opacity track. With `disabledMessage`, a reason tooltip opens on row hover and keyboard focus and describes the input. Implementation gap: caller DOM handlers other than `onClick`, such as `onKeyDown`, still run on the field root while disabled (`spec:AST-085` FR2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `spec:AST-085` FR1–FR3, FR5; current tests                                                                                              |
| FR8  | Enabled, the input submits `on` under `htmlName` when on and nothing when off; `isRequired` sets native `required`, while `aria-required` follows the effective required state; `aria-invalid` follows `status` (`false` on a required switch without an error), so the browser's own invalid state never shows before an error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Current tests                                                                                                                           |
| FR9  | Keyboard focus paints the shared focus outline on the track. Hovering the enabled row tints the track; pressing paints the pressed overlay on both, applying `design:user-states` DR1 and DR2; a touch press fades out from the row. Track color transitions are instant under reduced motion; under a finger the colour fades with the thumb's cross-fade (FR15).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `architecture:interaction-modality` INV1; `design:user-states` DR1, DR2 for the pressed overlay; `design:reduced-motion`; current tests |
| FR10 | The thumb travels toward the inline end when on, mirrored under RTL, and moves without a transition under reduced motion (`design:reduced-motion` DR1); under a finger it cross-fades to its rest instead (FR15). Where the primary pointer is coarse, the switch's hit area grows around the track toward 44 by 44 CSS pixels, each side stopping at half the gap to a neighbouring target so a tap goes to the nearer one (`spec:AST-094` FR42, `utils/hitArea.ts`), with nothing visible added.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | WCAG 2.5.8; current tests; `design:reduced-motion` DR1; `spec:AST-094` FR42                                                             |
| FR11 | Under forced colors, on and off stay distinguishable (Highlight track when on), and the hover tint does not hide the thumb.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | WCAG 1.4.11; current tests                                                                                                              |
| FR12 | `ref`, `onFocus`, and `onBlur` reach the input, and a caller `aria-labelledby` and `aria-describedby` name and describe it. Other base props (`id`, `data-*`, other ARIA, `onClick`, and other handlers), `className`, `style`, `xstyle`, and `width` reach the field root. Caller ARIA attributes name and describe the switch, so they MUST reach the input (`architecture:public-component-api` INV5). Implementation gap: ARIA other than `aria-labelledby` and `aria-describedby`, such as `aria-label`, lands on the field root.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current tests; `architecture:public-component-api` INV5                                                                                 |
| FR13 | The thumb is one circle under any pointer, at each state's size: a touch presentation moves and lifts it and never reshapes it, and its lift and rubber band derive from the box it renders.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Owner direction, 2026-10-26                                                                                                             |
| FR14 | Under a finger the thumb, lifted or banded past either end, paints inside the track, in either writing direction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Owner direction, 2026-10-25                                                                                                             |
| FR15 | For every pointer (`spec:AST-094` FR43) a tap, a hold of any length or a short drag toggles the switch at the release (a tap through the browser's click; where the browser sends no click for a finger's release, as for a hold, the switch clicks its input itself), and a drag commits the side it flipped the switch to, which it reaches once the pointer is the track width less the thumb width from where it pressed, toward the other end, and leaves again once the pointer comes back past where it pressed (measured in `motion/uikit/switch.ts`: `travel`, `flipDistance`). A finger's drag commits wherever the finger lifts; a mouse's or a pen's commits when it is released inside the switch's tracking bounds, its box grown by UIControl's 70 px tracking expansion. Under a finger a press slid off and lifted outside without a flip toggles it too, as `spec:AST-094` FR11 allows for a toggle under `spec:AST-020` FR9's slide-off exception (DEC-5); a mouse or a pen released outside those bounds leaves it alone, flipped or not, as the native checkbox does. Under a finger the thumb follows the drag as UISwitch's does (iOS 26.2); under a fine primary pointer the switch keeps its own look, and the value moves its thumb (`spec:AST-094` FR13). The switch's own click, for a hold and for a flipping drag, is the exception `spec:AST-094` FR11 states for Switch. Under reduced motion nothing lifts or springs: a tap, a release or a change cross-fades the thumb to its rest and the track colour with it, while a dragging finger still moves the thumb. A finger's slide-off toggle (`spec:AST-020` FR9, DEC-5; `spec:AST-094` FR11) meets WCAG 2.5.2 Pointer Cancellation through its Abort or Undo option: sliding back, or toggling again, undoes it. A mouse or pen released outside the tracking bounds cancels the press. | `spec:AST-094` FR11, FR13, FR43; `spec:AST-020` FR9/DEC-5; `design:reduced-motion`; WCAG 2.5.2                                          |

### Motion roles

Under a finger the switch plays these motion roles, which this record names
and the generated motion role table carries (`spec:AST-094` FR4, DEC-5). They
are internal, so no theme overrides them yet (DEC-11); each value is
measured on UISwitch, iOS 26.2 (`motion/uikit/switch.ts`).

| Role                          | Default                                 | Use                                                          |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| `switchControl.lift`          | response 0.23 s, damping ratio 0.55     | The thumb lifting while a finger presses                     |
| `switchControl.settle`        | response 0.5 s, damping ratio 0.7       | The lifted thumb settling after the lift                     |
| `switchControl.minimumLiftMs` | 235 ms                                  | The shortest lift before the settle, so a quick tap shows it |
| `switchControl.travel`        | response 0.3 s, damping ratio 1         | The thumb travelling to the committed end                    |
| `switchControl.tracking`      | response 0.36 s, damping ratio 1        | The thumb chasing a dragging finger                          |
| `switchControl.wellOn`        | mass 1, stiffness 85.38, damping 18.48  | The track colour turning on                                  |
| `switchControl.wellOff`       | mass 1, stiffness 246.74, damping 31.42 | The track colour turning off                                 |

### Allowed variation

- **AV1 — Placement.** Label position and spacing, size, checked state, and
  disabled state remain current target capabilities rather than separate
  anatomy parts.
- **AV2 — Description.** A description may be absent without changing the
  remaining anatomy.

### Representative states

| State                | Required invariant                                                                                                    | Allowed variation                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Off or on            | Track, thumb, and label render within the switch field.                                                               | Checked state, size, label placement   |
| Busy                 | Spinner inside the thumb; changes refused; announced. Busy while `isLoading` or the shown state differs from `value`. | Controlled or optimistic checked value |
| Disabled with reason | Focusable; not submitted; reason tooltip.                                                                             | —                                      |
| Status with message  | Detached FieldStatus follows the switch row.                                                                          | Error, warning, or success status      |

### Transformation and precedence order

- **ORD1 — Change.** Disabled or busy guard → `onChange` → optimistic value and
  `changeAction` unless prevented.
- **ORD2 — Description.** Caller description, description, status message,
  disabled reason.

### Performance and resources

- **PR1 — Bounded resources.** Each Switch attaches the disabled-reason
  tooltip's pointer, mouse, and focus listeners to its row, whether or not it is
  disabled, and shares the press controller's window and document listeners
  while any pressable is mounted, and, through the tooltip's layer, the shared
  gesture counter's document listeners, installed once per page; it owns no
  observer, and the busy announcement fires once per busy period. An enabled
  switch also adds one consumer to the shared gesture host, whose listeners
  are installed once per page; under a fine primary pointer the host arms one
  passive `pointerdown` listener on the element around its track
  (`spec:AST-094` FR24). The switch adds no `click` listener of its own: a
  lift that waits for the browser's click subscribes to the window's shared
  input stream until that click comes or the wait runs out.

## Accessibility contract

A touch presentation leaves Switch's accessible name, switch role, checked
state, busy state, description and status association, and disabled behavior
as they are under any other pointer.

Switch binds to the shared switch-pattern accessibility contract under
`spec:AST-021`. The binding owns the standards-derived outcomes — role,
accessible name, exposed on/off state, description, disabled exposure and
inoperability, pointer and keyboard activation, pointer cancellation, and focus
staying put on change — across the representative states listed in
`__tests__/Switch.a11y.states.ts`. The contract checks pointer cancellation
with a mouse, where a press slid off leaves the switch alone; under a finger a
press slid off toggles it, under `spec:AST-020` FR9's reversible-toggle
exception (DEC-5, FR15). Callback payloads, form participation,
disabled-reason tooltip composition, and styling remain Switch-owned and stay in
`Switch.test.tsx`.

- **AR1 — Disabled reachability.** FR7 satisfies `spec:AST-085` FR1, FR5, and
  FR6.
- **AR2 — Busy.** FR6; spoken output follows `spec:AST-009`.
- **AR3 — Non-color state.** FR11.

## Design relationships

| Anatomy or state | Design requirement                                       | Representation authority        | Hierarchy role | Component contract            |
| ---------------- | -------------------------------------------------------- | ------------------------------- | -------------- | ----------------------------- |
| Field            | Arranges the switch control with its label and feedback. | Current source and public docs  | Supporting     | FR1, FR2                      |
| Track and thumb  | Present the current on/off control.                      | Current source and public docs  | Prominent      | FR1, FR2, FR9–FR11, FR13–FR15 |
| Label            | Identifies the controlled setting.                       | Current source and public docs  | Prominent      | FR1, FR2, FR4                 |
| Spinner/status   | Present conditional progress and validation feedback.    | Current shared-component source | Supporting     | FR3, FR6                      |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Field": {"target": "switch-field"},
  "Track": {"target": "switch"},
  "Thumb": {"target": "switch-thumb"},
  "Label": {"target": "switch-label"},
  "Description": {
    "none": {
      "reason": "unsettled: No current public target reaches the stable Description; future exposure still needs an owner decision"
    }
  },
  "Spinner": {
    "delegatesTo": {"owner": "component:Spinner", "target": "spinner"}
  },
  "Status message": {
    "delegatesTo": {
      "owner": "component:FieldStatus",
      "target": "field-status"
    }
  }
}
```

`Description` remains stable consumer anatomy, but no current public target
reaches it. The map classifies future exposure as unsettled rather than silently
making the absence intentional.

## Family and system relationships

- `spec:AST-021` owns the reusable switch-pattern binding and its evidence
  layers.
- `spec:AST-085` owns disabled focusability; Switch meets it.
- `spec:AST-086` FR8 owns the busy announcement.
- `design:user-states` owns the pressed treatment.
- `spec:AST-094` owns touch presentations and FR43's gestures for every
  pointer: Switch follows its FR11 press profiles, its FR42 hit area and FR43
  (FR10, FR13–FR15).
- `architecture:component-theming-surface` owns anatomy qualification, factual
  `none` dispositions, and composition-preserving target ownership.
- FieldStatus and Spinner retain their existing public target contracts when
  composed by Switch.

## Verification map

| Contract                          | Verification                                                                                                                                                                                                                                                                             | Representative states                                                                                                                                                                                                                                                                                                                                                                                             | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                         | Audit section           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| FR1, FR4                          | `Switch.test.tsx` structure, label, description, and interaction suites                                                                                                                                                                                                                  | On/off, size, label position, hidden label                                                                                                                                                                                                                                                                                                                                                                        | Removing stable parts, or folding the description into the name, fails; the caller description first is asserted. Evidence gap: no test asserts the label order (the position cases count children only) or the disabled reason last.                                                                                                                                                                                                                   | `audit:Switch/anatomy`  |
| FR2                               | `Switch.test.tsx` label-target, labelSpacing, and pressed-state cases; `themingTargets.test.ts`                                                                                                                                                                                          | Current local targets                                                                                                                                                                                                                                                                                                                                                                                             | A missing label, field, track, or thumb target, or a missing `data-label-spacing`, fails; a rendered class absent from the documented targets fails. Evidence gap: no test asserts `data-label-position`, or the track and thumb `data-size`, `data-checked`, and `data-disabled`.                                                                                                                                                                      | `audit:Switch/theming`  |
| FR3, FR5, FR6                     | `Switch.test.tsx` loading, announcement, and status suites                                                                                                                                                                                                                               | Busy, pending Action, StrictMode, re-busy, detached status                                                                                                                                                                                                                                                                                                                                                        | Removing composed feedback, or announcing more than once per busy period, fails. Evidence gap: no test asserts the Spinner inside the thumb, `changeAction` after `onChange` with `preventDefault`, the optimistic state, or that pointer input is ignored while busy.                                                                                                                                                                                  | `audit:Switch/anatomy`  |
| FR7, FR8                          | `Switch.test.tsx` disabled, disabledMessage, and form cases; `PressedState.a11y.chromium.spec.ts` disabled press case                                                                                                                                                                    | Disabled with and without reason; required; on and off                                                                                                                                                                                                                                                                                                                                                            | A change while disabled, a submitted disabled value, a blocked submit, or press paint on a disabled switch fails. Evidence gap: no test asserts the absent hover tint, the half-opacity track, or that caller `onKeyDown` still runs while disabled (the FR7 gap). No test asserts `aria-required` following a form-level required default.                                                                                                             | `audit:Switch/behavior` |
| FR9–FR11                          | `Switch.test.tsx` pressed-state, RTL, coarse-pointer, and forced-colors cases; `Switch.focusRing.source-build.test.mjs`                                                                                                                                                                  | Mouse and touch press; RTL; coarse pointer; forced colors                                                                                                                                                                                                                                                                                                                                                         | Missing press paint, unmirrored travel, or lost forced-colors state fails. Evidence gap: no test asserts the hover tint, instant transitions under reduced motion with a mouse, or the track focus outline; the source-build check covers only how the outline finds the input.                                                                                                                                                                         | `audit:Switch/visual`   |
| FR12                              | `Switch.test.tsx` rest-forwarding and ref cases                                                                                                                                                                                                                                          | Root attributes; caller labelledby and describedby                                                                                                                                                                                                                                                                                                                                                                | A dropped ref, or a caller `aria-labelledby` or `aria-describedby` on the root, fails; the rest-forwarding case asserts `aria-label` on the root, which is the FR12 gap, so fixing the gap changes that test. Evidence gap: no test distinguishes `onFocus` and `onBlur` on the input from the root, or asserts a caller `onClick`, other handlers, `className`, `style`, `xstyle`, or `width` on the root.                                             | `audit:Switch/api`      |
| FR10 (coarse hit area), FR13–FR15 | `__tests__/Switch.interaction.browser.spec.ts` (Chromium and WebKit, real touch input), `__tests__/SwitchPointer.interaction.browser.spec.ts` (Chromium and WebKit, a real mouse; Chromium, a real pen), `Switch.test.tsx` hit-area cases and listener counts, and `switchTouch.test.ts` | The circle at each state's size; the 44 × 44 px hit area, and its stop halfway to a link beside it; a tap, a hold, a short drag, a flipping drag and a press slid off and lifted outside; right to left; Reduce Motion; a mouse or a pen drag past the flip, past it and back, and slid off; a click and a right click; a fine pointer's listeners at rest                                                        | A reshaped thumb, a hit area under 44 × 44 px with nothing near, a hit area past the midpoint to a neighbour, a thumb painted outside the track, a slid-off press that leaves the switch alone under a finger, a flip at any other distance, a mouse or pen drag that does not flip at the flip distance, a mouse or pen slid off that toggles, a lift or animation under a fine pointer, or more than one listener at rest under a fine pointer fails. | `audit:Switch/behavior` |
| Switch pattern — semantics        | `__tests__/Switch.a11y.test.tsx` (DOM layer, higher layers reported unrun) and `__tests__/Switch.a11y.chromium.spec.ts` (accessibility tree)                                                                                                                                             | Off, on, on after a controlled update, described, hidden label, disabled, focusable-disabled, required, invalid, loading                                                                                                                                                                                                                                                                                          | Losing the switch role, the accessible name, the visible label's words within that name, the exposed on/off state, an attached description, or disabled, required, and invalid exposure fails the shared contract.                                                                                                                                                                                                                                      | `audit:Switch/anatomy`  |
| Switch pattern — interaction      | `__tests__/Switch.a11y.chromium.spec.ts` (real browser)                                                                                                                                                                                                                                  | Every state, each checked for what applies to it: round trips, pointer cancellation, and focus-on-change cover the operable states (off, on, on after a controlled update, described, hidden label, required, invalid); Tab reach-and-escape covers every focusable state, adding focusable-disabled and loading; inoperability covers the states the user cannot change (disabled, focusable-disabled, loading). | Losing either direction of a pointer or Space round trip, letting a mouse press slid off the control still change it (WCAG 2.5.2; under a finger FR15's reversible-toggle exception applies), moving focus when the state changes (WCAG 3.2.2), failing to reach or leave the control by Tab, or changing a state the user is not meant to be able to change fails the shared contract.                                                                 | `audit:Switch/anatomy`  |
| Switch pattern — label stability  | `__tests__/Switch.a11y.chromium.spec.ts`, reported not gated                                                                                                                                                                                                                             | Every operable state: off, on, on after a controlled update, described, hidden label, required, invalid                                                                                                                                                                                                                                                                                                           | The APG requires the label not to change with the state. No current record adopts it, so the expectation is advisory: a name that flips across a round trip is reported, and does not fail the build.                                                                                                                                                                                                                                                   | `audit:Switch/anatomy`  |
| Switch pattern — state inventory  | `__tests__/Switch.a11y.chromium.spec.ts` inventory assertion                                                                                                                                                                                                                             | Every bound state                                                                                                                                                                                                                                                                                                                                                                                                 | The labels `__tests__/Switch.a11y.states.ts` claims each state renders are compared against the rendered page, so a stale inventory is reported as one rather than as a standards failure.                                                                                                                                                                                                                                                              | `audit:Switch/anatomy`  |
| ORD1, ORD2, PR1                   | ORD1 is covered by the FR5 and FR7 rows, and the caller-description-first part of ORD2 by the FR1 row. Evidence gap: no test asserts the rest of the ORD2 order or listener bounds                                                                                                       | —                                                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `audit:Switch/behavior` |
| Theming anatomy map               | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                            | Canonical anatomy and all current targets                                                                                                                                                                                                                                                                                                                                                                         | Canonical-key drift, invalid dispositions or target spelling, or an unclaimed current local target fails repository validation.                                                                                                                                                                                                                                                                                                                         | `audit:Switch/theming`  |

No repository check resolves `delegatesTo` owner and target pairs; the pairs
above match the current Spinner and FieldStatus targets.

## Current-state impact

- **Caller handlers while disabled (FR7).** Caller DOM handlers other than
  `onClick`, such as `onKeyDown`, still run while disabled, against
  `spec:AST-085` FR2.
- **Caller ARIA on the root (FR12).** A caller's `aria-label` and other ARIA
  attributes, except `aria-labelledby` and `aria-describedby`, land on the field
  root instead of the switch input, against `architecture:public-component-api`
  INV5.

## Decision log

FR13 rests on owner direction of 2026-10-26: the thumb keeps its circle and its
size on every device, and a coarse pointer gets a hit area that grows toward
44 × 44 px and stops halfway to its neighbours, with nothing visible added
(FR10). FR14 rests on owner direction of 2026-10-25. Under a mouse or a pen a
press slid off keeps the native checkbox's cancel: `spec:AST-094` FR11 lets a
toggle under `spec:AST-020` FR9's slide-off exception complete only on a lift
after the finger slid off. Switch otherwise applies `spec:AST-021` and
`spec:AST-085`.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, implementation
steps, or shared-component contracts. It links to their owners.
