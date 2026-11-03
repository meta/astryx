---
schema_version: 3
template_version: 3
kind: component
id: component:Stepper
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-02
owners: [cixzhang]
review_triggers: [public-api, theming, layout]
verified_by:
  [
    packages/core/src/Stepper/Stepper.test.tsx,
    packages/core/src/Stepper/Stepper.public.test.ts,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:component-theming-surface, architecture:public-component-api]
contributing: []
system_specs: [spec:AST-002/DEC-1]
---

# Stepper component contract

## Intent

Stepper presents an ordered flow of steps and the progress made through it. This
contract records its narrow-container behavior, anatomy-to-target map, public
semantic custom property `--step-connector-gap`, and Label and Description
ownership.

## Compatibility and migration

- Released default preserved: `yes` — `horizontalOptions.minimumStepWidth`
  still defaults to `112`, and `collapsedVariant` defaults to
  `withLabelAndControls`
- Compatibility class: breaking API narrowing relative to `0.5.3`.
  `minimumStepWidth` now accepts pixel numbers only, `registerStep` replaces its
  disabled boolean with an optional options object, and `StepperContextValue`
  no longer names step count, compact state, the summary portal, or threshold
  measurement details
- Semantic delta: CSS-length collapse thresholds → numeric pixel thresholds;
  disabled snapshots passed to registration → an optional `getIsDisabled`
  callback; the context hook's public return → the same state, registration,
  and transition history without compact-layout implementation fields
- Review classification: owner-approved breaking simplification for FR14 and
  the public context boundary
- Controlled/uncontrolled behavior: not applicable
- Migration decision: convert CSS lengths to their intended pixel number,
  replace `registerStep(index, isDisabled)` with
  `registerStep(index, {getIsDisabled})` or omit the options, and stop reading
  the five removed context fields

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The `stepper`, `stepper-frame`, `stepper-summary`, `step`, `step-bar`,
  `step-connector`, `step-indicator`, `step-label`, and `step-description` targets.
- The two paint layers of a connector — the unfilled track (the element's own
  background) and the accent fill (an absolutely placed `::before`) — and the
  single clip that holds both off the indicator.
- Which pieces an on-track connector is drawn from, and how many.
- Reading `horizontalOptions.minimumStepWidth` as a pixel number and deriving
  compact state from that threshold, the Stepper width, and registered steps.
- Label and Description paint and the target ownership defined by FR9–FR11.

**Does not own / non-goals**

- Indicator artwork supplied through `indicator` — owned by the caller.
- The step content slot and any `endContent` — owned by the caller.
- Whether a step is complete: derived from `activeStep`, not from a caller-owned
  per-step lifecycle.
- The unpainted clickable inner column.

## Public concepts

| Concept                              | Closed values or states                            | Meaning                                                                                                                                                           | Availability by variant/orientation/state                                                                     | Default                                                    | Owner               | Stability | Invalid-value behavior                                                                                    |
| ------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| `--step-connector-gap`               | Any CSS `<length-percentage>`                      | How far the track stops short of the indicator, on the side facing it                                                                                             | `indicatorPosition="on-track"`, both orientations and both directions, only on steps that render an indicator | `0px`                                                      | `component:Stepper` | stable    | Clamped, never rejected: values below `0` resolve to `0`, values above `--spacing-2` cap at `--spacing-2` |
| `horizontalOptions.minimumStepWidth` | `number`                                           | Required within `horizontalOptions`; per-step width in pixels below which a horizontal Stepper uses its compact presentation                                      | Horizontal orientation                                                                                        | `112` when `horizontalOptions` is omitted                  | Caller              | stable    | TypeScript rejects non-numeric values; numbers are interpreted as pixels                                  |
| `useStepperContext` return           | `StepperContextValue`                              | Stepper state, transition history, and registration for descendant content; excludes step count, compact state, summary portal, and threshold measurement details | Descendants of `Stepper`                                                                                      | Current provider value                                     | Component           | stable    | Throws outside `Stepper`; TypeScript and runtime omit unsupported layout-coordination fields              |
| `horizontalOptions.collapsedVariant` | `withLabelAndControls \| withLabel \| hiddenLabel` | Required within `horizontalOptions`; whether compact mode shows a label with navigation controls, a label alone, or only the bare progress track                  | Compact horizontal orientation; controls require `withLabelAndControls` and `onStepClick`                     | `withLabelAndControls` when `horizontalOptions` is omitted | Caller              | stable    | TypeScript rejects unknown variants                                                                       |

