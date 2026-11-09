# Pointer streams

What real browsers delivered for one moving contact, as the page saw it.
`VelocityTracker.streams.test.ts` replays them (spec:AST-100 FR4).

| Files                                  | Browser                                              | Pointer           | Input                                                         |
| -------------------------------------- | ---------------------------------------------------- | ----------------- | ------------------------------------------------------------- |
| `android-chromium-*`                   | Chromium 158 on an Android 15 emulator               | touch             | 120 Hz through a uinput touchscreen                           |
| `android-firefox-*`                    | Firefox 158 on the same emulator                     | touch             | the same                                                      |
| `ios-safari-*`                         | Safari 26.2 on an iOS 26.2 simulator (iPhone 17 Pro) | touch             | HID through idb, about one move every 30 ms                   |
| `desktop-chromium-{mouse,pen,touch}-*` | headless Chromium 149                                | mouse, pen, touch | CDP input at 120 Hz, each event stamped at its scheduled time |

Each source has three gestures:

- `slow`: 200 px down at 200 px/s, lifted while moving;
- `fling`: 300 px down at 2,000 px/s, lifted while moving;
- `stop-release`: 200 px in 400 ms, then still for 300 ms (longer than the
  40 ms stillness interval), then lifted.

On iOS the simulator paces the moves itself, so its recordings differ: Safari
delivered 194 px at 183.5 px/s for the slow drag, 240 px at 2,400 px/s for the
fling, and the stop-then-release's moves over about 2.2 s before its still
300 ms. Each fixture's `injected.speed` is what Safari delivered.

## Format (schema 1)

- `events`: `[type, t, x, y]` for each pointer and touch event, with `t` in ms
  after the pointerdown's `timeStamp` and `x`, `y` in CSS px from where the
  contact went down. A `pointermove` adds its `getCoalescedEvents()` samples
  (`[t, x, y]` each) and its `getPredictedEvents()` count.
- `injected`: the ground truth. `speed` is px/s along y while the contact
  moved; a source injected at a set rate also has its `hz` and `points`.
- `release`: where the replay releases (`pointerup`, or `lastMove` with a
  `note` saying why) and, for a stream whose release misses the injected
  speed by more than 10%, `check: "shape"`: it is not velocity evidence, and
  only its direction and axis are checked.
- `caveat`: what the input is not (below).

## Caveat

Rig input is synthetic, not a finger: Android injects at 120 Hz through a
uinput touchscreen and desktop through CDP, each through the browser's real
input pipeline; iOS input is HID through idb on a leased simulator, which
delivers a move every ~30 ms (not 120 Hz), so iOS speeds are the distance
Safari delivered between the first and last moving pointermove, over that time.
A physical finger's 120–240 Hz jittered sampling is not reproduced.

## What the replay feeds

Each `pointermove` event's own position and time, one sample per event, as
`PanGestureRecognizer` reads them (it does not read `getCoalescedEvents()`).
The coalesced samples are the input the browser received: the replay also
models a busy main thread from them, one event per four input samples at the
latest of them, as a browser coalesces input while its handlers run late.

## What the streams show

- Chromium on Android coalesces one to three samples into each `pointermove`
  at 120 Hz input; Firefox dispatches about 60 a second, each with a one-entry
  coalesced list.
- For CDP-dispatched input, desktop Chromium returns an empty
  `getCoalescedEvents()` list, so the busy-thread replay uses the events
  themselves.
- Safari on the simulator merged two moves that arrived in one frame into a
  single `pointermove` whose coalesced list had one entry (one 120 px step).
- idb lifts 58–85 ms after the last move, longer than the stillness interval,
  so the iOS slow drag and fling release at their last move. The simulator
  delivers their steps 29–44 ms apart, and against the speed Safari delivered
  each misses 10% on one of its two releases: the slow
  drag's pan reads 22.9% under (its scroll 2.3% over), the fling's scroll
  12.2% under (its pan 7.2% under, from six samples). Neither is velocity
  evidence; both are checked for direction and axis only.
- iOS input at 120 Hz would need XCTest's own event synthesis
  (`press(forDuration:thenDragTo:withVelocity:thenHoldForDuration:)`), which
  these streams do not use.

## Capturing a stream

`capture.html` records one contact: open it in the browser, drive one gesture
over it, and read the record from `window.__streams` (or have the page post
it with `?post=probe` or `?post=beacon`). A fixture is that record plus the
injected ground truth and the fields above.
