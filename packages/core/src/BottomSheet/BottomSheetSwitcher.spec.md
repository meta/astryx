---
schema_version: 3
template_version: 4
kind: component
id: component:BottomSheetSwitcher
authority: current
archive_reason: null
superseded_by: null
approved_by: imdreamrunner
approved_at: 2026-10-24
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/BottomSheet/BottomSheetSwitcher.test.tsx,
    packages/core/src/BottomSheet/__tests__/BottomSheetNativeModal.a11y.browser.spec.ts,
    apps/storybook/stories/BottomSheetSwitcher.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:overlay-dismissal]
design_specs: []
architecture:
  [
    architecture:component-theming-surface,
    architecture:layer-runtime,
    architecture:public-component-api,
  ]
contributing: []
system_specs: [spec:AST-002, spec:AST-027]
---

# BottomSheetSwitcher component contract

## Intent

BottomSheetSwitcher coordinates a mutually exclusive sequence of BottomSheet
children, each presented in its own native dialog (DEC-1), without adding a
prop or changing a default. Where the shipped switcher does not yet meet a
requirement, the row carries a present-tense implementation gap note. The
modality, identifier, and theming questions below stay open.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: nonbreaking; public props, defaults, exports, visual
  output, and transition behavior stay unchanged, except that under reduced
  motion a handoff follows `design:reduced-motion` (FR3), a visual-only motion
  change under `spec:AST-017` FR3. The element the `ref` resolves
  to, and that it changes on a handoff, is implementation rather than public
  contract (DEC-2)
- Controlled/uncontrolled behavior: `activeSheet` remains fully controlled
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Ownership boundary

**Owns**

- The presentation lifecycle of every directly nested BottomSheet child's native
  dialog: which is presented, retained during a handoff, or closed.
- Which child sheet is active, retained during a handoff, or hidden.
- Which sheet dialog hosts the flow (its ref, `id`, and dismissal
  registration) and which paints the flow's one scrim, plus
  Escape/platform-close routing and final focus return for the flow. Focus
  containment is the native modal dialog's; the flow's one page scroll lock is
  held for the whole modal flow (DEC-1).
- The flow wrapper: the isolated surface that orders non-modal sheet dialogs
  locally (`spec:AST-027` FR2).

**Does not own / non-goals**

- A child sheet's panel, content, handle, height, snap points, swipe mechanics, or
  local visual styling — owned by `component:BottomSheet`.
- Page-level stacking or clipping escape — owned by
  `architecture:layer-runtime` and `spec:AST-027`.
- An ordered visible sheet stack — proposed separately by open `BottomSheetStack`
  work and not part of this component.

## Public concepts

| Concept             | Closed values or states                              | Meaning                                                                                                                                                                                                      | Availability by variant/orientation/state                                      | Default                                | Owner                                                                     | Stability | Invalid-value behavior                                                                     |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| Active sheet        | `null` or one nested BottomSheet `sheetId`           | Selects the only interactive child, or closes the flow                                                                                                                                                       | All presentations                                                              | `null` is closed; the prop is required | `component:BottomSheetSwitcher`                                           | released  | A non-matching or duplicate id is not given a safe public fallback by the current contract |
| Shared presentation | `true` / `false` through `hasScrim`                  | Selects the current modal scrim-backed host or non-modal no-scrim host                                                                                                                                       | Entire flow                                                                    | `true`                                 | `component:BottomSheetSwitcher`                                           | released  | Boolean only                                                                               |
| Child identity      | Non-empty `sheetId` on each direct BottomSheet child | Associates controlled selection, labeling, purpose, and transition state with a child                                                                                                                        | Direct nested BottomSheet children                                             | none                                   | `component:BottomSheet`                                                   | released  | Empty ids warn and stay hidden; duplicate-id behavior is not specified                     |
| Dismissal request   | `onActiveSheetChange(null)`                          | Reports an allowed implicit close without taking control from the caller                                                                                                                                     | Escape/platform close, scrim click, or swipe according to active child purpose | none                                   | `component:BottomSheetSwitcher`; `family:overlay-dismissal` owns ordering | released  | The caller may retain its controlled value                                                 |
| Dialog surface      | inherited dialog props plus `ref` and `onCancel`     | Dialog props and handlers, `onCancel` included, reach every sheet dialog; `ref`, `id`, and `data-testid` resolve to the host dialog, which is never null for an object ref while a sheet is mounted (DEC-2). | Entire flow                                                                    | none                                   | `component:BottomSheetSwitcher`                                           | released  | Component-owned semantics and handlers retain precedence                                   |

## Behavioral and layout contract

