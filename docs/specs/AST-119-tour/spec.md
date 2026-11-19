---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-119
authority: current
archive_reason: null
superseded_by: null
approved_by: nynexman4464
approved_at: 2026-11-18
phase: accepted
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

A step without a backdrop never holds the keyboard. The person can reach and
use the control it points at, by keyboard and by pointer, and the tour keeps
running. A step with a backdrop is modal: it dims the page, keeps Tab in the
callout, and ends on a press outside it. Tour owns the callout, the highlight, the optional dimming and
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
  objects. Each step has a unique `id`, a `title`, and optionally a `body`, an
  `anchorRef`, a `placement` and an `alignment`, which place the callout against
  its anchor as Popover's do. Step order is array order. Duplicate ids warn in
  development, and the later step is ignored.
- **FR2 — A step left out does not exist.** The step count ("2 of 3"), Back and
  Next count only the steps in the array. The app makes a step conditional by
  leaving it out, for example when a feature flag hides the control it describes.
- **FR3 — The list may change while the tour runs.** A step added or removed
  takes its place at once. When the active step is removed, the step that now
  follows its old position becomes active and Tour reports it through
  `onActiveIdChange`. With no step after it, the tour ends as `'complete'`.
- **FR4 — The app owns the active step.** `activeId` names the active step;
  `null` means the tour is not running. Back and Next report the step they move
  to through `onActiveIdChange`, and the app may set any step at any time,
  for example from the anchor's own click handler on a step without a
  backdrop. An `activeId` that
  matches no step renders nothing and warns in development, except the id of
  a step FR3 has just removed: the step FR3 makes active shows until the app
  takes the new id.
- **FR5 — Every end reports why.** `onEnd(reason)` reports `'complete'` (the
  last step's Done, or an end that FR3 or FR8 makes), `'skip'` (Skip), `'close'` (the close control), `'escape'`
  (FR14) or `'backdrop'` (`component:Tour` FR1). The app sets `activeId`
  to `null` in response.

### Anchors

- **FR6 — An anchor is an element or nothing.** A step's `anchorRef` is a ref
  to an element, read as `usePopover`'s `anchorRef` is (`spec:AST-116` FR2,
  FR3). A step without `anchorRef` shows centered in the viewport, with no
  highlight.
- **FR7 — An anchor off screen scrolls into view.** When a step shows and its
  anchor is outside the viewport or a scrolling ancestor's visible area, the
  anchor scrolls into view, instantly under reduced motion.
  `hasScrollIntoView` (default `true`) set to `false` leaves scrolling to the
  app for every step.
- **FR8 — The app decides about a missing anchor.** When a step shows and its
  `anchorRef` holds no element in the document, Tour follows
  `missingAnchorBehavior`: `'center'` (the default: show the step centered,
  with no highlight, as a step with no `anchorRef` shows (FR6); the callout
  moves to the anchor when a later read finds it, `spec:AST-116` FR3),
  `'skipStep'` (move on in the direction of travel, to the next step after
  Next and the previous step after Back; a skipped last step ends the tour as
  `'complete'`, and a skipped first step on Back keeps the step that was
  showing; a step the app sets itself, or that FR3 promotes, skips forward) or
  `'endTour'` (end as `'complete'`). The step a skip lands on is reported
  through `onActiveIdChange`. Every step that starts without its anchor is
  reported once through `onMissingAnchor(id)` and warns in development. Tour
  sets no timer and does not wait.
- **FR9 — A step can prepare its anchor.** A step's optional `showAction`
  runs before Tour reads the anchor, and Tour waits for the promise it
  returns, for example while the app opens a panel. Until it settles, no
  callout shows and focus does not move. A rejected promise is treated as a
  missing anchor (FR8).
- **FR10 — The tour keeps running when an anchor leaves.** This covers an
  anchor that was there and then left; a step that starts without its anchor
  follows FR8. While the anchor is out of the document, the callout of a step
  without a backdrop shows no surface, and focus inside it moves out
  (`spec:AST-116` FR6, AR1). A step with a backdrop is not hidden then: it
  shows centered, with no highlight, and stays modal (FR14). Either callout
  goes back to the anchor when a later read finds it (`spec:AST-116` FR3).
  While the anchor is out of view, every callout follows the layer runtime's
  rule for an anchored layer (`spec:AST-059` FR5).

