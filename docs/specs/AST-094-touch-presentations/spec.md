---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-094
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [vjeux]
affects_architecture:
  [architecture:interaction-modality, architecture:theme-tokens]
affects_families: [family:buttons, family:overlay-dismissal]
affects_contributing: []
affects_consumer_docs: []
---

# Touch presentations follow UIKit system spec

## Intent

A person using an Astryx product on a phone gets the controls, sheets, menus,
lists and navigation they know from iOS: the same physics, the same timings,
the same gesture thresholds and the same feel. Every component's touch
presentation follows UIKit on a named reference release, and its motion keeps
running at display rate while the page's JavaScript is busy.

The reference is UIKit on iOS 26.2 today. Each number a touch presentation
uses names the iOS version it was taken from; moving the reference to a newer
release re-measures the table, and differences on older releases are noted,
not targeted.

## Non-goals

- Pointer (desktop) presentations. Their timing and easing stay with the
  theme's motion tokens (`architecture:theme-tokens`).
- WebKit embedded in a native app and the native Swift package. This record
  governs the web components themselves.
- Scroll physics. Scrolling stays native on every platform: on iOS an overflow
  area or the page is a UIKit scroll view already.
- Which components get a touch presentation, and when. Each component's own
  record owns its presentation.
- Equivalent internal implementations remain valid when they satisfy this
  contract. The modules, files and algorithms of the motion and gesture
  foundations belong to their architecture records.

## Requirements

### Physics

- **FR1 — One table of UIKit values.** Every spring, duration, deceleration
  rate, rubber-band coefficient, gesture threshold and haptic moment a touch
  presentation uses MUST come from one shared table of UIKit values. A
  component MUST NOT carry a number of its own.
- **FR2 — Every value has a source.** Each value in the table MUST name its
  source next to it: Apple's documentation, a WWDC session, WebKit's own
  source where WebKit states it matches UIKit, or a measurement of UIKit on
  the iOS simulator naming the app, the iOS version, the method and the date.
  A value without one of these MUST be labelled a guess and name the
  measurement that will replace it. A decompilation of UIKit MAY aim a
  measurement and MUST NOT be a source.
- **FR3 — UIKit's physics.** Springs MUST follow UIKit's spring model
  (response and damping ratio, mass, stiffness and damping, and the release
  velocity), with overdamping clamped to critical damping wherever UIKit
  clamps it. A momentum coast MUST decay like a UIKit scroll view (0.998 per
  millisecond, 0.99 for the fast rate), a drag past an edge MUST resist with
  UIKit's rubber band `(1 − 1 ÷ (x·c ÷ d + 1))·d` with the coefficient its use
  measures (0.55 for a scroll view and a sheet), and a release MUST pick its
  rest point by projecting its velocity the way its UIKit counterpart does:
  with a deceleration rate, or with a measured projection time.
- **FR4 — Physics are not themable in touch presentations.** A touch
  presentation MUST read its motion from the table on every theme. Themes keep
  color, shape, type and spacing; the theme's duration and easing tokens keep
  governing pointer presentations. **Proposed; pending owner review:** this
  narrows `architecture:theme-tokens` (owners: cixzhang, imdreamrunner) to
  pointer presentations, and departs from the draft `design:motion` DR3
  (owners: ernestt, cixzhang) wherever UIKit settles with an overshoot or
  stretches with a rubber band.

### Motion