| ID  | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Basis                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| FR1 | Zero or one child sheet is interactive for each controlled `activeSheet` value; all other children are hidden or retained inert and `aria-hidden` during a transition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Current source, docs, and tests                                       |
| FR2 | Each child sheet owns one native dialog. Opening a sheet presents its dialog once; a handoff presents the entering sheet's dialog above the retained one and closes the retained dialog only after its panel has faded. Returning to a sheet whose dialog is still open beneath a newer one re-presents it so the interactive sheet is the topmost layer.                                                                                                                                                                                                                                                                                                                                   | DEC-1                                                                 |
| FR3 | During a handoff, the entering sheet is above the retained sheet. A taller retained sheet aligns down to a shorter entering sheet, and the retained sheet fades only after required transform motion completes. Under reduced motion the handoff follows `design:reduced-motion`: no transform motion runs, and the sheets cross-fade (DR2) or change at once (DR3) in the same order. Implementation gap: under reduced motion the shipped switcher still runs the entering and alignment transforms, shortened, and does not fade the entering sheet in on a coarse pointer.                                                                                                              | Current source and transition tests; `design:reduced-motion` DR2, DR3 |
| FR4 | Closing retains the outgoing sheet through its exit, then closes the dialog. A modal flow restores focus to the element captured when that modal flow opened.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Current source and focus tests                                        |
| FR5 | `hasScrim=true` uses `showModal()`, a native backdrop, and native focus containment, and locks page scroll: the page does not scroll while a modal flow is presented; the lock is held continuously across a handoff, never released and re-acquired between steps; it still holds beneath a `Dialog` opened from a step; it is released after the flow's exit (DEC-1). `hasScrim=false` uses `show()` without a backdrop or scroll lock and leaves the page interactive. In a non-modal flow the sheet dialogs order themselves with local values inside the switcher's isolated flow wrapper (DEC-1); the page-level value that wrapper carries remains a `spec:AST-027` conformance gap. | DEC-1; `spec:AST-027` FR2, FR4, FR8                                   |
| FR6 | The active child purpose governs implicit dismissal: `info` allows Escape, scrim click, and swipe; `form` allows Escape; `required` blocks all three and exposes `alertdialog`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Current BottomSheet docs and switcher tests                           |
| FR7 | While visible, the switcher participates in `family:overlay-dismissal`; one Escape or platform close request reaches only the topmost present layer, and descendants receive a deeper logical layer scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `family:overlay-dismissal` and the audit regression test              |
| FR8 | One backdrop paints the flow's scrim at a time: the retained sheet's dialog keeps it through a handoff and the entering dialog takes it over without a fade when the retained dialog closes. A stale gesture from an outgoing sheet cannot change the flow's scrim, and unmounting a retained sheet cannot keep its dialog open or the flow's modal layer held.                                                                                                                                                                                                                                                                                                                             | DEC-1; current tests                                                  |
| FR9 | The switcher forwards neutral dialog attributes, styling inputs, and composed handlers, `onCancel` included, to every sheet dialog, so a handler fires for whichever sheet dialog raises the event; renders `id` and `data-testid` on the host dialog only, so each appears once in the document; attaches its ref to the host dialog; and preserves its owned ARIA and dismissal behavior. An object ref's `current` is never `null` while a sheet is mounted. A callback ref follows React's semantics on a handoff: a cleanup it returned runs when it detaches from the old host; a callback ref without a cleanup is called with `null` on detach, then with the new host.             | DEC-1, DEC-2; `architecture:public-component-api` INV8                |

### Allowed variation

- **AV1 — Child content and panel geometry.** Child content, height, snap points,
  and panel styling vary under `component:BottomSheet` without changing the
  switcher's one-active-child protocol.
- **AV2 — Transition timing.** Theme motion tokens may vary timing while preserving
  the ordering and inertness in FR3.

### Representative states

| State      | Required invariant                                                                                                                                                               | Allowed variation                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Closed     | Every sheet dialog is closed and no child is interactive.                                                                                                                        | Child panels may remain mounted but hidden.                                              |
| First open | Matching child is visible and interactive in its own dialog.                                                                                                                     | Child-owned height and content.                                                          |
| Handoff    | Entering child is interactive in its own dialog; retained child's dialog stays open, inert, and hidden from accessibility APIs until it fades, and keeps painting the one scrim. | Alignment offset depends on measured panel geometry.                                     |
| Closing    | Outgoing child is retained inert while exit motion completes; modal focus and scroll ownership remain until close.                                                               | Theme-controlled duration.                                                               |
| Modal      | Native modal host, backdrop, native focus containment, and the page scroll lock are active.                                                                                      | Active child's `purpose` controls implicit dismissal.                                    |
| Non-modal  | Native non-modal host has no backdrop or scroll lock and background content remains interactive.                                                                                 | The current clipping/stacking limitation is a conformance gap, not an allowed exception. |

