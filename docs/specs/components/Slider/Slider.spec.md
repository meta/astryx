---
schema_version: 3
template_version: 4
kind: component
id: component:Slider
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-14
owners: [cixzhang]
review_triggers: [theming]
verified_by:
  [
    packages/core/src/Slider/Slider.test.tsx,
    packages/core/src/theme/themingTargets.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture: [architecture:component-theming-surface]
contributing: []
system_specs: []
---

# Slider component contract

## Intent

Slider presents a labeled control for selecting one numeric value or a bounded
range. This contract records its consumer anatomy and theming ownership, including
an additive target for the interactive control surface.

## Compatibility and migration

- Released default preserved: `no` — FR5 changes the released `onChangeEnd`
  payload; every other released default is unchanged
- Compatibility class: additive target and state reflection; default styling,
  DOM semantics, and public props remain unchanged, and the one keyboard change
  AR1 names — the horizontal arrows follow the track's direction under RTL —
  ships as a behavior fix
- `onChangeEnd` payload (FR5): a new contract decision (`spec:AST-017/FR33`),
  not a correction. Released victim: an owner that moves `value` only from
  `onChangeEnd`, with no `onChange`, moves by keyboard today and does not under
  FR5, so the change is breaking (`spec:AST-017/FR1`) and ships as
  `[breaking]` in a declared minor (`spec:AST-017/FR31`).
- Controlled/uncontrolled behavior: unchanged; Slider remains controlled
- Migration decision: an owner that moves `value` only from `onChangeEnd`
  moves it from `onChange` instead (FR5)

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The current slider row, background track, filled range, tick marks and labels,
  thumbs, and adjacent text value presentation.
- The `slider`, `slider-control`, `slider-track`, and `slider-thumb` public
  targets.

**Does not own / non-goals**

- Label and validation-message presentation — owned by `component:Field` and
  `component:FieldStatus`.
- Value-tooltip presentation — owned by `component:Tooltip`.
- New public targets for the filled range, tick marks, mark labels, description,
  or adjacent text value display.
- A decision that the current target asymmetry should be preserved or removed.

## Public concepts

The record adds one public theming target, names the keyboard model (AR1), and
states which value `onChangeEnd` carries (FR5) without adding or changing a
component prop or value domain. Consumer props,
modes, states, and usage remain documented in `Slider.doc.mjs`.

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                          | Basis                                   | Review state                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------- |
| FR1 | The current render places a filled range, one or two thumbs, and optional tick marks over the background track.                                                                                                                                                                                                                                                                                                                              | Current source, docs, and focused tests | Verified current behavior; no new behavior decided |
| FR2 | `Slider`, `Interactive control`, `Track`, and `Thumb` carry the `slider`, `slider-control`, `slider-track`, and `slider-thumb` targets respectively.                                                                                                                                                                                                                                                                                         | Current source, public docs, and DEC-1  | Approved additive target contract                  |
| FR3 | Filled range, tick marks, mark labels, and adjacent text value display are stable rendered parts without their own current Slider target.                                                                                                                                                                                                                                                                                                    | Current source and public docs          | Verified current asymmetry; not ratified as policy |
| FR4 | Label and status presentation continue to use Field and FieldStatus; value tooltips continue to use Tooltip.                                                                                                                                                                                                                                                                                                                                 | Current source and focused tests        | Verified composition boundary                      |
| FR5 | `onChangeEnd` fires once when an interaction ends — a pointer drag or track press is released or cancelled, or a keyboard step (arrow, Page, Home, End) completes — and carries the value the owner renders after its synchronous response to that interaction's `onChange` calls, including any clamp, snap, or rejection; it never carries a value Slider emitted that the owner did not render. A range reports both values the same way. | Maintainer decision (DEC-3)             | Approved                                           |

### Observed current target asymmetry

ProgressBar currently exposes targets for its fill and marks, while Slider
exposes targets for its root row, interactive control, background track, and
thumbs but not its filled range, tick marks, mark labels, or adjacent text value
display. This is implementation evidence for a joint audit, not approval of
either component's remaining target shape.

### Allowed variation

- Orientation, single or range mode, disabled state, value-display mode, and the
  number or labels of supplied marks remain current capabilities rather than
  separate target names.
- A description, status message, mark label, text value, or value tooltip may be
  absent without changing the remaining anatomy.

### Representative states

| State                    | Required invariant                                                      | Allowed variation                                  |
| ------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------- |
| Single value             | One thumb and a filled range render over the track.                     | Orientation, value, disabled state, value display  |
| Range value              | Two thumbs bound the filled range.                                      | Values and minimum step separation                 |
| With marks               | Tick marks and optional mark labels align to the same range geometry.   | Mark count, values, and label presence             |
| With shared field output | Field or Tooltip renders the requested label, feedback, or value layer. | Description, status, disabled reason, tooltip mode |

### Transformation and precedence order

- ORD1: an arrow or Page key result snaps to the nearest step, then clamps to
  the bounds; Home and End go to `min` and `max` (AR1).
- ORD2: within one interaction, Slider calls `onChange`, the owner responds and
  renders, then `onChangeEnd` reports the rendered value (FR5).
- The anatomy decision (DEC-1) introduces no value, snapping, geometry,
  interaction, or styling precedence rule of its own.

### Performance and resources

- No new performance or resource rule is introduced.

## Accessibility contract

The anatomy decision (DEC-1) does not change Slider's accessible name, value,
range-thumb naming, description/status association, disabled behavior, or
value-tooltip behavior; AR1 records the keyboard model and its one correction.

- **AR1 — Slider adopts the APG Slider pattern** (`spec:AST-020/FR15`), each
  thumb as one composite control: every thumb is `role="slider"` with an
  accessible name (a range names each thumb), `aria-valuemin`, `aria-valuemax`,
  `aria-valuenow`, `aria-valuetext` when a formatter changes the spoken value,
  `aria-orientation`, and `aria-disabled` when disabled; every thumb is a Tab
  stop, enabled or disabled (`spec:AST-085`).
  ArrowUp and ArrowDown step by `step`; on a horizontal track the horizontal
  arrows follow the track's direction — ArrowRight increases and ArrowLeft
  decreases under LTR, and under RTL ArrowLeft increases and ArrowRight
  decreases; PageUp and PageDown step by ten steps; Home moves to `min` and End to `max`. In a range, a thumb never crosses the other past the minimum
  separation.

## Design relationships

| Anatomy or state               | Design requirement                                                                             | Representation authority        | Hierarchy role | Component contract |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------- | -------------- | ------------------ |
| Label and description          | Identify and explain the numeric setting.                                                      | Current shared-component source | Supporting     | FR4                |
| Slider and interactive control | Separate the outer row from the pointer/keyboard surface and its composite disabled treatment. | Current source and public docs  | Prominent      | FR1, FR2           |
| Track                          | Shows the available range behind the fill.                                                     | Current source and public docs  | Prominent      | FR1, FR2           |
| Filled range and thumbs        | Show the selected value or interval over the available range.                                  | Current source and public docs  | Prominent      | FR1, FR2, FR3      |
| Tick marks and labels          | Show optional supplied positions and their text.                                               | Current source and public docs  | Supporting     | FR1, FR3           |
| Value presentation             | Shows the formatted value as text or a shared Tooltip.                                         | Current source and public docs  | Supporting     | FR3, FR4           |
| Status message                 | Presents shared validation feedback below the slider.                                          | Current shared-component source | Supporting     | FR4                |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Label": {
    "delegatesTo": {"owner": "component:Field", "target": "field-label"}
  },
  "Description": {
    "none": {
      "reason": "unsettled: No current public target reaches this part; future target ownership is undecided."
    }
  },
  "Slider": {"target": "slider"},
  "Interactive control": {"target": "slider-control"},
  "Track": {"target": "slider-track"},
  "Filled range": {
    "none": {
      "reason": "unsettled: No current public Slider target reaches this part; future target ownership is undecided."
    }
  },
  "Tick mark": {
    "none": {
      "reason": "unsettled: No current public Slider target reaches this part; future target ownership is undecided."
    }
  },
  "Mark label": {
    "none": {
      "reason": "unsettled: No current public Slider target reaches this part; future target ownership is undecided."
    }
  },
  "Thumb": {"target": "slider-thumb"},
  "Value display": {
    "none": {
      "reason": "unsettled: No current public Slider target reaches this part; future target ownership is undecided."
    }
  },
  "Value tooltip": {
    "delegatesTo": {"owner": "component:Tooltip", "target": "tooltip"}
  },
  "Status message": {
    "delegatesTo": {
      "owner": "component:FieldStatus",
      "target": "field-status"
    }
  }
}
```

`Interactive control` names the pointer/keyboard hit surface and the composite
opacity boundary around the rail, fill, marks, and thumbs. `Filled range`, `Tick
mark`, `Mark label`, and `Value display` remain stable consumer anatomy, but no
current Slider target reaches them. The map records those gaps without making
their absence intentional. `Value display` names the adjacent text mode; the
separately listed value tooltip retains Tooltip's target.

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, factual
  `none` dispositions, and composition-preserving target ownership.
- Field, FieldStatus, and Tooltip retain their existing public target contracts
  when composed by Slider.
- Slider and ProgressBar both render a track, a filled segment, positioned
  indicators, and optional value presentation, while their current target
  coverage differs. That evidence requires a future joint family/audit pass; it
  does not declare a current family, require a new target, or authorize runtime
  behavior changes.

## Verification map

| Contract            | Verification                                                                                                                                                                                                                                                                                                                                                                                                                 | Representative states                                                                       | Mutation or failure expectation                                                                                                                                       | Audit section                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| FR1                 | `Slider.test.tsx` structure, range, and marks suites                                                                                                                                                                                                                                                                                                                                                                         | Single, range, horizontal, vertical, marks                                                  | Removing or misaligning stable parts breaks existing role, position, or mark assertions.                                                                              | `audit:Slider/anatomy`       |
| AR1                 | Slider accessibility contract (`internal/a11y-spec`, pending) bound to Slider; disabled-thumb Tab stop pending conformance; in jsdom and Chromium; `Slider.test.tsx` keyboard suites, including "follows the mirrored track under RTL: ArrowLeft increases, ArrowRight decreases, Up/Down unchanged" and "keeps ArrowLeft decreasing on a vertical track under RTL"; the Page, Home/End and Up/Down cases under the contract | Single and range; horizontal LTR and RTL; vertical; disabled; formatted value               | A thumb loses its role, name or value properties; an arrow, Page, Home or End key stops stepping or steps against the mirrored track; a range thumb crosses the other | `audit:Slider/accessibility` |
| FR2                 | `Slider.test.tsx`, `themingTargets.test.ts`, generated probe theme, and Chromium                                                                                                                                                                                                                                                                                                                                             | Root, horizontal/vertical control, disabled control, track, and thumb                       | A target class/state is missing, undocumented, or placed outside its owning anatomy.                                                                                  | `audit:Slider/theming`       |
| FR3                 | Source and consumer-doc review                                                                                                                                                                                                                                                                                                                                                                                               | Filled range, marks, labels, adjacent text value                                            | A missing target is inaccurately documented as present or intentionally permanent.                                                                                    | `audit:Slider/theming`       |
| FR4                 | Source inspection; focused tests cover label, status, and disabled-reason Tooltip only                                                                                                                                                                                                                                                                                                                                       | Label, status, value tooltip, disabled reason                                               | Shared composition or its accessible association disappears; value-tooltip composition still lacks focused coverage.                                                  | `audit:Slider/anatomy`       |
| FR5                 | Pending: `Slider.test.tsx` change-end cases driven by an owner that renders, clamps, or rejects the emitted value (not yet in the suite)                                                                                                                                                                                                                                                                                     | Single and range; pointer release before and after the owner re-renders; each keyboard step | `onChangeEnd` reports a value the owner did not render, fires more than once per interaction, or skips a completed keyboard step                                      | `audit:Slider/accessibility` |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                                                                                                                                                                                                                                                                                                                                                                | Canonical anatomy and four current local targets                                            | Missing, extra, prefixed, stale, or unclaimed mappings fail repository validation.                                                                                    | `audit:Slider/theming`       |

The focused Slider suite asserts the `slider-control` target's orientation and
disabled state. Source/metadata guards cover all four target declarations. The
suite covers only the disabled-reason Tooltip path, not the
`valueDisplay="tooltip"` composition; that anatomy is source-inspected and
remains missing focused test coverage.

## Decision log

### DEC-1 — Interactive control is public Slider anatomy

**Reference:** `component:Slider/DEC-1`
**Decider:** cixzhang, 2026-09-14

The stable pointer/keyboard interaction and compositing surface is a
consumer-recognizable part, so it carries `slider-control`. `Thumb` remains
separate anatomy and continues to carry `slider-thumb`. This adds no default
behavior or styling change.

### DEC-2 — Each thumb is an APG slider, and horizontal arrows follow the track

**Reference:** `component:Slider/DEC-2`
**Decider:** `cixzhang`, `2026-10-13`

A thumb already plays the slider role as one composite control, so it carries the pattern's value properties and its whole keyboard model (AR1). The horizontal arrows follow the track's painted direction because a key that moves the thumb against the way it travels on screen is a defect, not a convention; the vertical arrows and Up/Down are direction-free.

Rejected: keeping ArrowRight as "increase" under RTL; a Tab stop or arrow model per range thumb that differs from the single thumb.

### DEC-3 — `onChangeEnd` reports the value the owner renders

**Reference:** `component:Slider/DEC-3`
**Decider:** `cixzhang`, `2026-10-16`

`onChangeEnd` marks the end of an interaction, so it reports what the slider shows when the interaction ends: the controlled value after the owner has answered `onChange`. An owner that clamps, snaps, or rejects a value therefore receives the value it kept, and the commit agrees with the thumb (FR5).

Rejected: reporting the last value Slider emitted through `onChange`.

## Open questions

- **OQ1 — After a joint ProgressBar and Slider family audit, should any shared
  painted parts have aligned target coverage?** (`human-api`)

This question records the audit need only. It does not presume that either
component should add, remove, or rename a target.

## Content boundary

This file does not duplicate consumer prop tables, examples, implementation
steps, audit outcomes, or shared-component contracts. It links to their owners.
