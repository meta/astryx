# Gestures

A gesture recognizer system with UIKit's semantics, for the touch
presentations of Astryx core components. It is internal to
`@astryxdesign/core`: components import it from `../gestures`, and nothing
here is exported from the package entry.

UIKit is the reference throughout: the same recognizer states, the same
conflict rules, the same thresholds (from `../motion/uikit/gestures.ts`, each
one sourced or marked as a guess awaiting measurement), and touch handling
that behaves like `UIControl` and `UIScrollView`. The rest of this page says
where the web forces a difference.

## Using it from a component

```tsx
import {useRef} from 'react';
import {PanGestureRecognizer, useGestureRecognizer} from '../gestures';

function Sheet() {
  const ref = useRef<HTMLDivElement>(null);
  useGestureRecognizer(
    ref,
    () => new PanGestureRecognizer({direction: 'down'}),
    pan => {
      // Runs inside the input event: write the transform, render nothing.
      const element = ref.current;
      if (element == null) return;
      if (pan.state === 'ended') {
        settle(element, pan.translation().y, pan.velocity().y);
      } else {
        element.style.transform = `translateY(${pan.translation().y}px)`;
      }
    },
  );
  return <div ref={ref}>…</div>;
}
```

- The recognizer is created once per component and keeps its identity, so
  relationships set up when it is created (`requireToFail`,
  `recognizeSimultaneouslyWith`) keep working.
- The listener is read through a ref. Passing a new function on each render
  attaches nothing new, and a gesture never causes a React render.
- The recognizer attaches in a layout effect, so the element's `touch-action`
  is set before the browser can see a finger.
- `usePressTracker(ref, options)` gives an element `UIControl` touch tracking
  (see below).

Outside React, `getGestureHost(document).attach(element, recognizer)` does
the same and returns a detach function.

## Recognizers

| Recognizer                       | UIKit                              | Kind       | Notes                                                                                                                                                                                                 |
| -------------------------------- | ---------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TapGestureRecognizer`           | `UITapGestureRecognizer`           | discrete   | `numberOfTapsRequired`, `numberOfTouchesRequired`; fails past 45 px of travel, on extra fingers, a hold over 1.5 s, a late or far next tap                                                            |
| `LongPressGestureRecognizer`     | `UILongPressGestureRecognizer`     | continuous | `minimumPressDuration` 500 ms, `allowableMovement` 10 px (a distance, not per axis), `numberOfTapsRequired`; a zero duration begins on the touch itself (a selection tracker over a group of actions) |
| `PanGestureRecognizer`           | `UIPanGestureRecognizer`           | continuous | min/max touches, `direction` (axis or one-way) with `axisRatio`, `lockAxis`, `scrollEdge`, `scrollHandoff`; `translation()`, `totalTranslation()`, `velocity()`                                       |
| `SwipeGestureRecognizer`         | `UISwipeGestureRecognizer`         | discrete   | recognized during the motion; one or more directions, `numberOfTouchesRequired`; 50 px along, at most 50 px across, 500 ms                                                                            |
| `PinchGestureRecognizer`         | `UIPinchGestureRecognizer`         | continuous | `scale` (settable, to re-base it), `velocity` in scale per second, `focalPoint()`                                                                                                                     |
| `RotationGestureRecognizer`      | `UIRotationGestureRecognizer`      | continuous | `rotation` in radians, unwrapped, clockwise positive; `velocity` in rad/s                                                                                                                             |
| `ScreenEdgePanGestureRecognizer` | `UIScreenEdgePanGestureRecognizer` | continuous | `edges` including `leading` / `trailing` (resolved against the writing direction); fails as soon as the touch lands outside                                                                           |
| `HoverGestureRecognizer`         | `UIHoverGestureRecognizer`         | continuous | a mouse or a hovering pen; silent for fingers                                                                                                                                                         |

Every recognizer also has UIKit's switches: `isEnabled` (use `setEnabled`;
turning it off mid-gesture cancels), `cancelsTouchesInView` (default true),
`delaysTouchesBegan` (default false), `delaysTouchesEnded` (default true),
`allowedPointerTypes`, and `requiresExclusiveTouchType`.

### What the pan reports

The pan reads its numbers the way `UIPanGestureRecognizer` does, as measured
in the UIKit lab:

- It begins once the centroid has moved `hysteresis` (10 px) along either
  axis, not as a distance.
- `translation()` leaves out the travel the threshold took: a slow drag reads
  zero when the pan begins, and a step that overshoots keeps only the
  overshoot. A dragged surface does not jump. `totalTranslation()` is the
  movement since the fingers landed, for a surface that wants it.
- `axisRatio` (for a pan limited to an axis): the movement along the axis
  must exceed `axisRatio` times the movement across it to begin; movement
  across that exceeds the movement along it fails the pan; in between it
  waits.
- `velocity()` is UIKit's own filter (see Velocity). The lift updates
  neither number.

### States

```
possible ─► began ─► changed* ─► ended | cancelled     continuous
possible ─► ended                                       discrete ("recognized")
possible ─► failed
```

Listeners (UIKit's target-action) run for `began`, `changed`, `ended` and
`cancelled`. `addTransitionListener` also reports `failed` and the return to
`possible`. A recognizer in a terminal state ignores the touches it still
holds and returns to `possible` when all of them have ended.

## Conflicts: the arena

A new touch goes to every recognizer on its hit path, innermost first, and
each one that accepts it tracks it until it ends. Then:

- **Exclusivity.** Two recognizers that share a touch are never active
  together unless one allows it (`recognizeSimultaneouslyWith`, or the
  `shouldRecognizeSimultaneously` delegate). The first to recognize fails
  the other possible ones. A recognizer that tries to begin while a
  conflicting one is active fails instead. When two qualify on the same
  input, the innermost one wins.
- **Failure requirements.** `a.requireToFail(b)` keeps `a` in `possible`
  until `b` fails, then lets `a` recognize. If `b` recognizes, `a` fails. A
  recognizer that is not involved in the current touches holds nothing up.
  The delegates `shouldRequireFailureOf` and `shouldBeRequiredToFailBy`
  express the same thing dynamically.
- **Delegates.** `shouldBegin`, `shouldReceiveTouch`, and `canPrevent` /
  `canBePrevented` on subclasses.

```ts
// Single tap waits for the double tap to fail, as in UIKit.
single.requireToFail(double);