### Transformation and precedence order

- **ORD1 — Handoff completion.** Select next child → mark previous child retained
  and inert → start entering transform and any required retained alignment → wait
  for both transforms → fade retained child → hide it. Under reduced motion the
  transform steps are skipped and the entering and retained children cross-fade
  or change at once (`design:reduced-motion` DR2, DR3), keeping this order.
- **ORD2 — Label precedence.** Consumer `aria-label` wins; otherwise consumer
  `aria-labelledby` wins; otherwise the active or retained child label names the
  dialog.

### Performance and resources

- **PR1 — One painted scrim.** In a modal flow, at rest exactly one sheet
  dialog is presented; during a handoff two are, with one backdrop painted.
  Native modality holds across a modal flow's child handoffs because a sheet
  dialog is modal throughout, and the one page scroll lock is held for the
  whole flow rather than per step. A non-modal flow paints no backdrop and
  holds no lock.
- **PR2 — Stable child registration.** Parent rerenders and changing consumer ref
  identities do not unregister a mounted child or cancel an active handoff.

## Accessibility contract

- **AR1 — Dialog semantics.** Modal presentations expose `aria-modal`; a required
  child changes the implicit dialog role to `alertdialog`; every visible flow has
  a consumer-provided or active-child-derived accessible name.
- **AR2 — Focus and inertness.** Modal focus remains inside the dialog, retained
  children are inert and `aria-hidden`, and focus returns after the final exit.
- **AR3 — Ordered dismissal.** Escape and platform close follow
  `family:overlay-dismissal`, including IME protection and topmost-layer ordering.

## Design relationships

| Anatomy or state | Design requirement                                                                                                         | Representation authority                                         | Hierarchy role | Component contract |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------- | ------------------ |
| Sheet dialogs    | Transparent per-sheet hosts; the active sheet's is the flow's interaction and accessibility boundary (DEC-1)               | Current source and public docs; DEC-1 for the per-sheet clause   | Structural     | FR2, FR5, AR1      |
| Sheet panels     | Delegate visible panel, content, handle, and gesture presentation to BottomSheet                                           | `component:BottomSheet` as observational context                 | Prominent      | FR1, FR3           |
| Scrim            | Optional native backdrop that dims and blocks the page in modal presentation; one sheet dialog paints it at a time (DEC-1) | Current source and public docs; DEC-1 for the one-painter clause | Supporting     | FR5, FR8           |

### Theming anatomy

<!-- anatomy-theming:v1 -->

```json
{
  "Sheet dialogs": {
    "none": {
      "reason": "intentional: The transparent dialogs are hosting, positioning, event, and focus machinery rather than a stable painted part."
    }
  },
  "Sheet panels": {
    "delegatesTo": {"owner": "component:BottomSheet", "target": "bottom-sheet"}
  },
  "Scrim": {
    "none": {
      "reason": "reachability-gap: The native backdrop of the sheet dialog that owns the scrim paints it but has no current public theming target."
    }
  }
}
```

## Family and system relationships

- `family:overlay-dismissal` owns topmost Escape and platform-close ordering; the
  switcher adopts that shared owner while visible.
- `architecture:layer-runtime` owns native dialog behavior and current hosting.
- `architecture:component-theming-surface` owns anatomy qualification and target
  disposition.
- `architecture:public-component-api` and `spec:AST-002` own the released prop,
  DOM, ref, and compatibility surface.
- `spec:AST-027` identifies the non-modal `show()` plus page-level `z-index` path
  as a migration gap, not an exception.

## Verification map

