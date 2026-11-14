---
schema_version: 3
template_version: 7
kind: component
id: component:CircularProgress
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
owners: [nynexman4464]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by: [packages/lab/src/CircularProgress/CircularProgress.test.tsx]
modules: []
families: []
design_specs: []
architecture: []
contributing: []
system_specs: []
---

# CircularProgress component contract

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public contract         | `CircularProgress` with `value`, `max` (100), `label`, `isLabelHidden` (true), `hasValueLabel`, `formatValueLabel`, `children` (center content), `size`, `variant` (`accent`), `isIndeterminate` and `isDisabled`; target `circular-progress`. |
| Behavior                | A determinate ring fills clockwise from the top in proportion to `value / max`, clamped to the track; an indeterminate ring turns as Spinner does. Center content shows inside the ring.                                                       |
| End-user impact         | A person sees how far along a task or score is as a ring, and assistive technology reads it as a progress bar with its value.                                                                                                                  |
| Builder impact          | The same value, label and variant vocabulary as ProgressBar, so a product switches between a bar and a ring without relearning the API.                                                                                                        |
| Compatibility/readiness | Lab. The record describes the lab component as it graduates to core. FR5 gap: no size above 64 px.                                                                                                                                             |
| Review checks           | Reject a ring without an accessible name, a fill outside the track, a determinate value announced on an indeterminate ring, or motion that ignores reduced-motion.                                                                             |
| Governing rules         | `component:ProgressBar` for the shared value vocabulary; `component:Spinner` for the indeterminate rotation.                                                                                                                                   |

This table is a review projection; the body below is authoritative.

## Intent

CircularProgress shows a known amount of progress, or a score against a
maximum, as a ring. It is the round counterpart of ProgressBar for places
where a bar does not fit: a card's hero metric, a compact status cell, a
completion badge. When the amount is unknown it turns like Spinner. Consumer
usage lives in `CircularProgress.doc.mjs`.

## Compatibility and migration

- Released default preserved: not yet released in core; lab defaults carry over.
- Compatibility class: additive (a new core export). Lab keeps its copy until removal.
- Controlled/uncontrolled behavior: controlled; `value` is the caller's.
- Migration decision: DEC-1.

## Ownership boundary

**Owns**

- The ring's geometry, fill, track, sizes and stroke widths.
- Value normalization, the value label and center content.
- The progress-bar semantics of the ring.

**Does not own / non-goals**

- The indeterminate rotation and its reduced-motion behavior — `component:Spinner`.
- Mapping a score to a status band — product call site; the caller picks `variant`.
- Segmented or multi-value rings (donut charts) — charts.

## Public concepts

| Concept        | Closed values or states                            | Meaning                                                                      | Availability by variant/orientation/state        | Default  | Owner                        | Stability    | Invalid-value behavior           |
| -------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ | -------- | ---------------------------- | ------------ | -------------------------------- |
| Size           | `sm` (32 px), `md` (48 px), `lg` (64 px)           | The ring's diameter; each step has its own stroke width.                     | Every state                                      | `md`     | `component:CircularProgress` | experimental | TypeScript rejects other values. |
| Variant        | `accent`, `success`, `warning`, `error`, `neutral` | The fill's semantic color; themes add variants by module augmentation.       | Determinate and indeterminate                    | `accent` | `component:CircularProgress` | experimental | TypeScript rejects other values. |
| Center content | `children`, the value label, or nothing            | What shows inside the ring; `children` take precedence over the value label. | Determinate; indeterminate shows `children` only | nothing  | `component:CircularProgress` | experimental | Not applicable                   |
| Indeterminate  | on, off                                            | Whether the amount is unknown; the ring turns and announces no value.        | Every size and variant                           | off      | `component:Spinner`          | experimental | Not applicable                   |

## Behavioral and layout contract

| ID  | Candidate invariant                                                                                                                                                    | Basis                       | Draft review state |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------ |
| FR1 | A determinate ring fills clockwise from the top in proportion to `value / max`. `value` clamps to `[0, max]`; a `max` of 0 or less fills nothing.                      | Current lab behavior        | verify             |
| FR2 | The fill draws on a full track of the same diameter and stroke width, with rounded ends that never overshoot the track at 0% or 100%.                                  | Current lab behavior        | verify             |
| FR3 | `hasValueLabel` shows the formatted value in the center (default: the rounded percentage); `formatValueLabel` replaces the format. `children` replace the value label. | Current lab behavior        | verify             |
| FR4 | `isIndeterminate` turns the ring with Spinner's rotor and its reduced-motion behavior, ignores `value` and `hasValueLabel`, and still shows `children`.                | Current lab behavior; DEC-1 | settled            |
| FR5 | `size` sets the diameter and stroke width from a fixed scale. FR5 gap: the scale ends at 64 px, so a hero gauge (about 160 px) has no size.                            | Current lab behavior; OQ1   | human decision     |
| FR6 | `isDisabled` draws the ring and its text in the disabled colors and keeps the value.                                                                                   | Current lab behavior        | verify             |
| FR7 | The fill color comes from `variant` through theme tokens; a theme adds a variant through `CircularProgressVariantMap`.                                                 | Current lab behavior        | verify             |

