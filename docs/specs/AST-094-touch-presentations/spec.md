---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-094
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
phase: accepted
owners: [vjeux]
affects_architecture:
  [
    architecture:interaction-modality,
    architecture:theme-tokens,
    architecture:theme-authoring-contract,
  ]
affects_families: [family:buttons]
affects_contributing: []
affects_consumer_docs: []
---

# Touch presentations feel native system spec

## Intent

A person using an Astryx product on a phone or tablet gets controls, sheets,
menus, lists and navigation with native-feeling touch behavior: measured
physics, timings and gesture thresholds instead of desktop motion stretched to
a finger. This behavior is the default on every touch device, iOS and Android
alike, with no opt-in, and its motion keeps running at display rate while the
page's JavaScript is busy.

The behavior comes from one measured table. Its values are measured from UIKit
on a named reference release, UIKit on iOS 26.2 today; each number names the
release it was taken from, moving the reference to a newer release re-measures
the table, and differences on older releases are noted, not targeted. Android
touch devices get the same behavior. How touch behavior differs between the
platforms is being explored, and the table records a separate value only where
a measured, sourced difference exists.

## Non-goals

- Pointer (desktop) presentations. Their timing and easing stay with the
  theme's duration and easing tokens (`architecture:theme-tokens`).
- Platform-matched look and feel: glass versus material surfaces, glyphs and
  chrome. This record governs behavior only.
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

- **FR1 — Measured values, the same everywhere.** Every spring, duration,
  deceleration rate, rubber-band coefficient, gesture threshold and haptic
  moment a touch presentation uses MUST default to the measured native value
  for that use (FR2), and every component that plays the same motion or
  gesture MUST use the same value; once the roles are public, a theme MAY
  override a motion role (FR4).
  No component uses a value of its own where a measured value exists. The same
  values apply on every touch platform; a platform gets a value of its own only
  where a measured, sourced difference exists (FR2).
- **FR2 — Every value has a source.** Each measured value MUST name its source next to it: Apple's documentation, a WWDC session, WebKit's own
  source where WebKit states it matches UIKit, or a measurement of UIKit on
  the iOS simulator naming the app, the iOS version, the method and the date.
  A value without one of these MUST be labelled a guess and name the
  measurement that will replace it. A decompilation of UIKit MAY aim a
  measurement and MUST NOT be a source. An owner decision MAY set a value
  that departs from a measurement; it names its date and the measurement it
  departs from.

  The values this record names for menus under a finger (FR29):

  | Value            | Default                                                                                                          | Source                                                                                                                                                                                                                          |
  | ---------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Open delay       | none in a fixed bar; 150 ms with no scroll taking the touch inside a scroll view (the content-touch delay, FR11) | owner decision, 2026-10-24, departing from UIKit on the iOS 26.2 simulator (iPhone 17 Pro), 2026-10-23, which opened a held finger's menu 150–153 ms after touch-down in a fixed position and about 303 ms inside a scroll view |
  | Handoff distance | 10 pt (CSS px), straight-line, from the first position the open menu sees                                        | measured: same setup; moves of (0, 9) and (7, 7) picked nothing, and (0, 10), (10, 0) and (9, 9) picked                                                                                                                         |
  | Drift allowance  | 13 pt (CSS px) of movement on the trigger before the open                                                        | unmeasured, needs a measurement or justification: a 12 pt move still opened the menu and a 14 pt move did not (OQ5)                                                                                                             |

  The scroll take distance FR20 names is 10 px (CSS px) of the finger's own
  travel from where it went down: measured along one axis in Mobile Safari
  26.2 on the iOS 26.2 simulator with a slow HID drag on a scrollable page,
  where the last cancelable `touchmove` is at 10 px and `pointercancel` at
  11 px, 2026-10-23. Measuring it straight-line for a diagonal drag is a guess
  until a diagonal drag on the same setup measures it.

- **FR3 — Native physics.** Springs MUST follow UIKit's spring model
  (response and damping ratio, mass, stiffness and damping, and the release
  velocity), with overdamping clamped to critical damping wherever UIKit
  clamps it. A momentum coast MUST decay like a UIKit scroll view (0.998 per
  millisecond, 0.99 for the fast rate), a drag past an edge MUST resist with
  UIKit's rubber band `(1 − 1 ÷ (x·c ÷ d + 1))·d` with the coefficient its use
  measures (0.55 for a scroll view and a sheet), and a release MUST pick its
  rest point by projecting its velocity the way its UIKit counterpart does:
  with a deceleration rate, or with a measured projection time.
