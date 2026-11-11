---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-119
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [nynexman4464]
affects_architecture: []
affects_families: [family:overlay-dismissal]
affects_contributing: []
affects_consumer_docs: [Tour]
---

# Tour steps as data system spec

<!-- path-applicability:v1 -->

```json
{
  "paths": ["packages/lab/src/Tour/**"]
}
```

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, research, or project status (what is built so far, what goes first) in the record. A requirement gap reads `<FR or INV id> gap: <observable mismatch>`; one line such as `Status: in progress` may say the record is still in progress. See docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A Tour walks a person through a feature one step at a time. Each step is a
callout beside the element it describes, or centered when it describes no
element. The app lists the steps as data, decides which step is active, and
writes every word the person reads. A step the app leaves out of the list does
not exist, so a control that is off for this person never gets a step.

A step never stands between the person and the page. The person can reach and
use the control a step points at, by pointer and by keyboard, and the tour
keeps running. Tour owns the callout, the highlight, the optional dimming and
where focus goes; the app owns the content, when the tour runs, and what
happens between pages.

## Non-goals

- A welcome or intro modal before the first step. The app composes a Dialog.
- Remembering whether a person has seen a tour, and analytics.
- Tours across pages or routes. The app sets the active step after it
  navigates.
- Beacons or hotspots that invite a person to start a tour.
- The anchor, modality and focus return primitives a step uses
  (`spec:AST-116`).

## Requirements

### Steps

- **FR1 — Steps are a list of data.** Tour takes `steps`, an array of step
  objects. Each step has a unique `id`, a `title`, and optionally a `body`, a
  `target` and a placement. Step order is array order. Duplicate ids warn in
  development, and the later step is ignored.
- **FR2 — A step left out does not exist.** The step count ("2 of 3"), Back and
  Next count only the steps in the array. The app makes a step conditional by
  leaving it out, for example when a gatekeeper hides the control it describes.
- **FR3 — The list may change while the tour runs.** A step added or removed
  takes its place at once. When the active step is removed, the step that now
  follows its old position becomes active and Tour reports it through
  `onActiveStepChange`. With no step after it, the tour ends as `'complete'`.
- **FR4 — The app owns the active step.** `activeStepId` names the active step;
  `null` means the tour is not running. Back and Next report the step they move
  to through `onActiveStepChange`, and the app may set any step at any time,
  for example from the target's own click handler. An `activeStepId` that
  matches no step renders nothing and warns in development.