### Callout

- **FR11 — The app writes the words.** A callout shows the step's `title` as
  its heading and its `body`. Tour supplies only its own control labels — Back,
  Next, Done, Skip, the close control and the step count's format — as catalog
  messages, translated with the rest of Core. `nextLabel`, `doneLabel` and
  `skipLabel` reword Next, Done and Skip for one tour and win over the
  catalog. Back, the close control and the step count take the catalog's
  words.
- **FR12 — Controls follow the step's place.** Back is absent on the first
  step. Next shows on every step but the last, which shows Done in its
  place. Skip shows with `hasSkipButton` and the step count with
  `hasStepCount`.
- **FR13 — The anchor is highlighted.** The active anchor has a visible ring.
  With a backdrop, the page outside the anchor is dimmed, and presses follow
  `component:Tour` FR1. The ring and the dimming are hidden from assistive
  technology.

### Focus and keyboard

- **FR14 — The backdrop decides modality.** A step without a backdrop is a
  non-modal popover (`spec:AST-116` FR12; `component:Tour` AR1). Tab moves
  from its callout through the page in the browser's order, the anchor stays
  operable by keyboard and by pointer, and Escape ends the tour with
  `'escape'` only while focus is in the callout, or on or inside its anchor
  (`spec:AST-116` FR15). A step with a backdrop is a modal popover. Tab and
  Shift+Tab stay in its callout, a press outside the callout ends the tour
  (`component:Tour` FR1), and Escape ends the tour with `'escape'`.
- **FR15 — Focus follows the tour, not the app.** When a step without a
  backdrop shows, focus moves to its heading if focus is in the previous
  callout, on the previous anchor, or on the page body. Focus that the person
  placed anywhere else stays there, and the new step is announced politely. A
  step with a backdrop always moves focus to its heading.
- **FR16 — Focus returns when the tour ends.** When the tour ends with focus in
  the callout or on the page body, focus goes to the active step's anchor when
  it can take focus, else through the shared return chain (`spec:AST-116`
  FR17–FR20). Focus elsewhere is not moved.
- **FR17 — A callout is a labelled dialog.** The callout has role `dialog`,
  with `aria-modal` only on a step with a backdrop. It is labelled by its
  title and described by its body.
  The step count is part of its accessible description.

### Platform support

- Supported feature/engine floor: the layer runtime's CSS anchor positioning
  floor, as for Popover.
- Unsupported behavior: in the runtime's reduced browser fallback, placement
  follows the fallback, and FR10's out-of-view rule follows
  `spec:AST-059`'s fallback. FR7–FR9, the rest of FR10 and FR14–FR17 are
  unchanged.
- Browser evidence: real Chromium, Firefox and WebKit for FR7, FR10 and
  FR14–FR16; jsdom for step order, ARIA and event ordering.

## Current-state impact

- `component:Tour` governs the core Tour, which replaces the lab Tour; its
  path applicability moves to `packages/core/src/Tour/**` and its readiness
  leaves Lab. Public concepts gains Steps, Active step, Anchor and Missing
  anchor rows; its Ownership boundary takes placement, step focus and controls
  from FR6–FR17; AR1 points to FR14. Its Compatibility "Controlled/uncontrolled
  behavior" line names `activeId`, `onActiveIdChange` and `onEnd` (FR4, FR5) in
  place of `isActive` and `onDismiss`. FR1 is unchanged. DEC-1 gains an
  amendment line: its "a step is a non-modal layer" covers a step without a
  backdrop, and a step with a backdrop is modal (FR14, DEC-6).
- `family:overlay-dismissal`: FR2 names a Tour step's presence, and its
  matrix gains two Tour step rows: without a backdrop, Escape ends the tour
  only while focus is in the callout, or on or inside its anchor; with a
  backdrop, the step takes Escape as a modal layer does (FR14). An
  `FR2 gap:` line cites the FR14 gap. Its Lab TourStep row and member entry
  stay until the lab Tour goes.
- `spec:AST-116` DEC-5 gains an amendment line: the tour step it calls
  non-modal is a step without a backdrop (DEC-6).
- Consumer docs: `Tour.doc.mjs` documents the step array, conditional steps,
  the active step, missing anchors and the intro-Dialog recipe.