- **FR4 — Touch motion uses named roles.** Every spring, duration and curve a
  touch presentation plays MUST be a motion role named for its use
  (`architecture:theme-tokens` INV3). The roles this record names are listed below with their defaults and
  sources; further roles a component's own record measures join through the
  generated motion role table (DEC-5). The role's value is its
  measured value (FR1, FR2). The roles are internal until the public
  motion-token set is decided, so a theme cannot override them yet (DEC-11). A component MUST read touch motion through these roles
  and MUST NOT play a literal. Once a role is public, a theme value MUST reach the motion at its
  start, without changing how the motion runs (FR5, FR6). Motion that
  must stay in step with the on-screen keyboard is not a theme role: it rides
  the keyboard's own motion (`spec:AST-099` FR8,
  `architecture:react-component-runtime` INV11). Gesture thresholds, the timings that decide who gets a touch (the
  content-touch delay, the scroll brake, momentum memory) and haptics are not
  motion: they stay internal measured values and are not public concepts (`spec:AST-002` FR3). When the public set is decided, its roles join the motion configuration of
  `architecture:theme-authoring-contract` and `architecture:theme-tokens`,
  whose rules are unchanged until then. It departs from the draft `design:motion` DR3
  wherever the native motion settles with an overshoot or stretches with a
  rubber band.

  | Role                       | Default                             | Source                                                                                         |
  | -------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
  | `springs.fingerTracking`   | response 0.15 s, damping ratio 0.86 | Apple: SwiftUI `interactiveSpring()`                                                           |
  | `springs.emphasis`         | duration 0.5 s, bounce 0.3          | Apple: SwiftUI `.bouncy`                                                                       |
  | `springs.settle`           | duration 0.5 s, bounce 0            | Apple: SwiftUI `.smooth`                                                                       |
  | `springs.quickChange`      | duration 0.5 s, bounce 0.15         | Apple: SwiftUI `.snappy`                                                                       |
  | `springs.viewChange`       | mass 3, stiffness 1000, damping 500 | measured: UIKit `UISpringTimingParameters()`, iOS 26.2 simulator, 2026-10-23                   |
  | `springs.timedChange`      | duration 0.5 s, bounce 0            | Apple: UIKit `UIView.animate(springDuration:bounce:)`                                          |
  | `springs.stateChange`      | response 0.55 s, damping ratio 1    | Apple: SwiftUI `Animation.default`                                                             |
  | `springs.directChange`     | response 0.5 s, damping ratio 0.825 | Apple: SwiftUI `.spring(response:dampingFraction:)`                                            |
  | `springs.menuOpen`         | damping ratio 0.8, response 0.32 s  | measured: UIMenu opening, iOS 26.2 simulator, 2026-10-23                                       |
  | `springs.menuClose`        | damping ratio 0.85, response 0.35 s | measured: UIMenu closing, iOS 26.2 simulator, 2026-10-23                                       |
  | `springs.subMenuOpen`      | damping ratio 0.85, response 0.4 s  | measured: UIKit's own spring for UIMenu's sub-menu opening, iOS 26.2 simulator, 2026-10-24     |
  | `springs.subMenuBack`      | damping ratio 1, response 0.4 s     | measured: UIKit's own spring for UIMenu's sub-menu header back, iOS 26.2 simulator, 2026-10-24 |
  | `timing.stateChangeMs`     | 250 ms                              | measured: Core Animation's implicit transaction, iOS 26.2 simulator, 2026-10-23                |
  | `timing.curves.viewChange` | cubic-bezier(0.25, 0.1, 0.25, 1)    | Apple: `CAMediaTimingFunctionName.default`                                                     |
  | `timing.curves.exit`       | cubic-bezier(0.42, 0, 1, 1)         | measured: UIKit's ease-in, iOS 26.2 simulator, 2026-10-23                                      |
  | `timing.curves.entrance`   | cubic-bezier(0, 0, 0.58, 1)         | measured: UIKit's ease-out, iOS 26.2 simulator, 2026-10-23                                     |
  | `timing.curves.move`       | cubic-bezier(0.42, 0, 0.58, 1)      | measured: UIKit's ease-in-out, iOS 26.2 simulator, 2026-10-23                                  |

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
- **FR7 — Exits animate as the native counterpart's do.** A touch
  presentation MUST play the exit its UIKit counterpart plays, on every touch
  platform. FR8 governs their reduced-motion form. Each overlay's own record states its
  exit, since members own their animation (`family:overlay-dismissal` AV6).
- **FR8 — Reduce Motion.** Under reduced motion, touch presentations follow
  `design:reduced-motion` DR2 and DR4.

### Gestures

- **FR9 — A finger is tracked off the render path.** A drag MUST follow the
  finger with one visual update per move, with no component render per move
  and no layout read after the gesture begins.
  Native scrolling MUST be used only where the component is a scroll view
  (lists, scroll areas, the page). A component MAY track a finger with native
  scroll snapping only with simulator evidence that it tracks through a
  main-thread block, ends on the native release curve, ends correctly when the
  finger lifts during a block, and lets a finger catch the content mid-flight.
- **FR10 — A second finger never breaks the first.** A second finger MUST NOT
  cancel or redirect a drag a recognizer has claimed. Page pinch-zoom MUST stay
  the browser's whenever no pinch recognizer claims the fingers, no drag is
  claimed, and the element's author `touch-action` keeps `pinch-zoom` (FR18;
  WCAG 1.4.4). A menu's press-tracking slide keeps
  `module:DropdownMenu/useMenuPress` FR4: a second pointer or `pointercancel`
  ends its gesture with nothing acting, which keeps the page zoomable over an
  open menu.
- **FR11 — Two press profiles.** Press feedback MUST follow one of two native
  profiles. A control (UIControl) highlights on touch-down outside scroll
  views and activates by the browser's click on a lift inside. On the web a
  control's press ends when the browser takes the touch (FR20), and its
  activation stays the browser's click, except that a toggle under
  `spec:AST-020` FR9's slide-off exception (Switch, Checkbox,
  CheckboxListItem) may also complete on a lift after the finger slid off.
  A cell (a table or collection cell) highlights 150 ms after touch-down inside
  a scroll view, drops the highlight when the scroll wins (FR20), and activates on a
  lift inside it with no scroll taking the touch (FR20). A control is inside a scroll view when it sits in a scrollable container,
  or in scrolling page content with no fixed ancestor; a control in a fixed
  bar (a top bar, a tab bar, a toolbar) is not. A control inside a scroll view
  takes the same 150 ms delay before its highlight and then follows its
  control profile; the 150 ms delay applies only inside scroll views. A control whose own record keeps its press through a drag
  keeps it: Slider's overlay stays on the dragged thumb (`design:user-states`
  DR4). On every touch platform this amends
  `design:user-states` DR1 (the pressed overlay during a hold) and DR3 (a held, selected SegmentedControl item keeps its raised selected
  surface; only its press timing follows the control profile) for touch
  presentations, the press treatment of `family:buttons`, and the last sentence of
  `module:DropdownMenu/useMenuPress` FR6 (menu rows paint `:active` only under
  `(hover: hover)`): under a finger, menu rows take the cell profile. A menu whose
  rows fit (`module:DropdownMenu/useMenuPress` FR4), so it cannot scroll,
  gives its rows no 150 ms delay: they highlight on touch-down. A list that can
  scroll keeps the delay. A press in a list that no scroll can claim stays
  unclaimed, which FR19 allows (DEC-14). FR6's
  rule that at most one row of a menu is lit still holds, so a finger that
  slides from one row to another lights only the row under it.
- **FR12 — Long press and rubber band are per use.** A long press MUST use the
  thresholds its UIKit counterpart uses: 0.5 s and 10 pt for a plain long
  press, the measured values for context menus and menus. A rubber band MUST
  use the coefficient its use measures.
