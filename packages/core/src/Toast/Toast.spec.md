---
schema_version: 3
template_version: 7
kind: component
id: component:Toast
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-30
owners: [cixzhang]
review_triggers: [public-api, behavior, layout, theming, accessibility]
verified_by:
  [
    packages/core/src/Layer/LayerProvider.test.tsx,
    packages/core/src/Toast/ToastViewport.test.tsx,
    packages/core/src/Toast/ToastViewport.modalHost.test.tsx,
    packages/core/src/Toast/useToast.test.tsx,
    apps/storybook/stories/Toast.stories.tsx,
    scripts/check-knowledge.mjs,
  ]
modules: []
families: [family:action-groups]
design_specs: [design:bidirectionality, design:reduced-motion]
architecture:
  [
    architecture:component-theming-surface,
    architecture:layer-runtime,
    architecture:interaction-modality,
  ]
contributing: []
system_specs:
  [
    spec:AST-086,
    spec:AST-003,
    spec:AST-094,
    spec:AST-100,
    spec:AST-059,
    spec:AST-027,
  ]
---

# Toast component contract

## Contract at a glance

| Area                    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public contract         | `useToast()` returning a show function that takes `{body, type ('info' default, 'error'), isAutoHide (true for info, false for error), autoHideDuration (5000), endContent, renderContent, uniqueID, collisionBehavior ('overwrite' default, 'ignore'), onHide}` and returns a dismiss function; `ToastViewport` with `position` (`bottomEnd`), `maxVisible` (5), `inset`, `layerInset`, and `isTopLayer` (true); `Toast`; target `toast` with `type`. |
| Behavior                | A stack of non-modal notification cards at one viewport corner. Each toast is announced once, can auto-hide (pausing while hovered, focused, touched, or the window is blurred), and dismisses by its button, a vertical swipe toward its edge, or code. F6 moves focus into the newest toast.                                                                                                                                                         |
| End-user impact         | Users get brief notices without losing their place; screen-reader users hear each toast once; keyboard users reach toast controls with F6 and land somewhere sensible after dismissing; touch users swipe toasts away.                                                                                                                                                                                                                                 |
| Builder impact          | None.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Compatibility/readiness | Records shipped behavior; no public change. Nineteen implementation gaps, listed under Current-state impact.                                                                                                                                                                                                                                                                                                                                           |
| Review checks           | Reject a toast announced more than once per show, a dismissal that drops focus to the body, an auto-hide that runs while the user is reading or interacting, or a swipe as the only way to dismiss.                                                                                                                                                                                                                                                    |
| Governing rules         | `spec:AST-086` FR1; `spec:AST-003` (modal rehosting); `spec:AST-094`; `spec:AST-100`; `spec:AST-059` FR6; `architecture:layer-runtime`; `design:bidirectionality`; `design:reduced-motion`.                                                                                                                                                                                                                                                            |

This table is a review projection; the body below is authoritative.

## Intent

Toast shows brief, non-modal notifications. This record covers the toast card
(`Toast`), the viewport that stacks, hosts, and announces toasts
(`ToastViewport`, which has no consumer doc of its own), and the behavior the
`useToast` show function drives. Consumer usage lives in `Toast.doc.mjs`.

## Compatibility and migration

- Released default preserved: `yes`
- Compatibility class: records shipped behavior; no public change
- Controlled/uncontrolled behavior: toasts live in the viewport's state; the
  show function returns a dismiss function
- Migration decision: none

Consumer migration instructions belong in consumer docs and release notes.

## Current-state impact

- **Each card is a second live region.** The viewport announces every toast
  through the shared announcement channel, and each visible card also carries
  `role="status"` or `role="alert"` with `aria-live`. `spec:AST-086` FR1 requires
  exactly one announcement owner per message.
- **The viewport builds its own top layer and exit.** ToastViewport mounts its
  own top layer and runs its own exit collapse. `architecture:layer-runtime`
  INV14 has a layer use the runtime's top-layer mounting and shared exit copy
  rather than building its own.
- **Announcements go through the body-level channel.** The viewport announces
  through the shared body-level channel, which a native modal hides, instead
  of its own persistent containers. `spec:AST-086` FR10 has a modal-hosted
  owner keep its own channel.
