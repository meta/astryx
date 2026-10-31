# Gestures

A gesture recognizer system with UIKit's semantics, for the touch
presentations of Astryx core components. Components import it from
`../gestures`; nothing here is exported from the package.

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
  is set before the browser can see a finger. It follows the element behind
  the ref: a node rendered after mount, or swapped behind the same ref (a
  trigger rendered `as` another element), is attached at that commit.
- `isEnabled: false` mid-gesture ends the gesture without calling the
  listener, since the handler that turned it off owns that end (no consumer
  callback from an Effect). A handler that wants UIKit's `.cancelled` calls
  `recognizer.setEnabled(false)` itself, which reports it at once. A
  recognizer that required it to fail (a single tap waiting on a double
  tap) resolves just after that render, and its listener reports as usual;
  so does one waiting on a recognizer whose node a render replaced. After
  unmount the listener hears nothing, not even the cancellation of a
  gesture the unmount ended.
- `actionGroup: true` attaches the element as an action group, sibling
  actions a held pointer slides across (`family:action-groups` FR5), served
  like every attachment, for every pointer. Changing it attaches the
  element again.
- `usePressTracker(ref, options)` gives an element `UIControl` touch tracking
  (see below). It follows its element the same way, takes `isBraking` (by
  default the host's: a touch that stops a flick presses nothing), and keeps
  one tracker for the component's life: it reads `trackingExpansion`,
  `highlightDelay`, `cancelTravel` and `quickTapFlash` (and the ref itself)
  as they are now, so a change, even mid-press, never drops the press in
  progress. Unmounting or losing its element calls neither
  `onHighlightChange` nor `onControlEvent`, and neither does disabling the
  control under a finger: the press ends, so the handler that disables it
  clears its own highlight.
- `useFingerScroll(scroller)`, an internal piece of the touch module with
  no public API (not in the gestures barrel; a scroll-driven component
  imports its module, so it ships only where used), returns a reader, `true` while the scroller's scroll is a finger's: from a scroll
  while a finger that landed inside it is down, until its `scrollend` (the
  momentum is still the finger's), or, where the browser fires none (mobile
  Safari before 26), until its scroll events go quiet. Pass a ref, or the
  document for the page. Outside React, `watchFingerScrolls(host, scroller)` and
  `isFingerScroll(host, scroller)` from `fingerScroll.ts` do the same; that
  module adds passive scroll listeners only while something is watched.

Outside React, `getGestureHost(document).attach(element, recognizer)` does
the same and returns a detach function. `getGestureHost(document).fingersDown()`
is how many fingers are on the screen (the last touch event's `touches`,
wherever they landed): a recognizer that must not begin under a second
finger checks it in `shouldBegin`, so two fingers stay the browser's pinch.
Once a drag has claimed its finger, a second finger never breaks it.

## Recognizers

| Recognizer                       | UIKit                              | Kind       | Notes                                                                                                                                                                                                              |
| -------------------------------- | ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TapGestureRecognizer`           | `UITapGestureRecognizer`           | discrete   | `numberOfTapsRequired`, `numberOfTouchesRequired`; fails past 45 px of travel, on extra fingers, a hold over 1.5 s, a late or far next tap                                                                         |
| `LongPressGestureRecognizer`     | `UILongPressGestureRecognizer`     | continuous | `minimumPressDuration` 500 ms, `allowableMovement` 10 px (a distance, not per axis), `numberOfTapsRequired`; a zero duration begins on the touch itself (a selection tracker over a group of actions)              |
| `PanGestureRecognizer`           | `UIPanGestureRecognizer`           | continuous | min/max touches, `direction` (axis or one-way) with `axisRatio`, `lockAxis`, `scrollEdge`; `translation()`, `totalTranslation()`, `velocity()`, `scrollVelocity()`                                                 |
| `SwipeGestureRecognizer`         | `UISwipeGestureRecognizer`         | discrete   | recognized during the motion; one or more directions, `numberOfTouchesRequired`; 50 px along, at most 50 px across, 500 ms                                                                                         |
| `PinchGestureRecognizer`         | `UIPinchGestureRecognizer`         | continuous | `scale` (settable, to re-base it), `velocity` in scale per second, `focalPoint()`                                                                                                                                  |
| `ScreenEdgePanGestureRecognizer` | `UIScreenEdgePanGestureRecognizer` | continuous | `edges`: `leading` / `trailing`, resolved against the view's writing direction; attached to an edge zone the view lies within; fails as soon as the touch lands outside every requested edge band; a finger's only |

A recognizer created with `claimsTouches: false` is a watcher (a tab bar
that minimizes while the page scrolls): it never claims, so its element gets
only passive listeners and a scroll never waits for it; it prevents no other
recognizer and none prevents it; and it follows a touch the browser takes
for a scroll to the lift. It adds nothing to the element's derived
`touch-action`.

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
  neither number; a finger that rested past the stillness interval releases
  at 0.

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
  `canBePrevented` on subclasses. The arena's plumbing (touch delivery,
  approved transitions, a pending recognition) is `protected`: a subclass
  overrides the `touches*` handlers and sets `state`, and only the gesture
  system drives the rest.

```ts
// Single tap waits for the double tap to fail, as in UIKit.
single.requireToFail(double);

// Inner horizontal scroller yields to the back-swipe in the edge band only:
// the edge pan fails at touch-down anywhere else, so nothing waits.
innerPan.requireToFail(edgePan);
```

## Touches in the view: `createPressTracker`

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
  the release takes the list's deselect clock, as every surface's does
  until a control runs its own (UIButton's 0.25 s);
- `cell` (a table or collection row): the highlight waits the content-touch
  delay inside a scroll view and comes on at once outside one
  (`spec:AST-094` FR11), travel past the pan hysteresis cancels the press for
  good, a quicker tap highlights at the lift straight into the release, and
  the release takes the list's deselect clock.

The document press controller (`utils/pressFeedback.ts`) writes
`data-astryx-press` for the presses it tracks, and the action-group tracker
(`hooks/actionGroupTracker.ts`) writes its groups' presses itself.

### Rows and cards

A list of a thousand rows cannot pay for a hook and four listeners per row.
The document press controller (`utils/pressFeedback.ts`) presses the
innermost enabled `[data-astryx-pressable]` under each touch and paints it,
with no listener per row; a touch that brakes a scroll the finger set moving
presses nothing.

## What the browser is told

- **Pens.** A pen drives every recognizer and press tracker as a finger
  does: it pans, taps and long-presses; its hold, where the hold does
  something, keeps text unselected as a finger's does (FR41); its barrel button is a
  context click and starts no press; a pinch never mixes a pen with a
  finger; and the screen-edge pan, a finger's only, ignores it (FR43).
- **For every pointer.** Recognizers and press trackers attach for a mouse,
  a pen and a finger alike (`spec:AST-094` FR43, FR19). Where the primary
  pointer is coarse (`TOUCH_QUERY`, `../utils/coarsePointer.ts`), the host
  listens while something enabled could take a touch. Where it is fine, each
  element that uses a gesture keeps one passive `pointerdown` listener (and
  a recognizer that claims a moving finger its blocking `touchmove`, which
  FR24 counts outside that budget, FR19) and the page has none: a press on the element (a mouse's primary button, a
  pen, or a finger, whose `pointerdown` comes before its `touchstart`)
  adds the host's document and window listeners, and they go once that
  press's contacts end and the arena has decided them (a tap that waits on
  a double tap goes when that wait ends), or when the window blurs during it
  (FR24). After the last detach the host holds nothing: no listener, note,
  frame or timer. A press
  tracker created with `keepsTouch` gets its blocking `touchmove` only
  during such a press; where the pointer is coarse it keeps it, since
  Safari honours a blocking listener only when it was registered before
  the touch. A component that uses no gesture, and a
  disabled recognizer or consumer, registers nothing; after a consumer's
  `isEnabled()` changes, `host.update(element)` re-syncs. The screen-edge
  pan stays off under a mouse, a trackpad and a pen (its recognizer allows
  touches only; it takes no `allowedPointerTypes`), and a pinch
  never mixes a pen with a finger (a recognizer takes one kind of pointer
  at a time) (FR43). A press tracker takes a mouse press as a press, with
  the fine-pointer profile: it paints at once, inside a scroller too, and
  the scroll brake is a finger's only (FR11, DEC-21). A right click, a pen's
  barrel button and a ctrl-click on macOS (its context click) start no press
  (`isPrimaryClick`, `../utils/primaryClick.ts`). The host follows the
  query (a tablet docking or undocking a mouse): turning fine cancels every
  touch in flight. `perEventPointer`, an option of `attach`,
  `attachConsumer`, `useGestureRecognizer` and `usePressTracker` from
  before FR43, is accepted and does nothing.
- **`touch-action`.** Each element gets the intersection of what its
  recognizers leave the browser, never wider than the element's own
  `touch-action` (`spec:AST-094` FR18). Over an inline value the host writes
  what both allow, inline. Otherwise it marks the element
  (`data-astryx-touch-action`) under a rule in the first cascade layer, which
  any author rule outranks, and in the next frame writes inline what both
  allow where that is narrower than the author's rule. Detaching gives the
  element its own value back (opt out with `manageStyle: false`):

  | Recognizers on the element                        | `touch-action`      |
  | ------------------------------------------------- | ------------------- |
  | tap, long press                                   | `manipulation`      |
  | horizontal pan or swipe                           | `pan-y pinch-zoom`  |
  | horizontal edge pan on a strip within its band    | `pan-y pinch-zoom`  |
  | vertical pan or swipe                             | `pan-x pinch-zoom`  |
  | one-way pan, pan with `scrollEdge`                | left as is (`auto`) |
  | edge pan on a view wider than its band            | left as is (`auto`) |
  | free pan                                          | `pinch-zoom`        |
  | pinch                                             | `pan-x pan-y`       |
  | pinch together with a free pan                    | `none`              |
  | a watcher (`claimsTouches: false`), any direction | left as is (`auto`) |

  A one-way pan leaves the browser its own axis too: a toast dragged away
  from its edge scrolls the page. It claims its direction by cancelling
  `touchmove` when it begins.

  `pinch-zoom` stays in the value unless a pinch recognizer is
  attached, so the page stays zoomable (WCAG 1.4.4). A long press with a
  hold also turns off the iOS callout and text selection on its element for
  its press; one at 0 ms (a touch-down detector) or given
  `selectionLock: null` leaves them to the browser.

  While a finger or a pen is down, the host turns them off too only where
  the hold does something (`spec:AST-094` FR41): on the element of a
  recognizer created with a `selectionLock` (pass `lockSelection`; a
  slider's thumb, a segmented
  control's or a switch's drag) that would take the touch (enabled, and
  accepting its pointer), restored when the contact ends. The host calls
  the recognizer's lock and never imports one, so a component with no such
  hold does not bundle it. A press tracker created with a `selectionLock`
  (a control whose own record defines a hold action, such as a stepper's
  hold-repeat) gets the same for each press. A press-tracked
  control or row whose hold does nothing, and the document press
  controller's surfaces (`usePressFeedback` rows), keep the browser's
  long-press selection; a tap never selects. A non-text input under the finger inside such an element (a checkbox, a radio, a switch's input) is locked too: WebKit's own stylesheet makes every input selectable, which no ancestor's lock reaches. A text field keeps its selection, since a held finger places its caret. A
  finger or a pen takes the lock under any primary pointer, a touchscreen
  laptop and a desktop pen tablet included; a mouse never does, so mouse
  selection is unchanged (`spec:AST-017` FR59); content under a sheet's or a
  pager's pan stays selectable.

- **Claiming.** When a recognizer recognizes, it owns its touches. Each
  element with a recognizer that can claim a moving touch (a pan, a swipe, a
  long press that then drags, a pinch) has a non-passive
  `touchmove` listener that cancels the event only while one of its touches
  is owned. A touch nobody owns scrolls exactly as it would without the
  system. Taps claim only at the lift, and a recognizer that never claims
  (`claimsTouches` false, such as a pull that only watches the scroll) never
  owns a touch, so an element with only those, or only a press consumer,
  gets no such listener (see the known limit below). A press tracker created
  with `keepsTouch: true` (opt-in, for a continuous-tracking control such
  as a held stepper; never plain buttons, links, cards or list cells) gets
  one: once its press is delivered its finger's moves are cancelled, so the
  browser's pan never takes the held control (UIKit's
  `touchesShouldCancel(in:)` is false for a tracking control). Its element
  also gets `touch-action: manipulation`, for every pointer, as a tap
  recognizer's does (`spec:AST-094` FR18), so taps in quick succession
  never zoom. Where the primary pointer is fine the blocking listener comes
  only with a press: the element keeps its one `pointerdown` listener
  (FR24), the press adds the `touchmove` before its `touchstart`, and the
  kept finger's moves are cancelled from then on, as on a phone (FR11,
  DEC-21). A scroll that starts on such a control waits on the main
  thread; a move before the press is delivered still scrolls. The listener the host
  adds to a finger's target at touch-down, for a target that leaves the
  document mid-gesture, is passive too unless a recognizer on that touch can
  claim while it moves.
- **Claim at the begin.** A pan claims its touch only as it begins, at
  UIKit's 10 pt (`spec:AST-094` FR19), before WebKit commits a slow drag to
  a scroll at 10–11 px; a drag the browser took first stays the browser's
  (FR14). One exception: a `scrollEdge` pan cancels its finger's moves from
  the first one while every scroller under the finger is at its edge and
  the finger pulls away from it, the pan's own way (the browser could only
  rubber-band there); it still begins at 10 pt. It holds only while that is
  the one finger on the screen: with a second down anywhere, the moves stay
  the browser's, for its pinch (FR10).
  Measured in Mobile Safari (iOS 26.2): `touchmove` arrives from the first
  pixel; on a scrollable element WebKit commits to scrolling at 10 to 11 px
  (the last cancelable `touchmove` at 10 px), and cancelling every
  `touchmove` from 8 px keeps the page still for the whole gesture. Under
  `pan-y` it scrolls only drags steeper than about 2:1 to 3:1, once the
  vertical travel reaches about 10 px. A pan that competes with native
  scrolling therefore decides at 10 px or less.
- **The browser's claim.** `pointercancel` on a finger, or a scroll above
  the touch once the finger has travelled the slop (the browser starts a pan
  no earlier), means the browser took the finger; a scroll under a finger
  that has not moved (scrollIntoView, a transcript pinned to its end, scroll
  anchoring) is the page's own and leaves the press and its click alone. So
  does its first `touchmove`
  that can no longer be cancelled, when the browser could pan along the
  finger's main axis. (Chromium also stops asking after one unconsumed
  `touchmove` when `touch-action` keeps it from panning that way, as for a
  horizontal drag under `pan-y`; that is not a claim.) Possible recognizers that share it fail, active ones are
  cancelled, and the view's press is cancelled.
- **Clicks.** When a touch's gesture cancelled the view's touches, its
  `touchend` is cancelled (no click and no compatibility mouse events) and
  the shared click guard (`utils/clickGuard.ts`, the menu press model's
  too) swallows the browser's next click, until the next `pointerdown` or
  400 ms. A click held back for a
  recognizer that may still recognize (a double tap between taps) is
  swallowed at once and replayed on the original target if the recognizer
  fails. Clicks with `detail === 0` (keyboard, assistive technology, code)
  always pass.
- **Context menus.** A `contextmenu` while a recognizer owns a touch is
  cancelled, so a long press never also opens the browser's menu.
- **Focus.** Losing window focus or hiding the page cancels every touch in
  flight, as UIKit does when the app resigns active.

### Native scrolling

`scrollEdge` makes a pan share its axis with the native scrollers under the
finger. This is the sheet over its own list: the pan begins only if nothing
under the touch could scroll for that movement, the finger landed at the
edge and pulls away from it. The browser has not committed yet, so beginning
claims the touch and the content never moves. From the first move that
pulls away from such an edge the pan already holds the finger, so its moves
are cancelled before it begins and the page does not rubber-band either.

Who gets a drag is decided once, when it begins, as in UIKit: a drag that
began as a scroll stays the scroll view's for its whole length (it scrolls
to the top, then rubber-bands), and never changes hands midway
(`spec:AST-094` FR14).

"Could scroll" follows the browser's own rules: `touch-action` between the
touch and each scroller, scroll chaining stopped by `overscroll-behavior`,
and RTL `scrollLeft` ranges, along the flat tree (content slotted into a
shadow-tree scroller scrolls with it, as the hit path does).

### The input stream

The host listens through `utils/inputStream.ts`, which it shares with the
press feedback controller: one native listener per event type, on the
window's capture phase, fanned out to every subscriber in order. It runs
ahead of any document listener, so an app's window-capture
`stopPropagation`, or a document-capture `stopImmediatePropagation`
registered before core, no longer hides a touch from either, as UIKit's
recognizers see touches before views do. A recognizer that must claim
mid-gesture still needs the touch to reach its element, where its blocking
`touchmove` sits, below such a stop. The stream stays ahead of an app's own
window-capture listener only until a type's listener is re-added (a
passivity switch, or a subscription after its last subscriber left), which
appends it after the app's. A type's listener is passive unless a
subscriber cancels it: the host cancels `touchend` and `contextmenu` there
while a claiming participant is attached, never a `touchstart` or a
`touchmove`, and the click guard (`../utils/clickGuard.ts`) keeps a
cancelling `click` while it is armed, and from the menu press model's first
arm on. A blocking `touchmove` sits on a claiming
element and on a claimed touch's target, on the document while an element a
claiming recognizer lives in is moving (Touches on moving elements), or on
the window only while a page hold is held, so a page of pressables blocks
no scroll.

### Holding the page still

A scroll lock may hold the page with `holdPageScroll(document, decide)` from
`pageHold.ts`, which returns the release (none does yet: `useScrollLock`
does not call it). It lives in its own module, so a page without a scroll
lock never ships it, and it imports nothing of the gesture host: it asks the
document's host whether a recognizer owns a touch only if a host exists, and
a document without one has no recognizer to own it. A hold reads the
primary pointer as it starts. Where it is coarse it listens at once, since
Safari honours a blocking listener only when it was registered before the
touch, and the first drag after an overlay opens is the one a hold is for;
where it is fine it registers no touch listener until the input stream's
`pointerdown` sees a touch or pen contact. Either way the hold follows the
pointer from then on. While any hold is active, and only
where the primary pointer is coarse, the input stream listens with a
non-passive `touchmove`; where the contact's `touchstart` came before its
`pointerdown`, the finger is named at its first move. Once per one-finger touch that no
recognizer owns, after the
finger clears a 5 px slop (under WebKit's 10–11 px scroll claim), it asks
`decide(origin, dx, dy)` whether that pan would scroll the page, `origin`
being the innermost node under the finger (the composed path's first node),
and cancels the touch's moves for its whole length if so. A second finger is
never cancelled, so pinch-zoom keeps working. With no hold, the listener is
gone and every touch scrolls as without the system.

### Multiple fingers

A drag a recognizer has claimed keeps its finger: a second finger never
cancels or redirects it (`spec:AST-094` FR10), as in UIKit, where a pan
ignores touches beyond its maximum. Before any claim, a second finger landing
anywhere (often on a plain row no recognizer is on) fails a pan limited to
one finger, so the two fingers zoom the page (WCAG 1.4.4) instead of the pan
claiming them midway.

## Time

Every input carries its own timestamp (`event.timeStamp`), and timers are
deadlines on that same clock. Before an input is processed, every timer due
by its timestamp runs first, at its own deadline. A long press therefore
begins at exactly touch-down + 500 ms even when the main thread was blocked
and the timer callback ran late. Tests drive the whole system with explicit
timestamps and no real time.

## Velocity

`VelocityTracker` reports px per second, UIKit's unit, and is the one
velocity tracker every continuous recognizer uses
(`architecture:interaction-modality` INV10, `spec:AST-100` FR1, FR2; no
alternative estimators). One filter, iOS's measured blend, updated on each
moved sample (a sample at the newest position is not motion):

- A pan's velocity is 0.2 times the newest interval's velocity plus 0.8 times
  the previous interval's (an interval runs from one moved sample to the
  next; the touch-down counts as the first). With one interval so far it is
  that interval, as UIKit reports it. It reproduces every value UIKit
  reported on six recorded touch streams, and like UIKit's it reacts a frame
  late to an acceleration.
- A scrolling surface's release (paging, a wheel) is 0.25 times the newest
  pan value plus 0.75 times the previous one: a pan's `scrollVelocity()`.
  Everything else reads `velocity()`.

A release reads 0 when the finger stayed still for longer than the stillness
interval (`UIKIT_GESTURES.velocity.stillness`) before lifting, the one
difference from iOS, whose filter never decays and so flings after a rest;
and 0 with fewer than two moved samples. The pan passes its lift's event time
to the tracker.

Times are the events' own. A finger the browser reports on both pointer and
touch events is sampled from its pointer events alone (from its touch events
once the browser cancels its pointer), so the two copies of one move never
both count.

## Haptics

`playHaptic(kind)` vibrates where `navigator.vibrate` exists, with one
pattern per UIKit feedback kind. iOS Safari has no vibration API. It plays a
light impact only when a real tap toggles an `<input type="checkbox"
switch>`, and WebKit requires a trusted event for it. `attachTapHaptic(label)`
puts a hidden switch inside a label the control renders as its tap target,
so every real tap on it plays that impact; focus the activation gives the
switch goes straight back. A label tied to its control by `for`, or whose
control is itself a switch, gets no switch; a label wrapping its own control
gets one, which hands each tap on to that control. Nothing can play a haptic later
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

- touch behaviours (UIKit springs and timings, the press model's touch
  profiles) key on a coarse PRIMARY pointer (`TOUCH_QUERY`); gestures
  themselves attach for every pointer (What the browser is told);
- layout behaviours key on a compact viewport, below the theme's `md`
  width point (`spec:AST-012` FR9): `COMPACT_QUERY` spells the default
  points for a style, and behaviour reads the active theme's definition, so
  a theme that moves `md` moves compact with it;
- a presentation that needs both, a sheet in place of a popover, asks for
  both (`COMPACT_TOUCH_QUERY`).

Styles switch on the same conditions by writing the same query as a StyleX
media key (`'@media (pointer: coarse)'`, and the compact-touch query spelled
exactly as `COMPACT_TOUCH_QUERY`, which a test enforces), so the first paint
is right. Behaviour reads
`useTouchPresentation()` (SSR-safe), a component with no interaction to
infer from included (UIKit timings under a finger, its own motion under a
mouse), and a decision taken once reads `readTouchPresentation()`.

## Migrating a raw-touch drag

A component that listens to touches itself moves onto the recognizers this
way:

1. No window or document touch listeners: attach a recognizer with
   `useGestureRecognizer` and read `translation()` and `velocity()` per
   state. The host owns the page-wide listeners.
2. Pick the reading: a drag that coasts like a scroll view (a wheel, a
   picker, a pager, a carousel) releases with the pan's `scrollVelocity()`;
   anything else with `velocity()`. A one-way drag sets `direction`. The host derives
   `touch-action`, so delete a hand-written one.
3. Native scrolling: a sheet over its own list uses `scrollEdge`, not
   `scrollTop` checks; who gets a drag is decided once, when it begins
   (`spec:AST-094` FR14).
4. A behavior that only watches the person's scrolling uses a watcher
   (`claimsTouches: false`) and `useFingerScroll`.
5. A scroll lock holds the page with `holdPageScroll`; no `preventDefault`
   of its own.
6. A drag limited to one finger sets `maximumNumberOfTouches: 1`. Before
   it claims, a second finger fails it; once claimed, it keeps its finger
   (`spec:AST-094` FR10). Delete a local pinch yield.
7. The release hands `velocity()` (px/s, event time) to the animator.
   Delete local estimators, sample buffers and time windows; a flick, fling
   or commit threshold stays in the component, compared against it.
8. A control whose hold acts (a slider's thumb, a stepper's hold-repeat)
   passes `selectionLock: lockSelection` to its recognizer or press tracker
   (`spec:AST-094` FR41); content drags keep selection.
9. Presses use `usePressTracker`; `keepsTouch: true` only for a control that
   tracks a held finger across its own area.
10. Unit tests drive the gesture harness (`__tests__/harness.ts`) with
    timestamped touches; interaction specs use real touch input, never
    synthetic DOM events.

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
- **Follow-up:** Chromium keeps 3:1 to 1.5:1 drags as swipes even with a
  passive listener (its `touch-action` filter drops a `pan-y` scroll that
  starts sideways), so a passive listener there would cost no parity. It
  waits on a measured run on Android before any engine-specific choice.

## Touches on moving elements

iOS WebKit hit-tests an element that a compositor animation moves where
the animation started: it keeps the transform it resolved when the
animation went to the compositor, so event targets, `elementFromPoint` and
`getBoundingClientRect` stay there for the whole curve, though the inline
style holds the value the curve starts from and the computed style is live
(iOS 26.2, measured; Chromium and Linux WebKit hit what is drawn). A finger on a settling sheet
lands on whatever sat under the sheet's start (an upward release can hit
the scrim and close the sheet). UIKit keeps an interruptible animation
hit-testable where it is drawn (UIViewPropertyAnimator).

A style write on the element makes WebKit resolve the transform again, to
the value drawn at that moment, where it stays. So on iOS WebKit, at
touch-down, the host has every element the animator reports as moving
(`motion/presentation.ts`) resolved with one custom-property write, then
asks the engine what is under the finger: the touch goes to what is drawn
there, with z-order and `pointer-events` as the engine sees them. Press
trackers take their bounds from `presentedRect`, the reported box moved by
the motion since. A retargeted tap cancels the engine's click,
which would hit the start position, and clicks what it touched; the
click guard drops a late engine click, so the tap acts once. Safari honours a
blocking `touchmove` only where it was registered before the touch began,
on the engine's own target, which for a moving element is whatever sits
under its start: so while an element a claiming recognizer lives in is
moving, the document carries the blocking listener, and a scroll starting
anywhere waits on the main thread only for that long. Not covered:
scale and rotate (a zoom transition, a lifted preview is hit at its
unscaled box) and CSS transitions or animations the animator did not start.

This is an engine workaround (`spec:AST-013` FR6). Its review condition:
re-measure on each iOS release, and remove the correction once iOS WebKit
hit-tests a compositor-moved element where it is drawn. Its regression
fixture is `__tests__/presentedHitTesting.test.ts`.

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
- iOS Safari's own back swipe from the screen edge cannot be cancelled by
  the page. A leading-edge pan works where that swipe has no history to go
  back to.
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
- `__tests__/VelocityTracker.test.ts`: the filter against the velocities
  UIKit reported on recorded touch streams, a steady speed and a hard
  acceleration.
- `__tests__/haptics.test.ts`: vibration patterns and the hidden switch.
- `__tests__/importGraph.test.ts`: a gesture-only component's static
  imports (`useGestureRecognizer`, the pan recognizers, the host) reach
  neither the press tracker nor haptics, which live behind
  `usePressTracker` and `attachTapHaptic` / `playHaptic`.
- `__tests__/useFingerScroll.test.tsx`: a finger's scroll until its
  `scrollend`, the page through the document, and the ref's node followed.
- `__tests__/browser/`: the browser proof on a phone-sized touch screen, in
  Chromium (CDP touches with timestamps) and WebKit (its own touch input),
  with mouse and pen input in a fine-pointer context, run by
  `pnpm test:interaction gestures.interaction.browser.spec.ts` and in CI's
  interaction proofs; where WebKit cannot launch on the host,
  `internal/interaction-harness/scripts/webkit-container.mjs` runs its
  project in the official Playwright image. The same fixture passed in
  Mobile Safari on the iOS 26.2 simulator: claims, click suppression, the
  scroll edge, pinch, and a long press at exactly 500 ms.