- **FR13 — One rule for the touch presentation.** A touch presentation
  applies under a coarse primary pointer, and only after hydration: a server
  render and the hydrating render produce the pointer presentation
  (`spec:AST-013` FR9). Where a presentation also depends on size, compact is
  governed by `spec:AST-012` FR9 and `architecture:public-component-api`
  INV17. A presentation asks for exactly the conditions its own record names
  (the date and time sheet asks for the pointer only, `spec:AST-043` FR1).
  A style keyed on the literal touch media query conforms, since the server
  and hydrating markup are identical (DEC-6).
- **FR14 — Nested scrolling follows the native rule.** Who gets a drag that
  starts inside a scroll area MUST be decided once, when the drag begins. If
  the area sits at its edge and the drag moves toward that edge, the
  surrounding surface (a sheet) takes the drag; otherwise the area keeps it for
  the whole gesture and rubber-bands at its edge. The drag MUST NOT change
  hands midway, in either direction. This amends `spec:AST-025` FR14 (scroll
  chaining by default) for touch presentations on every touch platform.
- **FR15 — Recognizers arbitrate like UIKit's.** Recognizers that see the
  same touch sequence MUST be exclusive by default: the first to recognize
  wins and the others fail, unless both allow simultaneous recognition. A
  recognizer that requires another to fail MUST hold its recognition until
  that one fails, and MUST fail if that one recognizes. When several recognize
  on the same event, the innermost element's recognizer MUST win. Watchers
  are exempt from this exclusivity: they recognize alongside a claiming
  winner, which never fails or cancels them (DEC-7).
- **FR16 — Gestures keep the event clock.** Recognizers MUST read time from the
  input events' timestamps. Durations (a long press, the interval between
  taps) MUST be deadlines on that clock, so a blocked main thread delays the
  report and never the moment reported.
- **FR17 — Native readings.** A recognizer's thresholds MUST follow UIKit's
  measured values (FR1, FR2). A pan begins at 10 pt of travel on either axis (a
  screen-edge pan attached to an element within the band at 15 px, FR18),
  and its translation excludes that travel. Release velocity is governed by `spec:AST-100`.