// Inner horizontal scroller yields to the back-swipe in the edge band only:
// the edge pan fails at touch-down anywhere else, so nothing waits.
innerPan.requireToFail(edgePan);
```

## Touches in the view: `PressTracker`

A pressable control's view-level touch handling, with `UIControl`
semantics:

- `touchDown`, `touchDragInside` / `touchDragOutside`, `touchDragEnter` /
  `touchDragExit`, `touchUpInside` / `touchUpOutside`, `touchCancel`.
- "Inside" is the control's bounds expanded by `trackingExpansion`, so a
  fingertip that slides a little off a button is still on it.
- The highlight comes on in the same frame. Inside a scroller it waits
  `contentTouchDelay` (`UIScrollView.delaysContentTouches`), so a flick
  paints nothing. A tap quicker than that delay shows the highlight at the
  lift for `quickTapFlash`.
- A recognizer that takes the touch (`cancelsTouchesInView`), or the browser
  taking it to scroll, cancels the press with no release.
- `UIControl`'s iOS 6 rule applies: an ancestor's single-finger single tap
  does not beat the control's own action for a touch on it.
  `vetoesAncestorRecognizer` replaces that rule (a slider vetoes a pan along
  its track).

The browser's click stays the control's activation, so keyboard and
assistive-technology activation keep working.

### Press profiles

`PRESS_PROFILES` holds the two ways UIKit tracks a press:

- `control` (a button, a switch): the highlight comes on in the same frame
  outside a scroller, the finger is tracked 70 pt beyond the bounds, and
  the release takes UIButton's 0.25 s;
- `cell` (a table or collection row, always in a scroll view in UIKit): the
  highlight always waits the content-touch delay, travel past the pan
  hysteresis cancels the press for good, a quicker tap highlights at the
  lift straight into the release, and the release takes the list's
  deselect clock.

`paintPress(element, 'on' | 'held' | 'fading' | 'none', {releaseMs})` is
the one writer of `data-astryx-press`. It owns the release timer and writes
only over values the caller may replace (by default none, `on` and
`fading`), so a `held` row survives presses until its owner releases it
with `onlyFrom: ['held']`.

### Rows and cards: delegated press tracking

A list of a thousand rows cannot pay for a hook and four listeners per row.
`installPressAttribute(document)` (or the `usePressAttribute()` hook) finds
the innermost `[data-astryx-pressable]` under each landing touch and creates
one `PressTracker` for that touch alone. It paints the press on the element:
`data-astryx-press="on"` while pressed, `"fading"` for the release, removed
at once on a cancel; the marker's value picks the profile (empty or
`control`, `cell`). A disabled element takes the press and paints nothing.
A touch that brakes a list the finger set moving paints nothing. A value the
consumer did not write (a row kept `held` through a navigation push) is
never overwritten or cleared. Installs are counted per attribute, so every
component can call the hook.

## What the browser is told

- **`touch-action`.** Each element gets the intersection of what its
  recognizers leave the browser. It is set inline on attach and restored on
  detach (opt out with `manageStyle: false`):

  | Recognizers on the element                         | `touch-action`      |
  | -------------------------------------------------- | ------------------- |
  | tap, long press                                    | `manipulation`      |
  | horizontal pan or swipe, horizontal edge pan       | `pan-y pinch-zoom`  |
  | vertical pan or swipe                              | `pan-x pinch-zoom`  |
  | one-way pan, pan with `scrollEdge`/`scrollHandoff` | left as is (`auto`) |
  | free pan                                           | `pinch-zoom`        |
  | pinch or rotation                                  | `pan-x pan-y`       |
  | pinch or rotation together with a free pan         | `none`              |

  A one-way pan leaves the browser its own axis too: a toast dragged away
  from its edge scrolls the page. It claims its direction by cancelling
  `touchmove` when it begins.

  `pinch-zoom` stays in the value unless a pinch or rotation recognizer is
  attached, so the page stays zoomable (WCAG 1.4.4). A long press also turns
  off the iOS callout and text selection on its element.

- **Claiming.** When a recognizer recognizes, it owns its touches. Each
  element with a recognizer that can claim a moving touch (a pan, a swipe, a
  long press that then drags, a pinch, a rotation) has a non-passive
  `touchmove` listener that cancels the event only while one of its touches
  is owned. A touch nobody owns scrolls exactly as it would without the
  system. Taps claim only at the lift, so an element with only taps, or only
  a press consumer, gets no such listener (see the known limit below).
- **Early claim.** A one-way pan over content the browser could scroll (an
  overlay such as a toast or a banner) cancels its touch's moves once the
  finger has gone 5 px its way (`claimDistance`), before WebKit claims a
  slow drag at 10–11 px; it still begins at 10 px with UIKit's translation.
  Safari gives the page no scroll for a touch once one of its moves was
  cancelled, so from then on the touch is the pan's: a reversal no longer
  fails it, and it begins whichever way the finger goes. That is UIKit's
  outcome too, where a drag that starts on an overlay never reaches the
  content behind it. A `scrollEdge` pan (a sheet over its own content)
  claims at its begin instead, as UIKit gives a reversed drag to the
  content.
  Measured in Mobile Safari (iOS 26.2): `touchmove` arrives from the first
  pixel; on a scrollable element WebKit commits to scrolling at 10 to 11 px
  (the last cancelable `touchmove` at 10 px), and cancelling every
  `touchmove` from 8 px keeps the page still for the whole gesture. Under
  `pan-y` it scrolls only drags steeper than about 2:1 to 3:1, once the
  vertical travel reaches about 10 px. A pan that competes with native
  scrolling therefore decides at 10 px or less (the toast's swipe decides at
  8).
- **The browser's claim.** `pointercancel` on a finger, or a scroll above
  the touch, means the browser took the finger; so does its first `touchmove`
  that can no longer be cancelled, when the browser could pan along the
  finger's main axis. (Chromium also stops asking after one unconsumed
  `touchmove` when `touch-action` keeps it from panning that way, as for a
  horizontal drag under `pan-y`; that is not a claim.) Possible recognizers that share it fail, active ones are
  cancelled, and the view's press is cancelled. The exception is a pan with
  `scrollHandoff`, which keeps watching.
- **Clicks.** When a touch's gesture cancelled the view's touches, its
  `touchend` is cancelled (no click and no compatibility mouse events) and a
  one-shot guard swallows the next trusted click. A click held back for a
  recognizer that may still recognize (a double tap between taps) is
  swallowed at once and replayed on the original target if the recognizer
  fails. Clicks with `detail === 0` (keyboard, assistive technology, code)
  always pass.
- **Context menus.** A `contextmenu` while a recognizer owns a touch is
  cancelled, so a long press never also opens the browser's menu.
- **Focus.** Losing window focus or hiding the page cancels every touch in
  flight, as UIKit does when the app resigns active.

### Native scrolling

`scrollEdge` and `scrollHandoff` make a pan share its axis with the native
scrollers under the finger. This is the sheet over its own list:

- With `scrollEdge`, the pan begins only if nothing under the touch could
  scroll for that movement: the finger landed at the edge and pulls away
  from it. The browser has not committed yet, so beginning claims the touch
  and the content never moves.
- With `scrollHandoff` (one-way directions only), once the browser has taken
  the touch to scroll, the pan keeps watching. When the content runs out in
  the pan's direction, the travel past that point becomes the pan, after
  `contentEndHandoffSlop`. The point is placed from the distance the content
  had left, not at the next sample. If the finger comes back, the
  translation clamps at zero while the content scrolls again. This is NOT
  UIKit: a UIKit sheet decides when the drag begins, and a drag that began
  as a scroll stays the scroll view's for its whole length (it scrolls to
  the top, then rubber-bands). For parity use `scrollEdge` alone.

"Could scroll" follows the browser's own rules: `touch-action` between the
touch and each scroller, scroll chaining stopped by `overscroll-behavior`,
and RTL `scrollLeft` ranges.

### Multiple fingers

A second finger never breaks a one-finger pan that is already moving: the
pan ignores it, and the claim keeps the browser from zooming with it. A
second finger that lands before any recognizer has claimed fails the
one-finger recognizers, so the two fingers zoom the page.

## Time

Every input carries its own timestamp (`event.timeStamp`), and timers are
deadlines on that same clock. Before an input is processed, every timer due
by its timestamp runs first, at its own deadline. A long press therefore
begins at exactly touch-down + 500 ms even when the main thread was blocked
and the timer callback ran late. Tests drive the whole system with explicit
timestamps and no real time.

## Velocity

`VelocityTracker` reports px per second, UIKit's unit. Strategies:

- `uikit` (default): `UIPanGestureRecognizer.velocity(in:)` itself, measured.
  Each event's instantaneous velocity is the position change over the
  timestamp change since the previous event (the touch-down counts as the
  first), and the velocity is 0.2 times the newest one plus 0.8 times the
  one before. It reproduces every value UIKit reported on six recorded touch
  streams. Like UIKit's, it reacts a frame late to an acceleration, includes
  a hold before the first move, and never decays: a finger at rest sends no
  events, so a release after a pause reports the last moving value. Feed it
  one sample per event.
- `lsq2`: least-squares quadratic fit over the last 100 ms (at most 20
  samples), as Android's and Flutter's trackers do. Smoother; not UIKit.
- `iosFling`: Flutter's approximation of what an iOS scroll view hands its
  deceleration (weights 0.6 / 0.35 / 0.05 on the last three pair
  velocities).
- `window`: the two-point average over 100 ms that BottomSheet used.

## Haptics

`playHaptic(kind)` vibrates where `navigator.vibrate` exists, with one
pattern per UIKit feedback kind. iOS Safari has no vibration API. It plays a
light impact only when a real tap toggles an `<input type="checkbox"
switch>`, and WebKit requires a trusted event for it. `attachTapHaptic(label)`
puts a hidden switch inside a label the control renders as its tap target,
so every real tap on it plays that impact. Nothing can play a haptic later
from script, so mid-drag haptics (detent snaps, picker ticks) are not
possible in iOS Safari.

## Thresholds

All numbers live in `../motion/uikit/gestures.ts`. Each one carries either
its source (Apple documentation, or a measurement: the recognizers' own
values read in a UIKit app on the iOS 26.2 simulator and confirmed with
touches, or Mobile Safari measured on the same simulator) or a guess
together with the measurement that will replace it. A unit test fails if an
entry has neither.

## Touch presentation

Whether a component presents itself the touch (UIKit) way is answered once,
in `../utils/touchPresentation.ts`:

- touch behaviours (this system, the press model, UIKit springs and
  timings) key on a coarse PRIMARY pointer (`TOUCH_QUERY`);
- layout behaviours key on a compact viewport, narrower than 744 px or
  shorter than 500 px (`COMPACT_QUERY`), the closest a size can get to
  UIKit's compact size class (a Max-size iPhone in landscape is its one
  known miss);
- a presentation that needs both, a sheet in place of a popover, asks for
  both (`COMPACT_TOUCH_QUERY`).

Styles switch on the same conditions by writing the same query as a StyleX
media key (`'@media (pointer: coarse)'`, and the compact-touch query spelled
exactly as `COMPACT_TOUCH_QUERY`, which a test enforces), so the first paint
is right. Behaviour reads
`useTouchPresentation()` (SSR-safe), a decision taken once reads
`readTouchPresentation()`, and a component with no interaction to infer
from reads `useMotionPresentation()`: UIKit timings under a finger, theme
tokens under a mouse.

## Known limits

- **A scroll that begins on a recognizer waits for a busy main thread.** In
  Mobile Safari (iOS 26.2, measured), a vertical scroll that starts on an
  element with a non-passive `touchmove` listener waits until the current
  JavaScript task ends; on a plain row, a pressable row or a tap-only
  element it starts at once (within 50 ms) even during a 500 ms task.
  Chromium documents the same rule for non-passive listeners. The listener
  stays because nothing else keeps UIKit's arbitration: with a passive
  listener, or one added during `touchstart` (which Safari ignores for that
  touch), Safari hands every diagonal drag on a swipe row to the list's
  scroll, 3:1 included. It is never worse than UIKit, where a busy main
  thread stalls every scroll.
- **Lists where every row has a horizontal recognizer** (swipe actions on
  every row of a mail list): every scroll start waits on the current task in
  Safari. Keep list screens' tasks short. A native horizontal `scroll-snap`
  reveal inside the row would never wait, but it tracks with scroll physics
  rather than UIKit's measured tracking spring; it is a possible opt-in, not
  the default.
- **A jitter on an overlay keeps the touch.** A finger that moves 5 px or
  more in a one-way overlay's direction and then drags the other way moves
  the overlay, not the page behind it, for that touch (UIKit's outcome, and
  Safari would not scroll the page after a cancelled move anyway).
- **Follow-up:** Chromium keeps 3:1 to 1.5:1 drags as swipes even with a
  passive listener (its `touch-action` filter drops a `pan-y` scroll that
  starts sideways), so a passive listener there would cost no parity. It
  waits on a measured run on Android before any engine-specific choice.

## Where the web differs from UIKit

- Once a recognizer owns a touch, the browser cannot take the scroll back
  later in the same gesture. UIKit does not either: it decides between a
  sheet and its list when the drag begins.
- In Chromium a finger's first `touchmove` arrives only after about 16 px.
  Movement below that comes from the finger's pointer events, but the
  browser's own decision to scroll happens at that first `touchmove`.
  Mobile Safari delivers `touchmove` from the first pixel.
- A tap that holds a plain `<button>` for a second or more gets no click in
  Mobile Safari, while UIKit's tap allows 1.5 s. A tap recognizer on the
  element follows UIKit.
- iOS Safari's own back swipe at the left edge cannot be cancelled by the
  page. A leading-edge pan works where that swipe has no history to go back
  to.
- `translation()` is in client CSS px. It is not converted into a rotated or
  scaled ancestor's coordinate space.
- A replayed click is untrusted. Anything that needs real user activation
  inside the replay window (opening a file picker, for example) should not
  sit under a multi-tap recognizer.

## Tests

- `__tests__/<Recognizer>.test.ts`: each recognizer's state machine on
  synthetic touches with explicit timestamps.
- `__tests__/arena*.test.ts`: the conflict matrix, delivery to the view,
  click dispositions, cancellation, and multiple fingers.
- `__tests__/GestureHost.test.ts`: the DOM integration through real
  listeners in jsdom.
- `__tests__/VelocityTracker.test.ts`: UIKit's filter against the velocities
  UIKit reported on recorded touch streams, and each strategy against the
  true velocity.
- `__tests__/delegatedPress.test.ts`: delegated press tracking.
- `__tests__/haptics.test.ts`: vibration patterns and the hidden switch.
- `__tests__/browser/`: the browser proof on a phone-sized touch screen, in
  Chromium (CDP touches with timestamps) and WebKit (its own touch input).
  Run it with
  `pnpm exec playwright test --config packages/core/src/gestures/__tests__/browser/playwright.config.ts`;
  where WebKit cannot launch on the host, its project runs in the official
  Playwright image (see the config header). The same fixture passed in
  Mobile Safari on the iOS 26.2 simulator: claims, click suppression, scroll
  handoff, pinch, and a long press at exactly 500 ms.