- **FR5 — Motion runs on the compositor.** Every release and every
  programmatic animation of a touch presentation MUST animate `transform`, the
  individual `translate`, `scale` and `rotate` properties, or `opacity`
  (a dialog's `::backdrop` included) through Web Animations that the browser
  runs off the main thread,
  and MUST keep advancing at display rate through a main-thread block. It MUST
  NOT animate layout properties, and MUST NOT step a frame from script when the
  compositor can run the curve.
- **FR6 — Motion is interruptible.** A finger MUST be able to catch any
  animation mid-flight at the value on screen. That value and its velocity
  MUST come from the curve, not from a layout read. A new target MUST keep the
  current velocity, and a release MUST hand its velocity to the spring that
  follows.
- **FR7 — Exits animate as UIKit's do.** A touch presentation MUST play the
  exit its UIKit counterpart plays. **Proposed; pending owner review:** this
  departs from the draft `spec:AST-090` FR1 (exits off by default) and FR10
  (reduced motion closes at once) for touch presentations (owners: ernestt,
  cixzhang).
- **FR8 — Reduce Motion substitutes, never jumps.** Under
  `prefers-reduced-motion: reduce`, a touch presentation MUST behave as its
  UIKit counterpart does with Reduce Motion and Prefer Cross-Fade Transitions
  on: a transition that travels becomes a cross-fade carrying the same change
  of state. An entrance lands in place and fades in, an exit fades out in
  place, and any other move fades through. A navigation push or pop
  cross-fades over 0.5 s on the ease-in-out curve; a sheet, a full-screen
  modal or an alert fades on its own presentation spring and drops its travel
  and scale; menus open and close on UIKit's Reduce Motion spring. Motion that
  follows a finger, such as a throw, MUST keep its motion. **Proposed; pending
  owner review:** this is the minimally moving form the draft `design:motion`
  DR5 asks for, for touch presentations (owners: ernestt, cixzhang); the
  alternative is UIKit's Reduce Motion alone, which keeps the slides of
  navigation, sheets and modals.

### Gestures

- **FR9 — Fingers are tracked by recognizers.** A drag MUST be tracked by the
  shared gesture recognizers, writing one transform per move, with no
  component render per move and no layout read after the gesture begins.
  Native scrolling MUST be used only where the component is a scroll view
  (lists, scroll areas, the page). A component MAY track a finger with native
  scroll snapping only with simulator evidence that it tracks through a
  main-thread block, ends on UIKit's release curve, ends correctly when the
  finger lifts during a block, and lets a finger catch the content mid-flight.
- **FR10 — A second finger never breaks the first.** A second finger MUST NOT
  cancel or redirect a drag a recognizer has claimed. Page pinch-zoom MUST stay
  the browser's whenever no pinch recognizer claims the fingers and no drag is
  claimed (WCAG 1.4.4).
- **FR11 — Two press profiles.** Press feedback MUST follow one of two UIKit
  profiles. A control (UIControl) highlights on touch-down outside scroll
  views, keeps tracking within its expanded bounds (70 pt), turns its highlight
  off and on as the finger drags out and back, and activates on a lift inside.
  A cell (a table or collection cell) highlights 150 ms after touch-down inside
  a scroll view and drops the highlight when the scroll wins. The 150 ms delay
  applies only inside scroll views. **Proposed; pending owner review:** this
  amends `design:user-states` DR1 and DR3 for touch presentations (owners:
  ernestt, cixzhang), and the press treatment of `family:buttons` (owner:
  cixzhang).
- **FR12 — Long press and rubber band are per use.** A long press MUST use the
  thresholds its UIKit counterpart uses: 0.5 s and 10 pt for a plain long
  press, the measured values for context menus and menus. A rubber band MUST
  use the coefficient its use measures.
- **FR13 — One touch-presentation resolver.** Whether a component shows its
  touch presentation MUST come from one shared resolver: touch behaviors key
  on a coarse pointer, layout on the available size, and a presentation that
  depends on both (a sheet instead of a popover) asks for both. A component
  MUST NOT write its own media query for it. **Proposed; pending owner
  review:** the resolver sits beside the shared modality state of
  `architecture:interaction-modality` (owner: cixzhang).
- **FR14 — Nested scrolling follows UIKit.** Who gets a drag that starts
  inside a scroll area MUST be decided once, when the drag begins. If the
  area sits at its edge and the drag moves toward that edge, the surrounding
  surface (a sheet) takes the drag; otherwise the area keeps it for the whole
  gesture and rubber-bands at its edge. The drag MUST NOT change hands midway,
  in either direction.
  **Proposed; pending owner review:** this amends `spec:AST-025` FR14 (scroll
  chaining by default) for touch presentations (owner: cixzhang).
- **FR15 — Recognizers arbitrate like UIKit's.** Recognizers that see the
  same touch sequence MUST be exclusive by default: the first to recognize
  wins and the others fail, unless both allow simultaneous recognition. A
  recognizer that requires another to fail MUST hold its recognition until
  that one fails, and MUST fail if that one recognizes. When several recognize
  on the same event, the innermost element's recognizer MUST win.
- **FR16 — Gestures keep the event clock.** Recognizers MUST read time from the
  input events' timestamps. Durations (a long press, the interval between
  taps) MUST be deadlines on that clock, so a blocked main thread delays the
  report and never the moment reported.