- **FR18 — `touch-action` leaves the browser the rest.** An element with touch
  recognizers MUST get a `touch-action` that leaves the browser exactly what
  its recognizers do not use: the other axis for an axis-limited pan or swipe,
  `manipulation` for taps and long presses, everything for a one-way pan or a
  pan that shares its axis with native scrolling. `pinch-zoom` MUST stay
  unless a pinch or rotation recognizer is attached. The derived value is
  intersected with the element's own author `touch-action` and is never wider
  than it (DEC-8); when the author's value leaves out `pinch-zoom`, the
  author's value wins. A screen-edge pan claims `pan-x` only for a touch that
  lands in the edge band, 40.2 px wide at that edge (UIKit's measured edge
  region on a 402 px wide screen; that it scales with the screen's width is a
  guess until a second screen width measures it), and inside the band it
  decides at 15 px of travel (UIKit's screen-edge hysteresis); outside the
  band the author's scrolling is untouched, and FR19's 10 px governs every
  other claim (DEC-13). The band's `pan-x` claim and 15 px start apply where the
  screen-edge pan is attached to an element that lies within the band; on an
  element that reaches beyond it, whose `touch-action` cannot claim per touch, a touch in the band
  decides at FR19's 10 px like every other claim.
- **FR19 — Claims are made in time and only by an owner.** Recognizers attach only where the primary pointer
  is coarse (FR13, DEC-6). Where the primary pointer is fine, no recognizer
  attaches and no touch listener is registered (FR24), so a finger on a
  touchscreen whose primary pointer is fine gets the browser's defaults for
  this record's behaviors (`spec:AST-017` FR59, DEC-25). This rule governs
  this record's behaviors only; `spec:AST-057` keeps its per-event pointer
  read for the row swipe, as its record states. A recognizer that begins MUST claim its touches by cancelling
  `touchmove` through a non-passive listener on its element; a watcher,
  which never claims, is exempt (DEC-7). A `touchmove` of a touch no recognizer owns MUST NOT be cancelled, with
  three exceptions. While a scroll lock under a modal presentation holds the
  page, it MAY cancel the moves of a one-finger touch that no recognizer owns
  when that pan would scroll the page; a second finger is never cancelled
  (FR10), and the page keeps pinch-zoom. Once its press is delivered, a
  control that keeps its press through a drag (FR11) owns its touch and MAY
  cancel that finger's moves. A scroll-edge pan, such as a sheet's pull
  from a scroll area at its edge (FR14), MAY cancel its touch's moves from the
  first move, only while every scroller under the finger sits at its edge and
  the drag moves toward that edge (FR14), and only the moves the browser would
  rubber-band, never a real scroll; the pan itself still begins at FR17's
  10 pt, as UIKit's sheet pull does (DEC-18). A
  recognizer that competes with native scrolling MUST decide within 10 px of
  travel, before the browser commits to the scroll; a screen-edge pan on an
  element within its band, which leaves the browser no horizontal scroll,
  decides within 15 px, and one on a wider element within 10 px (FR18). Only an element with a
  recognizer that must claim mid-gesture registers that blocking listener; an
  element whose recognizers decide only at the lift keeps its `touchmove`
  listener passive, and its `touchend` listener stays cancelable so the
  gesture can cancel the click (FR21). Known limit: a native scroll that starts on an element with a
  blocking listener waits for a free main thread in iOS Safari and Chromium.
  That is never worse than UIKit, whose scrolling stops on a busy main thread,
  and a passive listener, or one added at `touchstart`, would hand diagonal
  drags to the scroll.
- **FR20 — The browser can take a touch.** `pointercancel`, an uncancelable
  `touchmove`, or a native scroll under the touch MUST count as the browser
  taking the touch, a native scroll only once that finger has moved the scroll
  take distance (FR2), so sub-pixel movement under a still finger does not
  cancel a tap (DEC-8): possible recognizers that share it fail, active ones are
  cancelled, and the view's press is cancelled without a release. A recognizer that never claims (a watcher) registers only passive
  listeners (`architecture:react-component-runtime` INV3, INV5), and a
  watcher is not cancelled when the browser takes the touch: it follows the
  scroll to the lift (DEC-7).
- **FR21 — Clicks follow the gesture.** When a gesture takes a touch, its
  `touchend` MUST be cancelled, and no click or compatibility mouse event
  reaches the page. A click held for a recognizer that may still recognize (a
  tap that a double tap may claim) MUST be replayed on its target if that
  recognizer fails. Activation with `detail === 0` (keyboard, assistive
  technology) MUST always pass. A tap MUST NOT wait for the browser's
  double-tap delay.
- **FR22 — The platform keeps its edge gestures.** iOS Safari's back swipe
  from the screen edge and Android's system back gesture MUST stay the
  browser's and the system's; a touch presentation never overrides them.

### Menus and popovers under a finger

FR26–FR28 and FR30 apply to every surface that carries the press model of
`module:DropdownMenu/useMenuPress` (DropdownMenu, ContextMenu, their sub-menus,
and Selector's listbox, whose options count as rows) when a finger or pen
drives it and the primary pointer is coarse (FR19); where the primary pointer
is fine, a finger in a menu keeps today's behavior (`spec:AST-017` FR59,
DEC-25), and menus make no per-gesture pointer read; FR29 applies to DropdownMenu's trigger under the same
condition; FR34 applies to menus;
FR31 and FR35 apply to anchored menus and to Popover under a finger; FR32 and
FR33 apply to menus only. A mouse keeps today's behavior.

- **FR26 — The lift decides.** A menu row MUST act when the finger lifts over
  it, never because the press began on it; a press that never left its row is
  a tap and acts on that row. One gesture acts at most once: the browser's
  click for that gesture acts on nothing.
- **FR27 — The highlight follows the finger.** While a finger is held in an
  open menu, the lit row MUST be the enabled row under it, and nothing is lit
  over a divider, a heading, a disabled row or outside the menu. At most one
  row is lit; the row the press began on keeps no pressed look once the
  finger leaves it (FR11).
- **FR28 — A lift outside keeps the menu open.** A finger that began inside
  a menu and lifts outside it MUST act on nothing and leave the menu open. A
  cancelled touch, a second finger, or the window losing focus ends the
  gesture: nothing acts and the lit row clears.
- **FR29 — DropdownMenu opens on press, with the opening finger's
  handoff.** This rule covers DropdownMenu's trigger only; ContextMenu,
  sub-menu rows and Selector keep their own opening. Under a finger, a
  DropdownMenu trigger in a fixed bar MUST open its menu as the finger
  presses. A trigger inside a scroll view (FR11) MUST open it once the 150 ms
  content-touch delay has passed with no scroll taking the touch (FR20), or at the lift of a tap that
  ends sooner; a scroll that takes the touch first (FR20) takes it and nothing opens. Before the open, the finger may move no
  more than the drift allowance (FR2). After an open under a held finger,
  nothing is lit and a lift acts on nothing until the finger has travelled
  the handoff distance from the first position the open menu sees; from then
  on FR26–FR28 apply. `presentation="popover"` keeps today's open on a tap;
  the default is unset (`architecture:public-component-api` INV16). The delay and distances are internal values and gain no new props
  (`spec:AST-002` FR3); A `module:DropdownMenu/useMenuPress` caller that sets the released
  `longPressDelayMs` gets that wait in a fixed bar and in a scroll view alike,
  which keeps the released behavior (`spec:AST-017` FR3).
- **FR30 — Edge autoscroll under a finger.** While a finger is held in a menu
  that scrolls, resting near its top or bottom edge MUST scroll the menu
  toward that edge, and the lit row MUST follow the row now under the finger.
  The scrolling stops when the finger leaves the edge, the menu reaches its
  end, or the gesture ends.
- **FR31 — Menus and popovers grow from their trigger and shrink back.**
  Under a finger, on every touch device, an anchored menu or a Popover MUST
  open by growing out of its trigger and close by shrinking back into it, on
  its motion roles (FR4; a menu on `springs.menuOpen` and
  `springs.menuClose`). The shrink plays in full after the surface has
  closed. This is its exit under FR7 (`family:overlay-dismissal` AV6); under
  reduced motion FR8 applies. A menu or popover presented as a bottom sheet
  follows the sheet instead.
- **FR32 — A pan outside dismisses.** Under a finger, an open anchored menu MUST close as a touch outside it
  begins to pan, and at the lift of a tap or hold outside it. A Popover's
  dismissal is unchanged. A pinch stays available over it: its surface
  never takes `touch-action: none`, so the page keeps zooming unless the
  author's own `touch-action` leaves out `pinch-zoom` (FR10, FR18;
  WCAG 2.2 SC 1.4.4). Listening for that outside touch costs nothing once it ends (FR24). A menu
  whose caller passes `presentation="popover"` keeps its released outside
  dismissal (FR25).
- **FR33 — A ContextMenu under a finger.** With a finger or pen, the long
  press that opens a ContextMenu MUST NOT close it at the lift, and a press
  outside it follows FR32. After a held
  finger opens it, nothing is lit and a lift acts on nothing until that finger
  has travelled the handoff distance (FR2) from the first position the open
  menu sees; from then on FR26–FR28 apply. On every touch device, a ContextMenu that a held
  finger opens on a block trigger MUST lift the trigger above the page and
  show the menu beside it, with no row lit. A tap outside closes the menu and
  reaches nothing beneath it, and closing returns the trigger to its place.
  Under reduced motion FR8 applies. An inline trigger keeps today's menu, a menu presented as a
  bottom sheet follows the sheet, and `presentation="popover"` keeps the
  released menu without the lift (`architecture:public-component-api`
  INV16).
- **FR34 — A sub-menu drills in under a finger.** Under a finger on a
  compact touch screen, an `adaptive` sub-menu row MUST drill in: the
  sub-menu's rows and a leading "Back to <parent>" row replace the menu's rows
  in the same surface, no flyout opens, and Back returns to the row that
  opened it (`component:DropdownMenu` FR11 and FR20). The change between
  levels plays on the motion roles `springs.subMenuOpen` and
  `springs.subMenuBack` (FR4); under reduced motion FR8 applies.
- **FR35 — A presentation takes no input while it grows.** Under a finger, a
  tap or a drag that lands while a Popover or an anchored menu is still
  growing out of its trigger MUST NOT close it, scroll the page, move focus,
  or reach anything beneath it; the presentation finishes and stays open. A
  pinch still zooms the page (FR10). A mouse keeps today's behavior.