- Lab `Tour` keeps `<TourStep>` children. Core `Tour` takes a
  `steps` array; its doc carries a migration example from the lab.

FR1 gap: lab steps are `<TourStep>` children, ordered by mount order.
FR3 gap: lab steps follow an index; removing an earlier step moves the active
step, and removing the active last step shows nothing and reports no end.
FR4 gap: the app cannot name the active lab step; it can only start the tour
or move it by one.
FR6 gap: a lab step names its ref `targetRef`, and has no centered step
without an anchor.
FR7 gap: the lab does not scroll an anchor into view.
FR8 gap: when a lab anchor is not in the document as its step starts, the
callout shows unanchored, the ring never appears, and nothing reports it.
FR9 gap: a lab step has no preparation before it shows.
FR10 gap: a lab callout and ring stay on a removed anchor's last box, or jump
to the viewport corner after a scroll or resize.
FR11 gap: lab control labels are English only, and no prop rewords them.
FR12 gap: the lab has no Skip control.
FR14 gap: a lab step without a backdrop ends the tour on Escape wherever focus
is, and a lab step with a backdrop does not keep Tab in its callout.
FR15 gap: a lab step without a backdrop also moves focus into the callout,
wherever focus was.
FR16 gap: a lab tour returns focus to the target only when it is in the tab
order, else to the element focused at the start; with neither, focus stays on
the page body.
FR17 gap: the lab callout is a labeled section with no dialog role, no
description, and no `aria-modal` under a backdrop.

## Verification

| Contract  | Verification                                 | Representative states                                                                                                                                                                                                                           | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR3   | core `Tour.test.tsx` steps suite             | Three steps; the middle one left out; the active step removed; the last step removed                                                                                                                                                            | A count or Back/Next that includes a left-out step, or a removed active step left showing, fails                                                                                                                                                                                                                                                                                                                                  |
| FR4, FR5  | core `Tour.test.tsx` control suite           | Back, Next, Done, Skip, close, Escape; the app setting a step from an anchor's click                                                                                                                                                            | A step change not reported, a missing or wrong end reason, or an internal step override fails                                                                                                                                                                                                                                                                                                                                     |
| FR6, FR7  | core `Tour.test.tsx` and a real-browser spec | A ref and no anchor; an anchor below the fold and in a scrolled panel; reduced motion                                                                                                                                                           | No scroll, a smooth scroll under reduced motion, or a highlight on a centered step fails                                                                                                                                                                                                                                                                                                                                          |
| FR8, FR9  | core `Tour.test.tsx` anchor suite            | Missing anchor with each `missingAnchorBehavior` value and the default, after Next, after Back and on a step the app sets; a later read finding the anchor after a centered step; a pending and a rejected preparation                          | A timer, a callout shown before preparation settles, a skip against the direction of travel, a centered step that stays centered once a later read finds its anchor, or a missing anchor with no `onMissingAnchor` report fails                                                                                                                                                                                                   |
| FR10      | Real-browser spec                            | With and without a backdrop: the anchor removed while its step shows, then mounted again; the anchor scrolled out of view, then back                                                                                                            | Anchor removed, without a backdrop: a visible callout, focus left in the hidden callout, or an end. With a backdrop: no callout, or a callout that is not modal. Either: a callout still away from the anchor after a later read finds it. Anchor scrolled out: a callout that breaks the layer runtime's rule                                                                                                                    |
| FR11–FR13 | core `Tour.test.tsx` callout suite           | First, middle and last steps; Skip and count on and off; a locale; `nextLabel`, `doneLabel` and `skipLabel`; a step with and without a backdrop                                                                                                 | A built-in title or body text, Back on the first step, an untranslated label, a label prop that loses to the catalog, a missing ring, or a ring or dimming exposed to assistive technology fails                                                                                                                                                                                                                                  |
| FR14–FR17 | core `Tour.test.tsx` and a real-browser spec | With and without a backdrop: Tab from the callout and the anchor; Escape in and out; each focus origin at a step change; a step change that leaves focus where it is; the tour ending with focus in the callout, on the page body and elsewhere | Without a backdrop: focus held in the callout, focus taken from the person, or `aria-modal`. With a backdrop: Tab leaving the callout, focus left outside it, or no `aria-modal`. Either: a missing, repeated or assertive announcement at a step change that leaves focus where it is, an announcement beside a focus move, focus on the body or moved from elsewhere at the end, or a callout with no name or description fails |