- **FR17 — UIKit's readings.** A recognizer's thresholds and readings MUST
  follow UIKit's and come from the table. A pan begins at 10 pt of travel on
  either axis, and its translation excludes that travel; its velocity is
  UIKit's estimate, 0.2 × the newest event's instantaneous velocity + 0.8 ×
  the previous event's, never decayed through a rest.
- **FR18 — `touch-action` leaves the browser the rest.** An element with touch
  recognizers MUST get a `touch-action` that leaves the browser exactly what
  its recognizers do not use: the other axis for an axis-limited pan or swipe,
  `manipulation` for taps and long presses, everything for a one-way pan or a
  pan that shares its axis with native scrolling. `pinch-zoom` MUST stay
  unless a pinch or rotation recognizer is attached.
- **FR19 — Claims are made in time and only by an owner.** A recognizer that
  begins MUST claim its touches by cancelling `touchmove` through a
  non-passive listener on its element. A `touchmove` of a touch no recognizer
  owns MUST NOT be cancelled. A recognizer that competes with native scrolling
  MUST decide within 10 px of travel, before the browser commits to the
  scroll.
- **FR20 — The browser can take a touch.** `pointercancel`, an uncancelable
  `touchmove`, or a native scroll under the touch MUST count as the browser
  taking the touch: possible recognizers that share it fail, active ones are
  cancelled, and the view's press is cancelled without a release.
- **FR21 — Clicks follow the gesture.** When a gesture takes a touch, its
  `touchend` MUST be cancelled, and no click or compatibility mouse event
  reaches the page. A click held for a recognizer that may still recognize (a
  tap that a double tap may claim) MUST be replayed on its target if that
  recognizer fails. Activation with `detail === 0` (keyboard, assistive
  technology) MUST always pass. A tap MUST NOT wait for the browser's
  double-tap delay.
- **FR22 — iOS Safari keeps its edge swipe.** Safari's own back swipe from the
  screen edge MUST stay the browser's; a touch presentation never overrides it.

### Haptics

- **FR23 — Haptics where UIKit plays them.** A touch presentation MUST play a
  haptic only at the moments its UIKit counterpart does. In iOS Safari the only
  haptic a page can produce is a light impact from a real tap landing on a
  `<label>` or a switch checkbox; a moment UIKit marks mid-drag or after the
  lift has no haptic there, and the component records that gap.
  `navigator.vibrate` stands in where the platform offers it.

### Platform support

- Supported engines: Astryx's supported browsers (`spec:AST-013`) with touch
  input. UIKit on the reference release is the parity reference, not a
  support floor; an older iOS Safari gets the same behavior wherever its
  engine supports it.
- Unsupported behavior: haptics outside the moments FR23 allows. Where an
  engine cannot run a curve on its compositor, the animation still plays and
  still ends on its committed state.
- Browser evidence: the busy-main-thread proof and no layout or paint during
  the animation in Chromium with phone emulation, the busy-main-thread proof
  in WebKit, curves sampled by seeking the running animations, and iOS
  simulator recordings for every claim about iOS.

## Current-state impact

- `architecture:theme-tokens`: the duration and easing tokens govern pointer
  presentations (FR4; pending owner review).
- `architecture:interaction-modality`: the shared touch-presentation resolver
  (FR13; pending owner review).
- `family:buttons`: the control and cell press profiles (FR11; pending owner
  review).
- `family:overlay-dismissal`: exits and their Reduce Motion substitutions in
  touch presentations (FR7, FR8).
- `design:user-states` DR1 and DR3, `design:motion` DR3, `spec:AST-025` FR14
  and `spec:AST-090` FR1 and FR10 each carry a proposed amendment for touch
  presentations, for their owners to rule on.
- Consumer docs: none until a component ships its touch presentation; each
  component documents its own.

## Verification