Consumer syntax and description remain in `Stepper.doc.mjs` `theming.vars`.

## Behavioral and layout contract

| ID   | Candidate invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Basis                                | Draft review state        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------- |
| FR1  | `--step-connector-gap` falls back to `0px` where each connector consumes it and honors values inherited from an ancestor up to the nearest layer content boundary, or supplied through the `stepper` theming target.                                                                                                                                                                                                                                                                         | Reviewed defect (PR #5495)           | Settled                   |
| FR2  | The gap is applied to the ONE edge each segment faces the indicator from, mirrored per axis, so the pair leaves a hole centred on the node.                                                                                                                                                                                                                                                                                                                                                  | Current source and browser probe     | Settled                   |
| FR3  | One declaration covers both connector paint layers. A clip on the segment clips its `::before` with it, against one reference box, so the two cannot disagree.                                                                                                                                                                                                                                                                                                                               | Current source and browser probe     | Settled                   |
| FR4  | The resolved value is clamped to `max(0px, min(value, --spacing-2))` before use.                                                                                                                                                                                                                                                                                                                                                                                                             | Reviewed defect (PR #5495)           | Settled                   |
| FR5  | A step rendering no indicator (`indicator="none"`) applies no clip, leaving its track continuous.                                                                                                                                                                                                                                                                                                                                                                                            | Current source and browser probe     | Settled                   |
| FR6  | No accepted value changes the Stepper's outer size, in either orientation. A clip cannot affect layout.                                                                                                                                                                                                                                                                                                                                                                                      | Current source and browser probe     | Settled                   |
| FR7  | The horizontal clip mirrors under `dir="rtl"`, so the hole stays at the indicator rather than moving to the join between steps.                                                                                                                                                                                                                                                                                                                                                              | Reviewed defect (PR #5495)           | Settled                   |
| FR8  | The pieces an on-track connector is drawn from are not public: no `data-segment`, and no bare `lead`/`rail`/`content` class is emitted.                                                                                                                                                                                                                                                                                                                                                      | `component:Stepper/DEC-1`            | Settled                   |
| FR9  | In both indicator positions, each rendered Label and Description carries its own target and reflects `progress` and `status`.                                                                                                                                                                                                                                                                                                                                                                | Current source, docs, and tests      | Settled                   |
| FR10 | Label alone reflects `disabled`, because only Label owns disabled paint. Description and the other targets do not gain the selector for symmetry.                                                                                                                                                                                                                                                                                                                                            | Current source, docs, and tests      | Settled                   |
| FR11 | Label and Description each declare `font-size`, `line-height`, and `color`. Those declarations outrank values inherited from `step`, so only direct targets can expose that paint to themes.                                                                                                                                                                                                                                                                                                 | Current source and Chromium probe    | Settled                   |
| FR12 | A compact horizontal summary sits directly beneath its track without an additional frame gap.                                                                                                                                                                                                                                                                                                                                                                                                | Reviewed narrow-layout feedback      | Settled                   |
| FR13 | In compact `on-track`, indicators remain on the rail and the active indicator is not repeated beside the summary label; compact `separated` retains the active indicator beside its label.                                                                                                                                                                                                                                                                                                   | Reviewed narrow-layout feedback      | Settled                   |
| FR14 | `horizontalOptions.minimumStepWidth` accepts a number interpreted as pixels. Compact state compares the registered per-step width directly with that number; no threshold measurement element or observer is rendered.                                                                                                                                                                                                                                                                       | Configurable collapse threshold      | Settled                   |
| FR15 | `horizontalOptions.collapsedVariant` keeps horizontal-only configuration together: `withLabelAndControls` shows the label and controls, `withLabel` shows only the label, and `hiddenLabel` renders only the bare progress track with no compact row.                                                                                                                                                                                                                                        | Collapsed presentation consolidation | Proposed for owner review |
| FR16 | `useStepperContext` preserves Stepper state, transition history, and `registerStep`, while omitting `stepCount`, `isCompact`, `summarySlot`, `minimumStepWidth`, and `minStepWidthMeasureRef` from both its TypeScript type and runtime object. `registerStep(index, options?)` accepts an optional `getIsDisabled` callback instead of a disabled boolean, and compact navigation reads that callback again when a control activates so a stale render cannot select a newly disabled step. | Public context boundary              | Settled                   |

`status` on Label and Description is a selector seam. It does not claim that
Astryx paints either text part by status.

### Allowed variation

- **AV1 — Segment count.** How many elements draw one connector span may change
  with orientation and with the presence of a content slot, without becoming a
  regression. It is not public.
- **AV2 — Percentage resolution.** A percentage resolves against each segment's
  own box, so the hole may differ slightly between a fixed and a flexible
  segment. Both layers of any one segment still agree exactly (FR3).

### Representative states

| State                                                          | Required invariant | Allowed variation |
| -------------------------------------------------------------- | ------------------ | ----------------- |
| vertical, on-track, indicator                                  | FR2, FR3, FR6      | AV1, AV2          |
| horizontal, on-track, indicator                                | FR2, FR3, FR6, FR7 | AV1, AV2          |
| `dir="rtl"`, horizontal                                        | FR7                | AV1               |
| `indicator="none"`                                             | FR5                | —                 |
| value below `0` or above the cap                               | FR4, FR6           | —                 |
| both indicator positions; each progress/status; disabled Label | FR9–FR11           | —                 |
| compact horizontal summary                                     | FR12               | —                 |
| compact `on-track` and `separated` indicators                  | FR13               | —                 |
| custom numeric pixel collapse threshold                        | FR14               | —                 |
| public context read versus internal layout coordination        | FR16               | —                 |
| each `collapsedVariant`, with and without `onStepClick`        | FR15               | —                 |

### Transformation and precedence order

- **ORD1 — Gap resolution.** Read the inherited custom property → clamp to
  `max(0px, min(value, --spacing-2))` → apply as one `clip-path: inset()` on the
  segment. Both halves of the clamp are load-bearing, and neither for padding's
  reasons: `inset()` **accepts** a negative length rather than clamping it the
  way padding does, so the floor has to be written; the cap bounds an oversized
  gap to a short track.

### Performance and resources

- Horizontal Stepper instances register their list with the shared
  `ResizeObserver`. Numeric pixel thresholds are compared directly, so no second
  observer or measurement element is required.

## Accessibility contract

Compact layout preserves the ordered-list role and `aria-current` handling while
moving optional navigation to the summary controls.

## Design relationships

| Anatomy or state | Design requirement                                                     | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Stepper          | Lays the flow out on one orientation and indicator placement.          | Current source and public docs | Supporting     | FR1                |
| Frame            | Groups the ordered steps with the optional compact summary.            | Current source and public docs | Supporting     | —                  |
| Compact summary  | Names and controls the current step when horizontal labels collapse.   | Current source and public docs | Prominent      | —                  |
| Step             | Carries one step's status.                                             | Current source and public docs | Supporting     | —                  |
| Progress bar     | Presents progress as a segmented bar per step.                         | Current source and public docs | Prominent      | —                  |
| Connector        | Presents the track between indicators, and the progress made along it. | Current source and public docs | Prominent      | FR2–FR7            |
| Indicator        | Presents the step's position or completion.                            | Current source and public docs | Prominent      | FR5                |
| Label            | Identifies the step.                                                   | Current source and public docs | Prominent      | FR9–FR11           |
| Description      | Gives supporting context below the Label.                              | Current source and public docs | Supporting     | FR9–FR11           |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Stepper": {"target": "stepper"},
  "Frame": {"target": "stepper-frame"},
  "Compact summary": {"target": "stepper-summary"},
  "Step": {"target": "step"},
  "Progress bar": {"target": "step-bar"},
  "Connector": {"target": "step-connector"},
  "Indicator": {"target": "step-indicator"},
  "Label": {"target": "step-label"},
  "Description": {"target": "step-description"}
}
```

Connector is one anatomy part with one target, even though the on-track layouts
draw it from up to three elements. Those pieces are layout implementation, not
semantic parts, so they get no targets of their own — see `DEC-1`, which is also
why the caller-owned gap is a custom property rather than a per-piece vocabulary.

Label and Description are local spans styled by Stepper, not delegated `Text`
parts. Their own typography and color declarations make `inherits: step` false;
`DEC-2` records why they own direct targets instead.

## Family and system relationships

- `architecture:component-theming-surface` owns anatomy qualification, the
  guaranteed-property catalog, and the admission rule for public semantic
  variables.
- `architecture:public-component-api` owns the API admission bar those variables
  must also pass.

## Verification map

| Contract            | Verification                                                                          | Representative states                                         | Mutation or failure expectation                                                                                          | Audit section           |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| FR1                 | `Stepper.test.tsx` fallback and inheritance assertions                                | vertical and horizontal on-track                              | Declaring a default on the list blocks values inherited from its horizontal frame.                                       | `audit:Stepper/theming` |
| FR2, FR3            | `Stepper.test.tsx` clip assertions                                                    | vertical and horizontal on-track                              | Clipping the wrong edge, or per-layer copies of the value, fails the suite.                                              | `audit:Stepper/theming` |
| FR4, FR6            | `Stepper.test.tsx` clamp assertion                                                    | values below `0` and above the cap                            | Removing the floor lets a negative inset through; removing the cap unbounds the hole.                                    | `audit:Stepper/theming` |
| FR5                 | `Stepper.test.tsx` no-indicator assertion                                             | `indicator="none"`                                            | Applying the clip unconditionally puts holes in a track with no node in them.                                            | `audit:Stepper/theming` |
| FR7                 | `Stepper.test.tsx` RTL assertion                                                      | `dir="rtl"`, horizontal                                       | Dropping the mirror moves the hole to the join between steps; caught by the assertion.                                   | `audit:Stepper/theming` |
| FR8                 | `Stepper.test.tsx` vocabulary guard                                                   | vertical on-track                                             | Re-adding `data-segment` or a bare role class fails the guard.                                                           | `audit:Stepper/theming` |
| FR9, FR10           | `Stepper.test.tsx` target and generated-theme assertions                              | Both indicator positions; progress, status, and disabled      | Removing a target or state, or moving it off the painted span, fails focused tests.                                      | `audit:Stepper/theming` |
| FR11                | Exact-head Chromium probe                                                             | Themed `step`, Label, and Description                         | If inheritance reaches the text, the Step target's probe color appears there.                                            | `audit:Stepper/theming` |
| FR12                | `Stepper.test.tsx` compact frame gap assertion                                        | Compact horizontal summary                                    | Restoring frame spacing separates the summary from the track and fails the suite.                                        | `audit:Stepper/layout`  |
| FR13                | `Stepper.test.tsx` compact indicator assertions                                       | Compact `separated` and `on-track`                            | Repeating the on-track active indicator, or dropping the separated one, fails the suite.                                 | `audit:Stepper/layout`  |
| FR14                | `Stepper.test.tsx` threshold assertions                                               | Default and custom pixel number                               | Reintroducing threshold measurement or CSS-length support fails the runtime/type guards.                                 | `audit:Stepper/layout`  |
| FR15                | `Stepper.test.tsx` collapsed-variant assertions                                       | Three variants, with and without navigation                   | A variant shows an unrequested label/control or changes the accessible sequence.                                         | `audit:Stepper/layout`  |
| FR16                | `Stepper.public.test.ts` type assertions and `Stepper.test.tsx` runtime key assertion | Public hook/type and separate public/internal provider values | A named layout-coordination field reaches the public type/runtime object, or transition history/registration disappears. | `audit:Stepper/api`     |
| Theming anatomy map | `scripts/check-knowledge.mjs`                                                         | Canonical anatomy and the nine current targets                | A target with no anatomy owner, or a stale/extra part, fails repository validation.                                      | `audit:Stepper/theming` |

## Decision log

### DEC-1 — The connector gap is a public custom property, not a theme target per piece

**Reference:** `component:Stepper/DEC-1`
**Decider:** `cixzhang`, `2026-09-02`

The optional Connector anatomy represents the connected, on-track presentation;
its inner gap from the component-owned Indicator is a stable component
responsibility. A theme may want that track to stop short of the indicator rather
than run through it. Two otherwise identical Steppers need different resolved outcomes
and only the theme knows which, so the need is caller-owned
(`spec:AST-002/DEC-1` FR1). Astryx cannot derive it: nothing in the component's
state, content, or layout says whether this design wants a broken or a
continuous track.

No guaranteed CSS property on the owning target can express it. A connector
paints in two layers — the element's own background (the unfilled track) and a
`::before` at `inset: 0` (the accent fill) — and a theme target reaches the
element only. Measured in Chromium against a built theme override on
`step-connector`, three steps, vertical:

- `paddingBlock: 6px` produces **no hole at all**. The element's background
  paints to its border box, and the fill is a pseudo-element the theme cannot
  reach, so the only observable effect is the Stepper growing 108px → 120px.
- `paddingBlockEnd: 6px` produces no hole either, and would in any case address
  only one of the two edges: the leading segment faces the node with its far
  edge, the trailing segment with its near one.

Only the component can put one clip on the segment that takes its pseudo-element
with it, mirror it per axis and per direction, and clamp the value first.

Rejected: exposing `lead` / `rail` / `content` as a public segment vocabulary
(the earlier form of this change). The words never reached generated docs, they
emitted bare `lead` / `content` classes a consumer stylesheet can collide with,
and `lead` denotes different geometry per orientation, so a theme selecting it
could not know what it would get.

### DEC-2 — Label and Description own direct targets

**Reference:** `component:Stepper/DEC-2`
**Decider:** `cixzhang`, `2026-09-02`

FR9–FR11 define the admitted targets, state selectors, and inheritance
evidence. Rejected alternatives: `inherits: step` fails FR11;
`delegatesTo: component:Text` describes a composition Stepper does not render;
and `step-row` would expose an unpainted wrapper for speculative styling.

### Candidate DEC-3 — Horizontal behavior uses one options object

**Reference:** `component:Stepper/DEC-3`
**Status:** owner review requested

Two otherwise identical horizontal Steppers can need different collapse points
or compact content: one may use short fixed labels while another uses wider
localized labels; one surrounding flow may own Back/Continue or a step heading
while another relies on the Stepper. The caller owns those distinctions. Existing
styling seams cannot select the compact React presentation because collapse
changes rendered labels, focus targets, navigation controls, and preserved
content rather than paint alone.

`horizontalOptions` keeps these horizontal-only decisions out of the Stepper's
top-level API. `minimumStepWidth` names the per-step space the caller is
guaranteeing. It is a pixel number, following other Astryx size props, so the
Stepper compares it directly without a browser-resolved probe or a second
observer. `collapsedVariant` is one closed choice because its values describe
the complete compact presentation and avoid conflicting boolean combinations.

### DEC-4 — Public context excludes compact-layout implementation fields

**Reference:** `component:Stepper/DEC-4`
**Decider:** `imdreamrunner`, `2026-09-06`

`useStepperContext` preserves the existing Stepper state and transition history.
Its `registerStep` contract replaces the disabled boolean with an optional
options object whose `getIsDisabled` callback lets compact navigation read the
Step's current state. Separate public and package-internal contexts make the
runtime boundary match the type boundary: the public provider contains exactly
the supported keys, while the internal provider adds `stepCount`, `isCompact`,
and `summarySlot` for the built-in `Step`. `minimumStepWidth` and
`minStepWidthMeasureRef` disappear entirely with the pixel-only threshold
implementation.

Rejected: returning the package-internal provider value from
`useStepperContext()` with only a narrower TypeScript return type. JavaScript
could still read the removed fields, making the runtime API contradict the
public contract.

## Open questions

- Owner review of FR15 and the `horizontalOptions.collapsedVariant` public API
  admission argument.

## Content boundary

This file does not duplicate consumer prop tables, examples, implementation
steps, or system rules. It links to their owners.