## Decision log

### DEC-1 — Steps are data the app controls by id

**Reference:** `spec:AST-119/DEC-1`
**Decider:** `nynexman4464`, `2026-11-18`

Steps are an array of plain objects with stable ids, and the app names the
active step. The app can then advance from its own handlers, resume a tour,
and continue it on another page, and the step order never depends on which
part of the page rendered first.

Rejected: `<TourStep>` children ordered by render order, and an imperative
step builder.

### DEC-2 — A step is conditional by being absent

**Reference:** `spec:AST-119/DEC-2`
**Decider:** `nynexman4464`, `2026-11-18`

The app knows at render time whether a step applies, so it leaves the step out
of the array, and the count and the controls follow.

Rejected: a per-step visibility predicate, which repeats what filtering the
array already does.

### DEC-3 — Tour never waits on a timer

**Reference:** `spec:AST-119/DEC-3`
**Decider:** `nynexman4464`, `2026-11-18`

Only the app knows whether a missing anchor will appear, so Tour follows the
app's `missingAnchorBehavior` (FR8) or waits for the app's own preparation (FR9). An anchor that exists but is
off screen scrolls into view. The default, `'center'`, never drops a step:
with no timer, a skip cannot tell a control the person lacks from one that
renders late.

Rejected: waiting a fixed time for an anchor to appear, by default or as an
option; a step's `showAction` promise waits for exactly what the app needs.

### DEC-4 — Tour owns the chrome; the app owns the words and the journey

**Reference:** `spec:AST-119/DEC-4`
**Decider:** `nynexman4464`, `2026-11-18`

Tour owns the callout, the highlight, the dimming, focus and its own control
labels. The app owns every title and body, the intro Dialog, whether a person
has seen the tour, and moving between pages.

Rejected: an intro-modal step type inside Tour, which duplicates Dialog.

### DEC-5 — Names follow the API conventions

**Reference:** `spec:AST-119/DEC-5`
**Decider:** `nynexman4464`, `2026-11-18`

Tour takes `steps`, `activeId`, `onActiveIdChange`, `onEnd`,
`missingAnchorBehavior`, `onMissingAnchor`, `hasScrollIntoView`,
`hasStepCount`, `hasSkipButton`,
`hasBackdrop` (as the lab Tour names it), `nextLabel`, `doneLabel` and
`skipLabel`; a step has `id`, `anchorRef`, `title`, `body`, `placement`,
`alignment` and `showAction`. A callback mirrors the prop it reports, a choice of response is a
`<thing>Behavior`, a boolean is `has…`, and `anchorRef` matches `usePopover`. Next
always shows, so no input hides it. A control's words are a flat optional
`<control>Label` prop that defaults to the catalog message, as Popover's
`closeButtonLabel` and AlertDialog's `cancelLabel` are. Back, the close
control and the step count stay catalog-only, as the previous and next
controls of Pagination and Stepper do.

Rejected: `activeStepId`, `beforeShowAction`, `hasSkip`, a per-step scroll
override, a `labels` object (the shape
`architecture:internationalization` INV3a gives a non-React factory), and
label props for Back and the close control.

### DEC-6 — The backdrop decides modality

**Reference:** `spec:AST-119/DEC-6`
**Decider:** `nynexman4464`, `2026-11-18`

A step without a backdrop is non-modal, so the person can use the control it
points at. A step with a backdrop is modal: a press outside its callout
already ends the tour (`component:Tour` FR1), so the keyboard has the same
boundary and Tab stays in the callout.

Rejected: a non-modal step under a backdrop, which lets the keyboard reach
controls that a pointer cannot.

## Open questions

- **OQ3 — Uncontrolled use.** (`human-api`) Whether Tour also takes
  `defaultActiveId` and manages the active step itself.
- **OQ4 — How does a step name a target the app holds no ref to?**
  (`human-api`) A target that another component renders reaches Tour through
  that component's forwarded ref. No current caller has a target without one.
  Options: the app passes a ref object whose `current` reads the element; or
  a lookup input on the step, which `spec:AST-116` DEC-1 rejects for
  `usePopover`. Until ruled, a step takes `anchorRef` only.