- **The swipe decides on net travel.** A swipe dismisses on net travel past a
  distance threshold, or on a fast flick timed by its own average speed, even
  when the finger moves back before release. `spec:AST-094` FR36–FR37 decide
  once at release on projected travel and cancel a release moving back, and
  `spec:AST-100` FR1, FR2, and FR4 take the release velocity from the shared
  tracker.
- **A toast raised while the window is blurred runs its timer.** Only a later
  blur pauses it, so a toast raised while the user is in another window can
  auto-hide unseen.
- **A control-free toast cannot take focus.** With no control in the newest
  toast, F6 leaves focus where it was; dismissing a focused toast beside a
  control-free one drops focus to the page body.
- **The swipe ignores a mouse.** Only touch and pen drags are recognized; a
  mouse drag does nothing. `spec:AST-094` FR43 attaches gestures to every
  pointer.
- **A swipe settles at theme timing.** After release the commit or snap-back
  is a CSS transition at theme timing rather than starting at the release
  velocity (`spec:AST-094` FR38).
- **A hidden toast's overwrite is announced unseen.** Overwriting, through
  `uniqueID`, a toast hidden by the cap announces the new text while it is not
  shown, and nothing is announced when it surfaces.
- **Custom content without a control has only the swipe.** A `renderContent`
  toast that renders no control can be dismissed only by a swipe, and an error
  toast does not auto-hide. `spec:AST-094` FR39 keeps every drag action
  reachable without a drag.
- **Some modals supply no outlet.** A modal Drawer, Lightbox, or MobileNav
  opens without supplying an outlet, so toasts stay behind it; `spec:AST-003`
  FR18 rehosts globally hosted layers above every native modal.
- **A toast collapsing through an outlet move can linger.** A toast that is
  still collapsing when its viewport moves into or out of any outlet FR12
  names comes back as an invisible zero-height row that never unmounts: it
  keeps the notifications landmark exposed and F6 focuses its hidden dismiss
  button, and it holds one of the `maxVisible` places. With no provider
  above the caller a dismissal called before the fallback viewport
  mounts does nothing, so the toast shows and stays unless it
  auto-hides (FR3, FR5, FR7, FR10, FR11, FR12).
- **Announcement happens at dispatch, not when shown.** The viewport announces
  a toast when it is raised rather than when it appears, so a toast shown and
  dismissed in the same handler is announced although it never appears, and of
  toasts raised past `maxVisible` in one handler the older, hidden one is
  announced and nothing is announced when it later appears (FR9).
- **Announced words can differ from shown words.** The viewport announces the
  words in the `body` option's text and element children, so words a component
  renders itself, such as a translated message, are lost, and a
  `renderContent` card is announced with the `body` words even when it shows
  others. `spec:AST-086` FR7 has the announced words match the shown words
  (FR9).
- **The action row does not track a held pointer.** A press that slides across
  the row's sibling actions does not act on the action it lifts on;
  `family:action-groups` has the row use the shared press tracking.
- **Nested viewports can show two landmarks.** An outer and an inner viewport
  that each hold a toast expose two notifications landmarks (FR11).
- **Reduced motion is instant on every pointer.** Under reduced motion the
  entrance, the row collapse, and the swipe's throw run for 0.01 ms on every
  pointer; a touch user
  gets no opacity fade, which `design:reduced-motion` DR2 calls for.
- **A zero toast inset does not override the provider.** A `toast.inset` edge
  set to 0 keeps the provider's `layerInset` on that edge; `spec:AST-059` FR6
  has a set edge replace it. An inset edge opposite the position, such as
  `top` for a bottom stack, moves the stack to that edge.
- **The viewport sets a page-level z-index.** The viewport carries
  `z-index: 500`; `spec:AST-027` FR1 keeps z-index local only, and FR8 orders
  floating surfaces through the browser top layer.

## Ownership boundary

**Owns**

- The card's layout, auto-hide timing, swipe dismissal, and dismiss button
  (FR1–FR5).
- The viewport's placement, stacking, collision handling, announcement, F6
  entry, focus handoff, landmark, and modal rehosting (FR6–FR12).

**Does not own / non-goals**