### Representative states

| State                         | Required invariant                                 | Allowed variation    |
| ----------------------------- | -------------------------------------------------- | -------------------- |
| 0%, 50%, 100%                 | Fill matches the fraction; no overshoot (FR1, FR2) | Stroke cap rendering |
| Value label and `children`    | `children` win over the value label (FR3)          | Typography per size  |
| Indeterminate, reduced motion | Slowed rotation, no value announced (FR4, AR1)     | Rotation speed       |
| Disabled                      | Disabled colors, value kept (FR6)                  | None                 |

## Accessibility contract

- **AR1 — A ring is a named progress bar.** The ring has role `progressbar`, is
  named by `label` (visually hidden by default), and announces `aria-valuenow`,
  `aria-valuemin`, `aria-valuemax` and `aria-valuetext` when determinate, and
  none of them when indeterminate.
- **AR2 — Decoration is hidden.** The SVG track and fill are hidden from
  assistive technology; center content is read as part of the page.
- **AR3 — Color is not the only signal.** A `variant` that carries status needs
  text nearby, such as the value label, `children` or the label shown.

## Design relationships

| Anatomy or state | Design requirement | Representation authority | Hierarchy role | Component contract |
| ---------------- | ------------------ | ------------------------ | -------------- | ------------------ |
| Track and fill   | None recorded      | unsettled                | prominent      | FR1, FR2, FR7      |
| Center content   | None recorded      | unsettled                | supporting     | FR3                |

The component implements design requirements without copying their rationale.

## Family and system relationships

- `component:ProgressBar` shares the value vocabulary: `value`, `max`, `label`,
  `isLabelHidden`, `hasValueLabel`, `formatValueLabel`, `variant`,
  `isIndeterminate` and `isDisabled` mean the same in both.
- `component:Spinner` owns the indeterminate rotation.

## Verification map

| Contract | Verification                                                                            | Representative states                           | Mutation or failure expectation                                                         | Audit section                          |
| -------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------- |
| FR1–FR3  | `CircularProgress.test.tsx`                                                             | 0/50/100%, `max` 0, value label, `children`     | A wrong fill fraction, an overshoot, or a lost label fails                              | `audit:CircularProgress/behavior`      |
| FR4, AR1 | `CircularProgress.test.tsx`, `CircularProgressMotion.a11y.chromium.spec.ts`             | Indeterminate, reduced motion                   | A value announced while indeterminate, or full-speed motion under reduced motion, fails | `audit:CircularProgress/motion`        |
| AR1, AR2 | `__tests__/CircularProgress.a11y.test.tsx` and `CircularProgress.a11y.chromium.spec.ts` | Each state in `CircularProgress.a11y.states.ts` | A missing name or value attribute, or an exposed SVG, fails                             | `audit:CircularProgress/accessibility` |
| FR5      | Pending: OQ1                                                                            | Each size                                       | A size off the scale fails                                                              | None                                   |

## Decision log

### DEC-1 — CircularProgress is ProgressBar's round counterpart

**Reference:** `component:CircularProgress/DEC-1`
**Decider:** proposed, pending owner review

A product chooses a ring or a bar by the space it has, not by the API it knows.
CircularProgress therefore keeps ProgressBar's value, label and variant
vocabulary, and differs only in shape: size steps instead of a width, center
content instead of a header row, and no marks.

Rejected: a compound API of root, track, range and value-text parts, which
moves the ring's geometry and its accessibility wiring into every call site.

## Open questions

- **OQ1 — How large can a ring be?** (`human-api`) Hero metrics and score
  gauges draw a ring of about 160 px with a heavier stroke. The scale ends at
  64 px.
  - Add steps to the scale, such as `xl` and `2xl`, each with its stroke width.
  - Let `size` also take a pixel diameter, with the stroke derived from it.
- **OQ2 — Does the ring take an explicit stroke width?** (`human-api`) Today
  each size sets its stroke. A gauge may want a heavier stroke at the same
  diameter.

## Content boundary

This file does not duplicate consumer prop tables/examples, current audit
results, implementation steps, or family/system rules. It links to their owners.