### Release decisions

- **FR36 — One decision, at the release.** A drag that can commit an action
  MUST decide once, when the finger lifts: if its projected travel (the
  travel so far plus the release velocity times the use's projection, FR3)
  reaches the use's commit point, the action commits; otherwise the surface
  springs back. The decision MUST NOT change while the surface settles. The
  same rule backs dismissing a BottomSheet, a Toast or a Lightbox, popping a
  NavigationStack, and dismissing the keyboard; each use's commit point and
  projection are measured values (FR1, FR2). A row swipe keeps
  `spec:AST-057`'s own release rule.
- **FR37 — Moving back cancels.** A release whose velocity points back
  toward the start MUST cancel, whatever the travel so far.
- **FR38 — The settle continues the finger.** The commit or the spring-back
  MUST start at the release velocity (FR6). Under reduced motion it follows
  `design:reduced-motion` DR2.
- **FR39 — The action never needs a drag.** Every action a drag commits MUST
  also be reachable without a drag, by keyboard and by mouse
  (`architecture:interaction-modality` INV4).
- **FR40 — Release velocity.** The velocity FR36–FR38 read is governed by
  `spec:AST-100`.

### Text selection

- **FR41 — A held finger does what the hold does, not a selection.** A tap
  activates as it does today and never selects text. On an element whose hold
  does something, such as a ContextMenu trigger or a row with a context menu
  (a long press at FR12's threshold), or a control whose own record defines a
  hold action, such as a slider's thumb or a stepper's hold-repeat, the hold
  does that and the browser's text-selection start and callout are suppressed
  for that press only, lifted at the lift or a cancel; that element's text is
  not selectable by a long press, and Astryx adds no Copy item to a menu. An
  element's existing always-on suppression stays as it is. On a label or plain
  text whose hold does nothing, such as a checkbox row's label, a long press
  selects natively, with the browser's handles; any other element follows its
  own record. Keyboard and assistive-technology selection are unchanged, and a
  mouse keeps its released behavior (`spec:AST-017` FR59; DEC-9).

  Guidance: a caller whose menu element carries text a person may want offers
  a Copy action in its menu.

### Haptics

- **FR23 — Haptics where the native counterpart plays them.** A touch
  presentation MUST play a haptic only at the moments its UIKit counterpart
  does. In iOS Safari the only haptic a page can produce is a light impact from
  a real tap landing on a `<label>` or a switch checkbox; a moment UIKit marks
  mid-drag or after the lift has no haptic there, and the component records
  that gap. `navigator.vibrate` stands in where the platform offers it.

### Resources and compatibility

- **FR24 — Touch work costs nothing where it is not used.** Where the
  primary pointer is fine (FR19), and while a touch presentation is
  disabled, no touch-only listener, observer or timer is active, except the
  released `module:DropdownMenu/useMenuPress` behavior a finger keeps there
  (its FR9). The number of `document`- or `window`-level
  touch listeners MUST NOT grow with the number of component instances, a
  repeated row or cell adds no touch observer of its own, and nothing
  touch-related remains after the last instance unmounts
  (`architecture:react-component-runtime` INV5, INV7).
- **FR25 — A moved default keeps a way back.** Where a touch presentation
  moves a released default, the way back and its release note are governed by
  `architecture:public-component-api` INV16 and `spec:AST-017` DEC-23 and FR3.
  This record moves four: Selector's `adaptive` presentation policy;
  DropdownMenu's omitted `presentation`, released as `'popover'`, which
  `presentation="popover"` keeps (FR29); ContextMenu's omitted
  `presentation`, released as `'popover'`, which `presentation="popover"`
  keeps without the lift (FR33); and `module:DropdownMenu/useMenuPress`'s
  released 500 ms `longPressDelayMs`, which a caller keeps by passing it
  (FR29).
  This replaces `component:Selector` DEC-1's width-and-pointer query with the
  FR13 rule for `adaptive`.

### Platform support

- Supported engines: Astryx's supported browsers (`spec:AST-013`) with touch
  input, on iOS and Android. UIKit on the reference release is the parity
  reference, not a support floor; an older iOS Safari gets the same behavior
  wherever its engine supports it, and Android Chrome gets the same behavior.
  This amends `spec:AST-013` FR3 with an explicit Android Chrome support row
  for touch presentations.
- Unsupported behavior: haptics outside the moments FR23 allows. Where an
  engine cannot run a curve on its compositor, the animation still plays and
  still ends on its committed state.
- Browser evidence: the busy-main-thread proof and no layout or paint during
  the animation in Chromium with phone emulation, the busy-main-thread proof
  in WebKit, curves sampled by seeking the running animations, iOS simulator
  recordings for every claim about the reference values, and real-device
  evidence for every claim about iOS Safari and Android Chrome behavior
  (`spec:AST-013` FR10).

## Current-state impact

- `architecture:theme-tokens` and `architecture:theme-authoring-contract`:
  unchanged until the public motion-token set is decided; then its roles join
  the motion configuration (FR4, DEC-11).
- `architecture:interaction-modality`: the touch-presentation conditions
  (FR13) sit beside the shared modality state; its invariants are unchanged.
- `architecture:react-component-runtime`: FR24 states the caller-visible
  outcome of INV5 and INV7 for touch work; both are unchanged.
- Under FR41: ContextMenu's trigger, DropdownMenu's built-in trigger and its menu, and
  Slider's track already turn selection off at all times (the menus also the
  callout), and that stays. A held finger on other rows and controls with a
  hold action can start a selection or the callout today, and no shared,
  press-scoped suppression exists.
- `family:buttons`: the control and cell press profiles (FR11).
- Each overlay member's own record (Dialog, BottomSheet, Drawer, Popover, the
  menus): its touch exit and its Reduce Motion cross-fade (FR7, FR8), since
  members own their animation (`family:overlay-dismissal` AV6).
- `design:reduced-motion` owns the reduced-motion rule FR8 applies.
- `component:Selector` DEC-1: `adaptive` resolves through the FR13 touch rule
  (a coarse pointer and the `spec:AST-012` FR9 compact definition) instead of
  its own width-and-pointer query, with `presentation` as the way back (FR25).