- Body, end content, and custom content — owned by the caller.
- The dismiss Button — owned by `component:Button`.
- The shared announcement channel — owned by `spec:AST-086`; top-layer hosting —
  owned by `architecture:layer-runtime` and `spec:AST-003`.
- The `useToast` hook's module contract — uncontracted; this record covers the
  behavior it drives.

## Public concepts

| Concept            | Closed values or states                          | Meaning                                                    | Availability by variant/orientation/state | Default     | Owner             | Stability | Invalid-value behavior           |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------- | ----------- | ----------------- | --------- | -------------------------------- |
| Type               | `info`, `error`                                  | Announcement urgency and card treatment.                   | Every toast.                              | `info`      | `component:Toast` | Stable    | TypeScript rejects other values. |
| Position           | `topEnd`, `topStart`, `bottomEnd`, `bottomStart` | Corner the stack sits in and the edge toasts swipe toward. | Viewport.                                 | `bottomEnd` | `component:Toast` | Stable    | TypeScript rejects other values. |
| Collision behavior | `overwrite`, `ignore`                            | What a toast with an existing `uniqueID` does.             | Toasts with `uniqueID`.                   | `overwrite` | `component:Toast` | Stable    | TypeScript rejects other values. |
| Dismiss reason     | `auto`, `manual`                                 | Reported to `onHide`.                                      | Every dismissal.                          | —           | `component:Toast` | Stable    | Not applicable.                  |

## Behavioral and layout contract

