---
schema_version: 3
template_version: 7
kind: component
id: component:Step
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-27
owners: [cixzhang]
review_triggers: [public-api, behavior, accessibility]
verified_by:
  [
    packages/core/src/Stepper/Stepper.test.tsx,
    apps/storybook/stories/Stepper.stories.tsx,
  ]
modules: []
families: []
design_specs: []
architecture:
  [architecture:interaction-modality, architecture:component-theming-surface]
contributing: []
system_specs: [spec:AST-085]
---

# Step component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `Step` with `step`, `label`, `description`, `children`, `status`, `indicator` (`auto`, `number`, `none`, or a node; default `auto`), `isDisabled`, `isOptional`, `endContent`, and `density`.                                                                                |
| Behavior                | One list item of a Stepper. Its progress (completed, in progress, not started) comes from its `step` index against the Stepper's active step; it is a button that asks to go to that step when the Stepper has `onStepClick`, it is enabled, and the Stepper is not compact. |
| End-user impact         | Users see each step's progress (number, ring, or check) and its status cue where one applies; screen-reader users hear the current step, a status word, and a "Go to step N" name on clickable steps; keyboard users Tab between enabled clickable steps.                    |
| Builder impact          | None.                                                                                                                                                                                                                                                                        |
| Compatibility/readiness | Records shipped behavior; no public change. Three implementation gaps (see Current-state impact).                                                                                                                                                                            |
| Review checks           | Reject status conveyed only by color under `indicator="auto"`, an indicator exposed to assistive technology, a disabled step that activates, or `aria-current` on anything but the in-progress step.                                                                         |
| Governing rules         | `component:Stepper` (targets, connector, label paint, compact layout); `architecture:interaction-modality`.                                                                                                                                                                  |

This table is a review projection; the body below is authoritative.

## Intent