- **FR5 — Every end reports why.** `onEnd(reason)` reports `'complete'` (the
  last step's Done), `'skip'` (Skip), `'close'` (the close control), `'escape'`
  (FR14) or `'backdrop'` (`component:Tour` FR1). The app sets `activeStepId`
  to `null` in response.

### Targets

- **FR6 — A target is an element, a lookup, or nothing.** `target` accepts a
  ref or a function that returns an element or `null`, resolved as a Popover
  anchor (`spec:AST-116` FR2, FR3). A step without `target` shows centered in
  the viewport, with no highlight.
- **FR7 — A target off screen scrolls into view.** When a step shows and its
  target is outside the viewport or a scrolling ancestor's visible area, the
  target scrolls into view, instantly under reduced motion. A step or the Tour
  sets `scrollsIntoView: false` to leave scrolling to the app.
- **FR8 — The app decides about a missing target.** When a step shows and its
  target resolves to nothing, Tour calls `onTargetMissing(step)`. It returns
  `'skip'` (move to the next step), `'end'` (end as `'complete'`) or
  `'center'` (show the step centered). Without the callback the step is
  skipped and Tour warns in development. Tour sets no timer and does not wait.
- **FR9 — A step can prepare its target.** A step's optional `onBeforeShow`
  runs before Tour resolves the target, and Tour waits for the promise it
  returns, for example while the app opens a panel. Until it settles, no
  callout shows and focus does not move. A rejected promise is treated as a
  missing target (FR8).
- **FR10 — A target that leaves hides the callout.** While the active step's
  target is out of view or out of the document, its callout is hidden and the
  tour keeps running (`spec:AST-116` FR6, FR7). It shows again when the
  target returns.

### Callout

- **FR11 — The app writes the words.** A callout shows the step's `title` as
  its heading and its `body`. Tour supplies only its own control labels — Back,
  Next, Done, Skip, the close control and the step count — translated with
  the rest of Core and overridable through `labels`.
- **FR12 — Controls follow the step's place.** Back is absent on the first
  step. The last step shows Done in place of Next. Skip and the step count
  show when the Tour asks for them.
- **FR13 — The target is highlighted.** The active target has a visible ring.
  With a backdrop, the page outside the target is dimmed, and presses follow
  `component:Tour` FR1. The ring and the dimming are hidden from assistive
  technology.

### Focus and keyboard

- **FR14 — A step is non-modal.** Each callout is a non-modal popover
  (`spec:AST-116` FR12; `component:Tour` AR1). Tab moves from the callout
  through the page in the browser's order, and the target stays operable by
  pointer and keyboard. Escape ends the tour with `'escape'` only while focus is
  in the callout or on its target (`spec:AST-116` FR15).
- **FR15 — Focus follows the tour, not the app.** When a step shows, focus
  moves to its heading if focus is in the previous callout, on the previous
  target, or on the page body. Focus that the person placed anywhere else stays
  there, and the new step is announced politely.
- **FR16 — Focus returns when the tour ends.** When the tour ends with focus in
  the callout, focus goes to the active step's target, else through the shared
  return chain (`spec:AST-116` FR17–FR20). Focus elsewhere is not moved.
- **FR17 — A callout is a labelled dialog.** The callout has role `dialog`
  without `aria-modal`. It is labelled by its title and described by its body.
  The step count is part of its accessible description.

### Platform support

- Supported feature/engine floor: the layer runtime's CSS anchor positioning
  floor, as for Popover.
- Unsupported behavior: in the runtime's reduced browser fallback, placement
  follows the fallback; FR7–FR10 and FR14–FR17 are unchanged.
- Browser evidence: real Chromium, Firefox and WebKit for FR7, FR10 and
  FR14–FR16; jsdom for step order, ARIA and event ordering.

## Current-state impact

- `component:Tour`: Public concepts gains Steps, Active step, Target and
  Missing target rows; its Ownership boundary takes placement, step focus and
  controls from FR6–FR17; AR1 points to FR14. DEC-1 and FR1 are unchanged.
- Consumer docs: `Tour.doc.mjs` documents the step array, conditional steps,
  the active step, missing targets and the intro-Dialog recipe.
- Lab `Tour` and `TourStep` take `<TourStep>` children. Core `Tour` takes a
  `steps` array; the lab doc carries a migration example.

FR1 gap: lab steps are `<TourStep>` children, ordered by mount order.
FR6 gap: a lab target must be a button.
FR8 gap: a lab target that is not in the document when its step starts never
shows, and nothing reports it.
FR11 gap: lab control labels are English only.
FR14 gap: lab keyboard focus stays in the callout (`component:Tour` AR1 gap).
FR5 gap: lab never reports `'escape'` or `'skip'`.

## Verification

| Contract  | Verification                            | Representative states                                                                      | Mutation or failure expectation                                                                  |
| --------- | --------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| FR1–FR3   | `Tour.test.tsx` steps suite             | Three steps; the middle one left out; the active step removed; the last step removed       | A count or Back/Next that includes a left-out step, or a removed active step left showing, fails |
| FR4, FR5  | `Tour.test.tsx` control suite           | Back, Next, Done, Skip, close, Escape; the app setting a step from a target's click        | A step change not reported, a missing or wrong end reason, or an internal step override fails    |
| FR6, FR7  | `Tour.test.tsx` and a real-browser spec | Ref, lookup and no target; a target below the fold and in a scrolled panel; reduced motion | No scroll, a smooth scroll under reduced motion, or a highlight on a centered step fails         |
| FR8, FR9  | `Tour.test.tsx` target suite            | Missing target with each answer and with no callback; a pending and a rejected preparation | A timer, a callout shown before preparation settles, or a missing target with no report fails    |
| FR10      | Real-browser spec                       | The target scrolled out and removed while its step shows                                   | A callout over unrelated content, or an end, fails                                               |
| FR11–FR13 | `Tour.test.tsx` callout suite           | First, middle and last steps; Skip and count on and off; a locale; `labels`                | A built-in title or body text, Back on the first step, or an untranslated label fails            |
| FR14–FR17 | `Tour.test.tsx` and a real-browser spec | Tab from the callout and the target; Escape in and out; each focus origin at a step change | Focus held in the callout, focus taken from the person, or `aria-modal` on a callout fails       |

## Decision log

### DEC-1 — Steps are data the app controls by id

**Reference:** `spec:AST-119/DEC-1`
**Decider:** proposed under `nynexman4464`'s direction to pick the best step model (2026-11-11), pending his and owner review

Steps are an array of plain objects with stable ids, and the app names the
active step. The app can then advance from its own handlers, resume a tour,
and continue it on another page, and the step order never depends on which
part of the page rendered first.

Rejected: `<TourStep>` children ordered by render order, and an imperative
step builder.

### DEC-2 — A step is conditional by being absent

**Reference:** `spec:AST-119/DEC-2`
**Decider:** proposed under `nynexman4464`'s direction that steps be conditional (2026-11-11), pending his and owner review

The app knows at render time whether a step applies, so it leaves the step out
of the array, and the count and the controls follow.

Rejected: a per-step visibility predicate, which repeats what filtering the
array already does.

### DEC-3 — Tour never waits on a timer

**Reference:** `spec:AST-119/DEC-3`
**Decider:** `nynexman4464` (direction, 2026-11-11), pending owner review

Only the app knows whether a missing target will appear, so Tour asks the app
(FR8) or waits for the app's own preparation (FR9). A target that exists but is
off screen scrolls into view.

Rejected: waiting a fixed time for a target to appear.

### DEC-4 — Tour owns the chrome; the app owns the words and the journey

**Reference:** `spec:AST-119/DEC-4`
**Decider:** `nynexman4464` (direction, 2026-11-11), pending owner review

Tour owns the callout, the highlight, the dimming, focus and its own control
labels. The app owns every title and body, the intro Dialog, whether a person
has seen the tour, and moving between pages.

Rejected: an intro-modal step type inside Tour, which duplicates Dialog.

## Open questions

- **OQ1 — Input names.** (`human-api`) `steps`, `activeStepId`,
  `onActiveStepChange`, `onEnd`, `onTargetMissing`, `onBeforeShow`,
  `scrollsIntoView` and `labels` are proposed names.
- **OQ2 — A step that the person must complete.** (`human-api`) A step that
  asks the person to use its target may hide Next, so the step ends only when
  the app moves on.
  - A per-step `isNextShown: false`.
  - Next always shows.
- **OQ3 — Uncontrolled use.** (`human-api`) Whether Tour also takes
  `defaultActiveStepId` and manages the active step itself.