| ID   | Invariant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Basis                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR1  | A card carries `toast` with `type` and shows `body` and, on its first line, `endContent` then a dismiss Button named by `@astryx.toast.dismiss`; long body text wraps below. `renderContent` replaces that layout, receives `body`, `endContent`, `type`, timing, and a `dismiss` function, and gets no injected dismiss control.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Current source and tests |
| FR2  | With auto-hide on (the default for `info`, off for `error`), the card dismisses with reason `auto` after `autoHideDuration` ms. The timer pauses while the pointer is over the card, focus is inside it, a touch or pen gesture is active, or the window is blurred, and resumes with the remaining time (at least 1 s). Each pause condition holds the timer on its own: one ending resumes it only when no other still holds, and focus moving between the card's own controls keeps it held. Implementation gap: a toast raised while the window is already blurred starts its timer (Current-state impact).                                                                                                                                                                                                                           | Current source and tests |
| FR3  | The dismiss button, a swipe, a `dismiss` call, or the returned dismiss function dismiss with reason `manual`; `onHide` fires at most once, when the toast is dismissed, even when dismissed twice during its exit. Implementation gap: with no provider above the caller, a dismissal called before the fallback viewport mounts does nothing, so the toast shows and stays unless it auto-hides (Current-state impact). A toast replaced through `uniqueID` is not dismissed and reports no `onHide`.                                                                                                                                                                                                                                                                                                                                    | Current source and tests |
| FR4  | A drag toward the position's block edge, from any pointer (`spec:AST-094` FR43), decides once, at release, per `spec:AST-094` FR36–FR37: projected travel past the commit point dismisses, and a release moving back toward the start cancels. A short drag snaps back; horizontal intent, a second touch, or a gesture starting on an interactive descendant does not dismiss. Native page scrolling continues until touch intent matches the dismiss edge. In the default layout the visible dismiss button stays as a non-gesture alternative; custom content supplies its own. Implementation gaps: the shipped rule dismisses on net travel past a distance threshold or a fast flick timed by its own average speed, even after the finger moves back, and recognizes only touch and pen drags, not a mouse (Current-state impact). | Current source and tests |
| FR5  | A new card slides in from its edge and fades in; a dismissed card collapses and fades before it unmounts; both slide only along the block axis. A dismissal without a swipe uses theme timing; a swipe's commit and snap-back start at the release velocity (`spec:AST-094` FR38). Under reduced motion the entrance and dismissal are an opacity-only fade of 200 ms or less on a coarse pointer or after a touch release (`design:reduced-motion` DR2) and immediate otherwise (DR3), and the card still unmounts. Implementation gaps: a swipe's settle is a CSS transition at theme timing, and under reduced motion every transition, including the row collapse and the swipe's throw, runs for 0.01 ms on every pointer (Current-state impact).                                                                                    | Current source and tests |
| FR6  | The viewport stacks toasts at `position`, newest nearest the configured edge, with an 8 px gap and no extra space at the edge beyond the safe-area gutter it keeps; it spans the inline axis within its inset, honoring start and end insets in either direction. Each edge sits at the provider's `layerInset`, and a `toast.inset` edge, when set, replaces it (`spec:AST-059` FR6). Implementation gaps: a `toast.inset` edge set to 0 does not replace the provider's value, and an edge opposite the position, such as `top` for a bottom stack, moves the stack to that edge (Current-state impact).                                                                                                                                                                                                                                | Current source and tests |
| FR7  | With `maxVisible` of 1 or more, at most that many toasts show; when more are raised, the oldest wait hidden and return as visible toasts leave. `maxVisible={0}` shows every toast.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Current source and tests |
| FR8  | A toast whose `uniqueID` matches a toast the viewport holds, whether shown, hidden by the cap, or exiting, replaces it in place under `overwrite` (and is announced again; the card remounts, so focus inside it drops to the page body), and is dropped unshown and unannounced under `ignore`, even when both are raised before the first renders. Implementation gap: overwriting a toast hidden by the cap announces it while it is not shown, and nothing is announced when it surfaces (Current-state impact).                                                                                                                                                                                                                                                                                                                      | Current source and tests |
| FR9  | Each shown toast has one announcement owner (`spec:AST-086` FR1): the viewport announces it once, when it is shown, `error` assertively and `info` politely, using the toast's text content, through its own persistent polite and assertive containers, which move with it into a modal (`spec:AST-086` FR10). Unrelated renders do not re-announce. Implementation gaps: the viewport announces through the shared body-level channel, which a modal hides, and announces at dispatch rather than when a toast appears (Current-state impact).                                                                                                                                                                                                                                                                                          | `spec:AST-086`; tests    |
| FR10 | F6 moves focus to the first control in the newest toast. Focus entering the viewport, by F6, Tab or a click, records where it was. Dismissing a toast that holds focus moves focus to a control in a remaining toast, or back to the remembered element when none remain. Implementation gap: with no control in the target toast, F6 leaves focus where it was and the handoff drops focus to the page (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                           | Current source and tests |
| FR11 | While a toast is visible the viewport is a `region` landmark named by `@astryx.toast.viewport`, without `aria-modal`; it exposes no landmark when empty, so an empty nested viewport adds none. Implementation gap: nested viewports that each hold a toast expose two landmarks (Current-state impact).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Current source and tests |
| FR12 | A top-layer viewport moves into the latest open Dialog, scrim sheet, or modal flow step, following the top of a stack and handing back to the one beneath when it closes, and returns to its place when none remains, keeping each toast, its timer, and focus inside the viewport. It re-enters the top layer in place when a non-modal sheet opens after it, and stays in place when rendered in place, or when an inline dialog, a sheet without a scrim, or a non-modal flow opens.                                                                                                                                                                                                                                                                                                                                                   | `spec:AST-003`; tests    |

### Allowed variation

- **AV1 — Content.** Body, end content, and custom content vary.
- **AV2 — Theme styling.** Themes restyle `toast` per type.

### Representative states

| State                   | Required invariant                               | Allowed variation |
| ----------------------- | ------------------------------------------------ | ----------------- |
| Info, auto-hide         | Polite announcement once; timer pauses on hover. | Duration.         |
| Error                   | Assertive announcement once.                     | —                 |
| Overwrite by uniqueID   | Replaced in place; announced again.              | —                 |
| Six toasts, default cap | Oldest waits hidden; five visible.               | Cap.              |
| Over an open Dialog     | Viewport inside the dialog's top layer.          | —                 |

### Transformation and precedence order

- **ORD1 — Collision.** `ignore` drops a matching toast before announcement;
  `overwrite` replaces it, then announces.

### Performance and resources

- **PR1 — Cleanup.** Timers, window listeners, and native touch listeners are
  removed when a toast unmounts.

## Accessibility contract

- **AR1 — One announcement.** FR9 (with the gap under Current-state impact).
- **AR2 — Keyboard reach.** FR10.
- **AR3 — Timing.** FR2 pauses auto-hide while the user reads or interacts.
- **AR4 — Gesture alternative.** In the default layout FR4 keeps a button for
  every swipe dismissal; custom content supplies its own non-drag dismissal,
  apart from the control-free custom content gap (Current-state impact).

## Design relationships

| Anatomy or state | Design requirement                       | Representation authority       | Hierarchy role | Component contract |
| ---------------- | ---------------------------------------- | ------------------------------ | -------------- | ------------------ |
| Body             | Message text that wraps.                 | Current source and public docs | Prominent      | FR1                |
| End content      | Caller controls on the first line.       | Caller content                 | Supporting     | FR1                |
| Dismiss button   | Small ghost icon button at the line end. | `component:Button`             | Supporting     | FR1, FR3           |

No anatomy-theming map is recorded: the card carries `toast`, but
`Toast.doc.mjs` names only the card's contents (Body, End content, Dismiss
button), so no anatomy part can own the `toast` target.