Step is one stage of a Stepper flow. It owns its progress derivation, its
indicator choice, its status cues and text alternatives, its clickable form, its optional cue, and where its content renders. Consumer usage lives in `Step.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: progress follows the Stepper's active step
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **A disabled step leaves the tab order.** In a clickable Stepper outside
  compact mode a disabled Step renders no button, so keyboard users cannot reach
  it or learn that it is disabled, and a focused step that becomes disabled
  loses its button, dropping focus to the page. `spec:AST-085` FR1, FR4, and FR5
  have a disabled control stay focusable, keep focus, and expose
  `aria-disabled="true"`.
- **Other indicator modes show status by color alone, or not at all.** With
  `indicator="number"`, a reached step shows status only through badge color
  and a not-started step shows none. A custom node shows status only through
  its wrapper's color, on every step. `indicator="none"` shows no indicator, and
  under `auto` the current step's ring and label keep progress color whatever
  its `status`, so in both cases status shows only in the visually hidden word. WCAG 1.4.1 requires information
  not to be conveyed by color alone.
- **A clickable step's name hides its other text.** The button's name is the
  step number, label, and status word, and nothing describes it, so the
  description, the "Optional" cue, and `endContent` never reach assistive
  technology on a clickable step. WCAG 1.3.1 requires information shown to be
  available programmatically.

## Ownership boundary

**Owns**

- Progress derivation, indicator selection, status glyphs and text, the
  clickable button, disabled and optional handling, and density fallback
  (FR1–FR7).
- Where `children` render and how they stay mounted (FR8), and the focus outline
  (FR9).

**Does not own / non-goals**

- The `step`, `step-bar`, `step-connector`, `step-indicator`, `step-label`, and
  `step-description` targets, connector geometry and gap, Label and Description
  paint, and the compact horizontal presentation — owned by `component:Stepper`
  FR1–FR16.
- The active step, orientation, indicator position, and `onStepClick` — owned by
  the Stepper and its caller.
- Custom indicator artwork, `endContent`, and `children` — owned by the caller.

## Public concepts

| Concept   | Closed values or states                   | Meaning                                            | Availability by variant/orientation/state | Default                | Owner            | Stability | Invalid-value behavior                                                             |
| --------- | ----------------------------------------- | -------------------------------------------------- | ----------------------------------------- | ---------------------- | ---------------- | --------- | ---------------------------------------------------------------------------------- |
| Progress  | `completed`, `in-progress`, `not-started` | Derived from `step` and the Stepper's active step. | Every step.                               | —                      | `component:Step` | Stable    | Not caller-settable.                                                               |
| Status    | `accent`, `success`, `warning`, `error`   | Semantic color and glyph for the indicator.        | Every step.                               | Unset (progress color) | `component:Step` | Stable    | TypeScript rejects other values.                                                   |
| Indicator | `auto`, `number`, `none`, node            | What the indicator shows.                          | Every step.                               | `auto`                 | `component:Step` | Stable    | A non-string node renders as given; another string shows the ring, then the check. |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Basis                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| FR1 | A Step renders one `<li>`. Its progress is `in-progress` when `step` equals the Stepper's active step, `completed` when it is lower, and `not-started` when higher; only the in-progress step carries `aria-current="step"`. It registers its index and a live disabled check with the Stepper.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current source and tests        |
| FR2 | With `onStepClick` on the Stepper, an enabled Step outside compact mode wraps its indicator, label, and description in a `<button>` (the content slot stays outside it) named by `@astryx.step.goToStep` ("Go to step N: label") or `.goToStepWithStatus` when a status word applies; activation (click, Enter, Space) calls `onStepClick(step)`. Completed, in-progress, and upcoming steps are all clickable. Any Step without `onStepClick` renders no button. A disabled Step in a clickable Stepper outside compact mode MUST stay focusable with `aria-disabled="true"` and keep its tab stop (`spec:AST-085` FR1, FR5). Implementation gap: it renders no button, so it leaves the tab order, exposes no disabled state, and drops focus when it becomes disabled while focused (`spec:AST-085` FR4). | Current source and tests        |
| FR3 | `indicator="auto"` shows the number while not started, the ring while in progress, and a check once completed; `number` always shows the number; `none` shows nothing; a non-string node renders as given; any other string falls back to the ring while not started or in progress and the check once completed, with no number, status glyph, or status color. Indicators are `aria-hidden`.                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and tests        |
| FR4 | `status` never recolors the progress bar. Under `indicator="auto"` it recolors a non-current step with `success`, `warning`, or `error` and shows a distinct status glyph (replacing the number on not-started steps); the current step's ring and `accent` keep progress color. Under `number` it recolors reached badges only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source and tests        |
| FR5 | Each Step exposes a visually hidden status word: `error` or `warning` for those statuses, `completed` when completed or `success`, in every layout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current source and tests        |
| FR6 | `isDisabled` dims the indicator with fixed paint and no theme state (the label's disabled paint and its `disabled` selector are `component:Stepper` FR10) and blocks activation (FR2's implementation gap). `isOptional` appends the translated `@astryx.step.optional` ("Optional") after the label. `endContent` sits at the end of the label row.                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and tests        |
| FR7 | `density` sets the Step's padding: block padding in every layout, plus inline padding for spacious separated steps and both axes for vertical on-track steps; it falls back to the Stepper's density.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Current source                  |
| FR8 | `children` render below the label and description; in a compact horizontal Stepper they stay mounted, hidden with the expanded details, so local state survives. The label stays on one line and ellipsizes; its full text remains in the accessible name.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current source, docs, and tests |
| FR9 | The step button paints the shared focus outline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current source                  |

### Allowed variation

- **AV1 — Indicator artwork.** A custom node may replace the indicator.
- **AV2 — Layout.** Orientation and indicator position come from the Stepper.

### Representative states

| State                  | Required invariant                                          | Allowed variation |
| ---------------------- | ----------------------------------------------------------- | ----------------- |
| Completed, clickable   | Check indicator; "completed" text; named button.            | Status color.     |
| In progress            | `aria-current="step"`; ring indicator.                      | —                 |
| Not started with error | Error glyph replaces the number; "error" text.              | —                 |
| Disabled               | Dimmed; no activation. Implementation gap: no button (FR2). | —                 |
| Compact horizontal     | No button; content mounted but hidden.                      | —                 |

### Transformation and precedence order

- **ORD1 — Status word.** `error`, then `warning`, then `completed` (completed
  progress or `success`).
- **ORD2 — Density.** Step `density`, then the Stepper's.

### Performance and resources

- No resource rule.

## Accessibility contract

- **AR1 — Current step.** FR1's `aria-current="step"`.
- **AR2 — Non-color status.** With `indicator="auto"`, FR4's glyphs and FR5's
  hidden text carry status beyond color; indicators stay hidden from assistive
  technology. Implementation gap: in `number`, custom-node, and `none` modes,
  and on the `auto` current step, status shows by color alone or only in the
  hidden word (Current-state
  impact).
- **AR3 — Clickable name.** FR2's button name includes the step number, label,
  and status word. Implementation gap: a clickable step's description, optional
  cue, and `endContent` are not exposed (Current-state impact).
- **AR4 — Keyboard.** Clickable steps are reached with Tab in document order and
  activate with Enter or Space; today disabled steps are skipped (FR2's
  implementation gap).

## Design relationships

| Anatomy or state | Design requirement                                 | Representation authority       | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Indicator        | Number, check, status glyph, ring, or custom node. | Current source and public docs | Prominent      | FR3, FR4           |
| Optional cue     | "Optional" after the label.                        | Current source                 | Supporting     | FR6                |

`Step.doc.mjs` declares no anatomy of its own; Step anatomy and targets are in
`component:Stepper`'s theming map.

## Family and system relationships

- `component:Stepper` owns the targets, connector, Label and Description paint,
  and compact layout this component renders within.

## Verification map

| Contract     | Verification                                                        | Representative states                 | Mutation or failure expectation                                                                                                     | Audit section              |
| ------------ | ------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| FR1          | `Stepper.test.tsx` list and aria-current tests                      | Each progress                         | Wrong current step fails.                                                                                                           | `audit:Step/accessibility` |
| FR2, AR3–AR4 | `Stepper.test.tsx` onStepClick, keyboard, and accessible-name tests | Completed, active, upcoming, disabled | A missing button or wrong name fails; the disabled-step and Tab-skip assertions pin FR2's implementation gap (pending conformance). | `audit:Step/behavior`      |
| FR3, FR4     | `Stepper.test.tsx` step-number, indicator, and status glyph tests   | Each indicator mode and status        | Wrong glyph or recolored bar fails.                                                                                                 | `audit:Step/behavior`      |
| FR8          | `Stepper.test.tsx` compact content-mount tests                      | Both indicator positions              | Step content that loses its state while hidden in a compact Stepper fails.                                                          | `audit:Step/behavior`      |
| FR5, AR2     | `Stepper.test.tsx` hidden status text tests                         | Separated and on-track                | Missing status text fails.                                                                                                          | `audit:Step/accessibility` |

Read from source, with no focused test yet:

- FR3: the number on a not-started step and the check after completion under
  `auto`, the empty indicator under `none`, and the string fallback.
- FR6: the dimmed disabled paint, the optional cue, and `endContent`.
- FR7.
- FR8: the one-line label.
- FR9.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, or Stepper layout
rules. It links to their owners.