| Contract         | Verification                                                                  | Representative states                                                                                                                                     | Mutation or failure expectation                                                                                                                                                                                                                   | Audit section                             |
| ---------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| FR1–FR4, FR8     | `BottomSheetSwitcher.test.tsx`                                                | closed, first open, handoffs in either completion order, rapid replacement, unmount, close; a handoff under reduced motion on a coarse and a fine pointer | A child becomes interactive at the wrong time, a retained child disappears early, a second backdrop paints, or a sheet dialog's lifecycle breaks.; under reduced motion, a handoff that moves a sheet, or on a coarse pointer does not cross-fade | `audit:BottomSheetSwitcher/behavior`      |
| FR5–FR7, AR1–AR3 | `BottomSheetSwitcher.test.tsx`; `BottomSheetNativeModal.a11y.browser.spec.ts` | modal/non-modal, info/form/required, nested layer, IME, focus return, scroll lock in engines, non-modal local ordering                                    | Modality, dismissal order, naming, inertness, scroll lock, or focus behavior diverges, or a sheet dialog takes a page-level z-index.                                                                                                              | `audit:BottomSheetSwitcher/accessibility` |
| FR9              | `BottomSheetSwitcher.test.tsx`; export checks                                 | ref across open/handoff/close/unmount, callback-ref cleanup, `id` once, DOM/ARIA/data/events, class, style, xstyle                                        | A supported input is dropped or duplicated, an object ref is null while a sheet is mounted or skips a cleanup, or an input overrides component-owned semantics accidentally.                                                                      | `audit:BottomSheetSwitcher/api`           |
| Theming anatomy  | `scripts/check-knowledge.mjs`; theming tests                                  | dialog, delegated sheet panel, scrim                                                                                                                      | A non-painting host gains a target, a delegated panel loses its owner, or the scrim gap disappears without review.                                                                                                                                | `audit:BottomSheetSwitcher/theming`       |

## Decision log

### DEC-1 — Each step owns its native dialog; the switcher coordinates

**Reference:** `component:BottomSheetSwitcher/DEC-1`
**Decider:** imdreamrunner, 2026-10-20

A switcher step is a BottomSheet with its own native dialog, presented and
closed like a standalone sheet, so one DOM shape serves standalone sheets and
switcher steps alike and the browser supplies modality per step: an inert
page, focus containment, `cancel` for Escape and the platform close, and the
backdrop. The switcher owns only what no single dialog can decide: which dialog
is presented, retained, or closed; the one scrim handed from the retained
dialog to the entering one without a fade; re-presenting a sheet that is still
open beneath a newer one when the flow returns to it; focus kept in the active
sheet when a retained dialog closes; focus returned to the flow's opener;
`cancel` gated by the active step's `purpose` through the shared dismissal
stack; and the flow's one page scroll lock, held from the moment a modal flow
is presented until after its exit, so a handoff between two open dialogs never
releases and re-acquires it. The switcher's one element is a flow wrapper with
no box in a modal flow and, in a non-modal flow, the isolated surface inside
which the sheet dialogs order themselves with local values.
Rejected: one switcher-owned dialog hosting every step as a panel, because a
step is then not a sheet and every standalone-sheet mechanism needs a second,
switcher-only implementation.
Rejected: a script focus trap on top of native containment, because the
browser already contains focus in a modal dialog and the trap fights its
inertness.
Rejected: a page-level `z-index` on a non-modal step's dialog, because
`spec:AST-027` FR4 forbids a new page band; the wrapper is the isolation owner.

### DEC-2 — The host dialog's identity is implementation, not contract

**Reference:** `component:BottomSheetSwitcher/DEC-2`
**Decider:** imdreamrunner, 2026-10-20

The `ref`, `id`, and `data-testid` of the switcher reach the dialog hosting
the flow: the active sheet's, the exiting sheet's through its exit, and, while
the flow is closed, the dialog that hosted it last or the first mounted
sheet's, so an object ref is never `null` while a sheet is mounted and the
identifying attributes appear once. Which element that is, and that it changes
on a handoff, is implementation. The released documentation (v0.7.1
`BottomSheetSwitcher.doc.mjs`) describes the ref as "Ref forwarded to the one
shared native dialog." and the switcher as "Its ref and shared DOM props
target that dialog." Code that copies `ref.current` once at mount keeps a
real `<dialog>`, but after a handoff that element may no longer be the host;
read `ref.current` at use time, or use a callback ref, to follow the flow. DOM
props and handlers given to the switcher (`className`, `style`, `onCancel`,
`onToggle`, `aria-*`, and the rest) reach every sheet dialog, with `id` and
`data-testid` on the host only, so a handler fires for whichever sheet dialog
raises the event. The owner rules this hosting — the moving host and the
per-dialog props alike — nonbreaking under `spec:AST-017` FR3 because no
visual output and no public API surface changes.
Rejected: classifying the moving ref as a breaking change, because no public
API, documented interaction, or visual output changes.

## Open questions

- **OQ1 — Should modality and scrim paint remain coupled behind `hasScrim`, or
  become independent public concepts?** (`human-api`)
- **OQ2 — What safe behavior should a non-matching or duplicate child `sheetId`
  have?** (`human-api`)
- **OQ3 — Should the switcher-owned scrim gain a public theming target?**
  (`human-api`)

## Content boundary

This file does not duplicate consumer prop tables, audit scores, screenshots,
BottomSheet panel mechanics, shared dismissal rules, or layer-hosting migration
steps. It links to their owners.