- `component:DropdownMenu` and `component:ContextMenu`: an omitted
  `presentation`, released as `'popover'`, follows FR29 and FR33 under a
  finger; `presentation="popover"` keeps the released behavior (FR25).
- `module:DropdownMenu/useMenuPress`: the released 500 ms `longPressDelayMs`
  default gives way to FR29's timing; a caller that passes it keeps it (FR25).
- `module:DropdownMenu/useMenuPress`: its finger rules (FR1–FR3, FR6, FR7
  and FR9 under a finger) are stated here (FR26–FR30); FR6's last sentence
  gives way to the cell press profile (FR11); its mouse rules (FR8 and the
  mouse halves of FR1–FR3) and its non-gesture rules stay in the module.
- `component:DropdownMenu`, `component:ContextMenu` and `component:Popover`:
  under a finger they follow FR26–FR35 as each applies.
- BottomSheet, Toast, Lightbox, NavigationStack and keyboard dismissal: a
  drag that commits follows FR36–FR40.
- `spec:AST-100` owns release velocity, which FR17 reads.
- `design:user-states` DR1 and DR3, `spec:AST-025` FR14 and `spec:AST-013` FR3
  each carry an amendment for touch presentations (FR11, FR14, Platform
  support); `design:motion` DR3 and DR5 (draft) are departed from or met as
  FR4 and FR8 state.
- Consumer docs: none until a component ships its touch presentation; each
  component documents its own, including the `presentation` value that keeps
  the released surface (FR25).

## Verification