| Contract   | Verification                                                                                                                   | Representative states                                                                                       | Mutation or failure expectation                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| FR1, FR2   | Table check over every domain of the table                                                                                     | every entry; a guess and its measurement task                                                               | an unsourced value, an unknown source kind, or a guess without a listed measurement fails |
| FR3        | Unit tests of the spring, decay, rubber band and projection math against an independent integration and values read from UIKit | under-, critically and overdamped springs; release velocities; both rates; overscroll depths                | changing a formula or a constant breaks the agreement with UIKit's values                 |
| FR4        | Component tests on two themes                                                                                                  | the same touch transition under different motion tokens                                                     | a touch curve that follows a theme token fails                                            |
| FR5        | Browser proof: an animation keeps advancing frame by frame through a 1 s main-thread block, with no layout or paint per frame  | Chromium phone emulation; WebKit                                                                            | a script-driven or layout-animating implementation freezes or lays out                    |
| FR6        | Unit and browser tests catching an animation mid-flight and retargeting it                                                     | catch at peak velocity; retarget with a new spring                                                          | a layout read, a jump, or a lost velocity fails                                           |
| FR7, FR8   | Component browser tests and storyboards with and without Reduce Motion                                                         | entrance, exit, move                                                                                        | an instant jump under Reduce Motion, or a missing exit, fails                             |
| FR9, FR10  | Recognizer unit tests on synthetic streams and browser tests with real touch input                                             | drag, second finger, pinch, page zoom, main-thread block                                                    | a second finger that breaks a drag, or a blocked page pinch, fails                        |
| FR11, FR12 | Press and long-press tests on synthetic streams with explicit timestamps                                                       | inside and outside a scroll view; drag out and back                                                         | the wrong profile's timing fails                                                          |
| FR13       | Resolver unit tests                                                                                                            | coarse and fine pointer; narrow and wide                                                                    | a component-owned media query diverges                                                    |
| FR14       | Browser tests of a sheet over a scrolled list                                                                                  | scrolled and at its top                                                                                     | a midway handoff fails                                                                    |
| FR15–FR17  | Recognizer unit tests on synthetic streams with explicit timestamps                                                            | exclusive, simultaneous, require-to-fail, nested; a blocked main thread; a pan at 10 pt per axis            | a wrong winner, a late deadline, or a translation that keeps the hysteresis fails         |
| FR18–FR22  | Browser tests with real touch input                                                                                            | per-axis pans beside native scrolling, page zoom, cancelled touches, clicks after taps, keyboard activation | a ghost click, a blocked scroll or zoom, or a cancelled unowned touchmove fails           |
| FR23       | Haptics tests on the recorded moments                                                                                          | tap, drag, lift                                                                                             | a haptic outside a UIKit moment fails                                                     |
| all        | iOS simulator: the UIKit reference capture and the same gesture in Safari                                                      | per component                                                                                               | an unmatched curve or timing is a parity defect                                           |

## Decision log

### DEC-1 — UIKit is the reference for touch presentations

**Reference:** `spec:AST-094/DEC-1`
**Decider:** pending owner approval

A touch presentation copies UIKit's behavior and numbers rather than
designing its own, because the people using it already know that behavior
from every other app on their phone. The values are measured, not
remembered: a number enters the table only with a citable source.

Rejected: tuning touch motion per theme, because the feel would then differ
from the platform the person is holding.

### DEC-2 — Recognizers track fingers; the compositor plays releases

**Reference:** `spec:AST-094/DEC-2`
**Decider:** pending owner approval

On iOS, native scroll snapping keeps tracking through a main-thread block,
but a finger that lifts during the block finishes on WebKit's own snap
physics rather than UIKit's curve, a finger cannot catch the content
mid-spring, and full-viewport hit testing breaks surfaces that leave the page
usable around them. Tracking therefore runs in the recognizers, and every
release runs as a compositor animation of a UIKit curve (FR5, FR9).

## Open questions

- **OQ1 — Scroll view bounce-back curve.** What curve brings a scroll view
  back from an overscroll? It is not a single spring from rest; the rubber
  band itself is settled. (`checkable`)
- **OQ2 — Rotation threshold.** What rotation starts a rotation gesture? No
  stored threshold is readable, and the simulator cannot script two-finger
  rotation. (`checkable`)