## Family and system relationships

- `spec:AST-086` owns the announcement channel and the one-owner rule.
- `family:action-groups` covers Toast's action row when it holds two or more
  sibling actions; the row adopts that family's held-pointer tracking.
- `spec:AST-003` and `architecture:layer-runtime` own top-layer hosting above
  native modals.
- `design:bidirectionality` keeps block-axis swipes and inline insets correct in
  right-to-left.

## Verification map

| Contract | Verification                                                                                            | Representative states                                                                              | Mutation or failure expectation                                                       | Audit section               |
| -------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------- |
| FR1, FR3 | `ToastViewport.test.tsx` layout, custom content, and onHide tests                                       | Default, custom content, double dismiss                                                            | Dropped controls or a repeated `onHide` fails.                                        | `audit:Toast/behavior`      |
| FR2      | `ToastViewport.test.tsx` blur-pause and pause-source tests                                              | Window blur, new toast during pause, overlapping pointer/focus/window holds, focus moving inside   | A timer running while paused, or resuming while another hold remains, fails.          | `audit:Toast/behavior`      |
| FR4, FR5 | `ToastViewport.test.tsx` gesture and motion tests                                                       | Pen and touch thresholds, short drag, horizontal intent, second touch, interactive descendant, RTL | A dismissal from a rejected gesture, a lost snap-back, or off-axis drift fails.       | `audit:Toast/behavior`      |
| FR6–FR8  | `ToastViewport.test.tsx` placement, cap, and uniqueID tests; `Layer/LayerProvider.test.tsx` inset tests | Each position, cap 1 and an explicit cap, overwrite, ignore                                        | Wrong order, cap, or collision fails.                                                 | `audit:Toast/layout`        |
| FR9–FR11 | `ToastViewport.test.tsx` announcement, F6, focus, landmark tests                                        | Info, error, StrictMode, nested viewports                                                          | A repeated or wrong-urgency announcement, or focus to the body after F6 entry, fails. | `audit:Toast/accessibility` |
| FR12     | `ToastViewport.modalHost.test.tsx`                                                                      | Dialog, nested dialogs, sheets and sheet stacks, modal flows                                       | A lost toast, timer, or focus, or the wrong outlet, fails.                            | `audit:Toast/layering`      |

Read from source, with no focused test yet:

- FR1: the `toast` target and its `type` state.
- FR2: pausing while a touch gesture is active, and the 1 s minimum on
  resume.
- FR4: a mouse drag dismissing, and a release moving back cancelling; the
  gesture tests assert today's touch-and-pen-only, net-travel rule.
- FR5: a swipe's settle starting at the release velocity, and the
  reduced-motion fade and immediate change; the motion tests assert today's
  0.01 ms transitions.
- FR6: a set `toast.inset` edge replacing the provider's value at 0.
- FR7: the default cap of 5, and `maxVisible={0}` showing every toast.
- FR9: delivery through the viewport's own polite and assertive containers;
  the announcement tests read the shared body-level channel.

## Decision log

No component-local decision is recorded.

## Open questions

None.

## Content boundary

This file does not duplicate consumer prop tables, examples, the announcement
channel, or layer-hosting rules. It links to their owners.