| Contract        | Verification                                                                                                                   | Representative states                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Mutation or failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1, FR2        | Value check over every measured value and its uses                                                                             | every value; a guess and its measurement task; a platform-specific value; two components playing the same motion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | an unsourced value, an unknown source kind, a guess without a listed measurement, an unsourced platform split, or two values for one use fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| FR3             | Unit tests of the spring, decay, rubber band and projection math against an independent integration and values read from UIKit | under-, critically and overdamped springs; release velocities; both rates; overscroll depths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | changing a formula or a constant breaks the agreement with UIKit's values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| FR4             | Role unit tests over every touch motion                                                                                        | each role at its table value; a theme that writes `motion`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | a literal played in place of a role, a value that differs from the table, or a theme that changes a role before the public set is decided fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| FR5             | Browser proof: an animation keeps advancing frame by frame through a 1 s main-thread block, with no layout or paint per frame  | Chromium phone emulation; WebKit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | a script-driven or layout-animating implementation freezes or lays out                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR6             | Unit and browser tests catching an animation mid-flight and retargeting it                                                     | catch at peak velocity; retarget with a new spring                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | a layout read, a jump, or a lost velocity fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| FR7, FR8        | Component browser tests and storyboards with and without Reduce Motion                                                         | entrance, exit, move; a drag and its lift under Reduce Motion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | a missing exit, any travel, scale or spring under Reduce Motion other than a coast after a throw and its settle at an edge (`design:reduced-motion` DR2), or an opacity fade over 200 ms fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| FR9, FR10       | Recognizer unit tests on synthetic streams and browser tests with real touch input                                             | drag, second finger, pinch, page zoom, main-thread block                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | a second finger that breaks a drag, or a page pinch blocked other than by the author's `touch-action`, fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR11, FR12      | Press and long-press tests on synthetic streams with explicit timestamps                                                       | inside and outside a scroll view; a drag the browser takes; a lift inside; a menu row under a finger; a press on a row of a menu whose rows fit and of one that scrolls; a slide-off lift on a Switch and on a Radio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | the wrong profile's timing, a press that survives the browser taking the touch, or a control activated other than by the browser's click, outside `spec:AST-020` FR9's slide-off exception, a row of a menu whose rows fit that waits 150 ms, or one of a scrolling menu that does not, or a slide-off lift that completes a control outside `spec:AST-020` FR9's exception, fails                                                                                                                                                                                                                                                                                                                        |
| FR13            | Resolver unit tests and a server-render test                                                                                   | coarse and fine pointer; narrow, wide and short; server render; hydrating render                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | a component that answers the conditions differently, or a touch presentation in the server or hydrating render, fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| FR14            | Browser tests of a sheet over a scrolled list                                                                                  | scrolled and at its top                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | a midway handoff fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR15–FR17       | Recognizer unit tests on synthetic streams with explicit timestamps                                                            | exclusive, simultaneous, require-to-fail, nested; a watcher beside a claiming winner; a blocked main thread; a pan at 10 pt per axis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | a wrong winner, a late deadline, or a translation that keeps the hysteresis, or a watcher failed or cancelled by a claiming winner fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| FR18–FR22       | Browser tests with real touch input (`spec:AST-013` FR10)                                                                      | per-axis pans beside native scrolling, page zoom, cancelled touches, clicks after taps, keyboard activation, a modal scroll lock, a control that keeps its press through a drag; a still finger with sub-pixel jitter over a scroll view; a finger moved 9 px and 10 px straight, and (7, 7) and (8, 8) diagonally; a recognizer on an element whose author `touch-action` is narrower, including one without `pinch-zoom`; a screen-edge pan landing at 40 px and at 41 px from the edge, at 14 px and 15 px of travel, and a horizontal scroll that starts outside the band; a screen-edge pan on an element within the band, and on one that reaches beyond it; a sheet's pull from a list at its top, and from a list scrolled away from its top | a ghost click, a scroll or zoom blocked other than by the author's `touch-action`, or a cancelled unowned touchmove outside FR19's three exceptions, a tap cancelled by sub-pixel movement or by under 10 px of travel, a scroll that does not take the touch at 10 px, or a derived `touch-action` wider than the author's, a screen-edge pan that claims outside its band or before 15 px on an element within the band, or has not claimed at 15 px, or an author scroll outside the band that is blocked, a band claim of `pan-x` on an element that reaches beyond the band, or a 15 px start there, or a scroll-edge pan that cancels a move a scroller could scroll, or begins before 10 pt, fails |
| FR23            | Haptics tests on the recorded moments                                                                                          | tap, drag, lift                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | a haptic outside a native moment fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR24            | Resource tests counting listeners, observers and timers                                                                        | fine primary pointer; coarse pointer enabled and disabled; many instances; unmount                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | a touch listener on a fine pointer, a per-instance `document` or `window` listener, or a leak fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR25            | Component tests of each moved default and its `presentation` value                                                             | default; `presentation` set to the released surface                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | a moved default that `presentation` does not restore, or a public threshold, fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| FR26–FR28, FR30 | Menu press tests on synthetic touch streams and a real-Chromium touch test                                                     | a slide from one row to another; a lift outside; a cancel; a second finger; edge autoscroll                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | an act on the press-start row, two acts for one gesture, a lift outside that closes, or a lit row after a cancel fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR29            | Trigger tests with explicit timestamps                                                                                         | a press in a fixed bar; a press in scrolling content held 149 and 150 ms; a quick tap in scrolling content; a scroll taking the touch before 150 ms; a drift of 12 and 14 pt; moves before and after the handoff; `presentation="popover"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | a fixed-bar press that waits, a held finger's scroll-view open before 150 ms or after a scroll, a quick tap that does not open at its lift, an open past the drift allowance, a lift that acts before the handoff, or a `popover` trigger that opens on press fails                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR31–FR33       | Browser tests and storyboards under a finger                                                                                   | a menu, a Popover and a ContextMenu lift: open, close, a pan outside, a tap outside, a pinch over the surface; a mouse                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | a surface that does not grow from and shrink into its trigger, a pan outside that leaves a menu open, a Popover whose dismissal changed, a pinch blocked other than by the author's `touch-action`, a tap outside that reaches the page, or a changed mouse path fails                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FR34, FR35      | Browser tests and storyboards under a finger                                                                                   | a sub-menu drilling in and its Back row returning; a tap and a drag during a popover's and a menu's growth; a pinch during growth; a mouse                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | a drill-in that leaves the parent's rows in place, a change between levels that does not play on its roles, a tap during growth that closes, scrolls or moves focus, a pinch blocked other than by the author's `touch-action`, or a changed mouse path fails                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| FR36–FR40       | Release tests on synthetic touch streams with explicit timestamps, per use                                                     | below and past each commit point; a flick that projects past it; a slow drag past it; a release moving back; Reduce Motion; keyboard and mouse paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | a decision that changes mid-settle, a release moving back that commits, a settle that does not start at the release velocity, or an action with no keyboard or mouse path fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| FR41            | Browser tests with real touch input (`spec:AST-013` FR10)                                                                      | a tap; a long press on a ContextMenu trigger, a DropdownMenu trigger the caller renders, a row with a context menu, and a slider thumb; a long press on a checkbox row's label and on plain text; a cancelled press; mouse and keyboard selection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | a tap that selects, a hold with an action that starts a selection or callout, a label or plain text whose long press does not select natively, a suppression that outlives the press, or a change to native selection elsewhere or to mouse, keyboard, or assistive-technology selection fails                                                                                                                                                                                                                                                                                                                                                                                                            |
| all             | iOS simulator: the UIKit reference capture and the same gesture in Safari; real iOS Safari and Android Chrome devices          | per component                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | an unmatched curve or timing is a parity defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Decision log

### DEC-1 — Touch presentations feel native by default

**Reference:** `spec:AST-094/DEC-1`
**Decider:** `cixzhang`, `2026-10-24`

Every touch device gets one native-feeling touch behavior by default, without
an opt-in, because the people using it already know that behavior from every
other app on their phone. The behavior's values are measured from UIKit, not
remembered: a number enters the table only with a citable source, and Android
touch devices get the same values until a measured, sourced difference is
recorded.

The table supplies the defaults and a theme may retune any motion role (FR4):
a product can soften a spring without forking a component, and the measured
values stay the ones it starts from. Platform-matched look and feel is not part
of this decision.

### DEC-2 — Recognizers track fingers; the compositor plays releases

**Reference:** `spec:AST-094/DEC-2`
**Decider:** `cixzhang`, `2026-10-24`

On iOS, native scroll snapping keeps tracking through a main-thread block,
but a finger that lifts during the block finishes on WebKit's own snap
physics rather than UIKit's curve, a finger cannot catch the content
mid-spring, and full-viewport hit testing breaks surfaces that leave the page
usable around them. Tracking therefore runs in the recognizers, and every
release runs as a compositor animation of the measured curve (FR5, FR9).

### DEC-3 — Touch motion is themeable; gesture thresholds are not

**Reference:** `spec:AST-094/DEC-3`
**Decider:** `cixzhang`, `2026-10-24`

A product tunes motion as it tunes color and type, so every touch spring,
duration and curve is a theme motion role whose default is the measured value
(FR4). Thresholds decide who gets a touch, not how anything looks, so they stay
internal (`spec:AST-002` FR3).

### DEC-4 — A finger opens a menu on press

**Reference:** `spec:AST-094/DEC-4`
**Decider:** `cixzhang`, `2026-10-24`

A trigger in a fixed bar has nothing to scroll, so its menu opens as the
finger presses; inside a scroll view the menu waits out the content-touch
delay so a scroll can still claim the touch (FR29). A caller's `presentation`
choice keeps today's open on a tap (`architecture:public-component-api`
INV16).

### DEC-5 — FR4 cites the generated motion role table

**Reference:** `spec:AST-094/DEC-5`
**Decider:** `cixzhang`, `2026-10-25`

FR4 lists the roles this record names, and cites the generated motion role
table, built from every registered table, for the roles a component's own
record measures, so a new component table cannot drift from the record.

### DEC-6 — CSS keyed on the touch media query counts as after hydration

**Reference:** `spec:AST-094/DEC-6`
**Decider:** `cixzhang`, `2026-10-25`

FR13's "only after hydration" governs a presentation decided in script. A
style keyed on the literal touch media query conforms: the server and
hydrating markup are identical, and the browser applies the style at first
paint.

### DEC-7 — A watcher recognizer is passive and follows the scroll

**Reference:** `spec:AST-094/DEC-7`
**Decider:** `cixzhang`, `2026-10-25`

A recognizer that never claims registers only passive listeners (FR20), so
watching a touch never delays the browser's scroll, and it is not cancelled
when the browser takes the touch: it follows the scroll to the lift, so a bar
that reacts to scrolling keeps hearing it. Nor does a recognizer that claims
the touch fail or cancel it: a watcher recognizes alongside the winner.

### DEC-8 — A native scroll takes a touch after 10 px; touch-action never widens the author's

**Reference:** `spec:AST-094/DEC-8`
**Decider:** `cixzhang`, `2026-10-25`

A still finger often reports sub-pixel movement, and treating that as a scroll
cancels taps the person meant, so a native scroll counts as the browser
taking the touch only once the finger has moved 10 px. An author who narrows
an element's `touch-action` has a reason, so the value derived from
recognizers is intersected with it and never grants the browser more.

Rejected: cancelling at the first scroll event, and overriding the author's `touch-action`.

### DEC-9 — A hold does its action, not a selection; copying is the caller's menu item

**Reference:** `spec:AST-094/DEC-9`
**Decider:** `cixzhang`, `2026-10-25`

Under a finger, a tap, a hold that does something, and a long press on plain
text are different intents. A tap activates. A hold on an element whose hold
does something (a long-press menu, a stepper's hold-repeat, a slider's thumb)
does that without starting a selection or the loupe, as UIKit's context menus
and controls and Android's long clicks do. A long press on a label or plain text whose
hold does nothing selects natively, so labels stay selectable; other elements
follow their own records. Text on a menu
element is not selectable by a long press, and the system adds no Copy item,
so a caller that wants copying puts a Copy action in its own menu.

Rejected: a system Copy item; suppressing selection on every press-tracked control.

### DEC-11 — Touch motion roles stay internal until the public set is decided

**Reference:** `spec:AST-094/DEC-11`
**Decider:** `cixzhang`, `2026-10-25`

Motion values stay internal for now: a public, theme-settable set is decided
separately, so no component-specific role becomes a public token first.

This defers DEC-1's and DEC-3's theme retuning until that set exists.

Rejected: publishing the per-component roles as theme tokens.

### DEC-13 — A screen-edge pan claims only a thin band at the edge

**Reference:** `spec:AST-094/DEC-13`
**Decider:** `cixzhang`, `2026-10-26`

An edge swipe, such as going back, starts at the very edge of the screen, and
a page's own horizontal scrolling lives everywhere else. So a screen-edge pan
claims the horizontal axis only in UIKit's edge band and decides there at
UIKit's 15 px, leaving the author's scrolling untouched outside it. On an
element that reaches beyond the band, `touch-action` cannot claim per touch,
so there an in-band touch decides at 10 px (DEC-22).

Rejected: claiming `pan-x` across the whole element.

### DEC-14 — A menu that cannot scroll highlights its rows at once

**Reference:** `spec:AST-094/DEC-14`
**Decider:** `cixzhang`, `2026-10-26`

The cell delay exists so a scroll can win before a row lights. A menu whose
rows fit cannot scroll, so it has no scroll to wait for and its rows highlight
on touch-down; a list that can scroll keeps the delay. That a UIKit menu's
rows likewise highlight on touch-down is a guess until a short UIMenu on the
iOS 26.2 simulator measures it.

Rejected: the 150 ms delay on every menu row.

### DEC-19 — A phone menu stays beside its trigger

**Reference:** `spec:AST-094/DEC-19`
**Decider:** `cixzhang`, `2026-10-26`

On a compact touch screen an anchored menu keeps the layer runtime's normal
placement beside its trigger, inside the viewport gutter, so the trigger stays
visible while the menu is open wherever the menu fits beside it; a menu taller
than the room on either side follows the layer runtime's own fallback.

Rejected: covering the trigger, centered on it and aligned with its top or
bottom, as UIKit's menu does.

### DEC-22 — An edge band claims only on an element within the band

**Reference:** `spec:AST-094/DEC-22`
**Decider:** `cixzhang`, `2026-10-26`

`touch-action` is set per element, not per touch, so the band's `pan-x` claim
and 15 px start can only hold on an element that lies within the band. On a
wider element an in-band touch decides at 10 px like every other claim, since
claiming `pan-x` across it would take the author's scrolling (DEC-13).

Rejected: a whole-element claim on a wider element.

### DEC-18 — A scroll-edge pan may hold the page's rubber band from the first move

**Reference:** `spec:AST-094/DEC-18`
**Decider:** `cixzhang`, `2026-10-26`

When every scroller under the finger is at its edge and the drag moves toward
that edge, the browser would otherwise rubber-band the page before the pan
reaches its 10 pt start (a reading of Mobile Safari's overscroll, not a
measurement), so a sheet's pull would visibly fight the page. Cancelling only
those moves, from the first, matches UIKit's sheet pull, and a real scroll is
never cancelled. The trade-off: a list inside a sheet cannot pull to refresh
from its top.

Rejected: cancelling moves only after the pan begins.

## Open questions

- **OQ1 — Scroll view bounce-back curve.** What curve brings a scroll view
  back from an overscroll? It is not a single spring from rest; the rubber
  band itself is settled. (`checkable`)
- **OQ2 — Rotation threshold.** What rotation starts a rotation gesture? No
  stored threshold is readable, and the simulator cannot script two-finger
  rotation. (`checkable`)
- **OQ5 — The menu's drift allowance.** The 13 pt drift allowance (FR29)
  sits between a 12 pt move that opened the menu and a 14 pt move that did
  not. Is that bracket its justification, or does it need a finer
  measurement? (`owner decision`)
- **OQ6 — Opening a sub-menu without a lift.** Resolved by
  `module:DropdownMenu/useMenuPress` DEC-8: a finger resting on a sub-menu row
  never opens it; a lift on the row does (its FR10).
- **OQ7 — The opening haptic.** UIKit plays a haptic as a held finger
  opens a menu; a page in iOS Safari cannot (FR23). Where does the menu record
  that gap? (`owner decision`)
- **OQ8 — Withdrawing a tentative open.** Resolved by
  `module:DropdownMenu/useMenuPress` DEC-8: nothing withdraws an open, so a
  screen reader hears one open and one close (its AR5).
- **OQ10 — A sub-menu with its parent visible.** Should a drilled-in sub-menu
  open in place, the menu's box growing to it with the parent menu visible
  behind it, as UIKit's menu does? This is look and feel; today the sub-menu's
  rows replace the parent's (FR34). (`owner decision`)
