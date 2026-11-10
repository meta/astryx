# @astryxdesign/interaction-harness

Playwright instruments for touch interaction and animation proofs: real touch
input, frame evidence, curve sampling and storyboards. **Internal and
unpublished.** Specs live next to their component as
`*.interaction.browser.spec.ts` and run under
[`playwright.interaction.config.ts`](../../playwright.interaction.config.ts) on
a phone-sized touch screen (402 × 714 CSS px page, 402 × 874 screen, 3 device
pixels per CSS px, touch, mobile viewport rules), in Chromium and WebKit.
An accessibility spec (`*.a11y.browser.spec.ts`, under
[`playwright.config.ts`](../../playwright.config.ts)) may use the animation
holds and the timer gate too, to check a state an animation passes through.

The exemplar to copy is
[`BottomSheetDetent.interaction.browser.spec.ts`](../../packages/core/src/BottomSheet/__tests__/BottomSheetDetent.interaction.browser.spec.ts).
The harness proves its own instruments in
[`src/harness.interaction.browser.spec.ts`](src/harness.interaction.browser.spec.ts).
The busy-main-thread proof and the rendering-trace counts have a negative
control beside their positive checks (a rAF animation that freezes under a
blocked main thread, a `top` animation that lays out every frame); other
self-tests check an instrument against a known answer.

## Running

```sh
pnpm storybook:build                      # the specs read stories from the built Storybook
pnpm exec playwright install chromium webkit
pnpm test:interaction --project chromium  # everything, Chromium
pnpm test:interaction BottomSheetDetent   # one spec, both engines
pnpm storyboards                          # only the tests tagged @storyboard
```

On Linux distributions whose system libraries are older than Playwright's
WebKit build needs, run the WebKit project inside the official Playwright
image (podman or docker; the repository is mounted at the same path, and
under a rootful docker daemon the container runs as your user so its
`test-results/` stay yours):

```sh
node internal/interaction-harness/scripts/webkit-container.mjs [playwright test args…]
```

WebKit composites through Mesa's software GL there, which compiles each shader
the first time a page draws it (450–700 ms for the first frame of a blurred or
newly animated layer). The script keeps Mesa's shader cache on the host
(`~/.cache/astryx-webkit-shaders/<image>`, or `ASTRYX_WEBKIT_SHADER_CACHE`), so
only the first run on a machine pays for them.

With `CI` set, the script gives the container the four CPUs of CI's WebKit
runners as a quota, and llvmpipe as many threads. `ASTRYX_WEBKIT_CPUS` sets
another count. On Linux the container runs only on the CPUs the script may use,
so `taskset` limits it too.

Evidence (storyboards, curve traces) is written to
`test-results/interaction-evidence/` (override with
`ASTRYX_INTERACTION_EVIDENCE`) and attached to the test report. It is never
committed: a pull request links or attaches it.

## Instruments

| Module          | What it gives a spec                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts.ts`    | Touch scripts as data: `tap`, `drag` (hold, rest), `flick` (exact final-move speed, velocity profiles), `holdThenDrag`, `pinch`, `rotate`, `path`, `merge` (a second finger mid-gesture), `releaseVelocity`, `toTouchEvents`.                                                                                                                                                     |
| `touch.ts`      | `touchDriver(page).play(script)`: the script as real engine input. `installInputLog` / `readInputLog`: what the page received.                                                                                                                                                                                                                                                    |
| `frames.ts`     | `startScreencast` (timestamped composited frames), `markElement` (a marker chip or outline), `trackMarker` (marker box per frame), `trackMarkers` (several colors from one decode of each frame, each in its own region if it has one), `sampleRects` (per-rAF rects), `frameStats`, `requireFrames`.                                                                             |
| `busy.ts`       | `blockMainThread(page, ms)`, which returns the window it held and the span its loop measured, and `busyWindowProof(tracked, window)`: frames presented, frames that moved, longest stall, a verdict; `presented` adds the compositor's own frames.                                                                                                                                |
| `brightness.ts` | `trackBrightness(page, frames, {x, y})`: a colour channel's mean in a square per frame, as a scalar on `box.x`, for a busy-window proof of a fade or a dim.                                                                                                                                                                                                                       |
| `webInput.ts`   | `webInputDriver(page)`: `wheel({x, y, dx, dy, ctrl})` and `pen(points)` as real engine input, for proofs across pointers (`spec:AST-100` FR4); `wheel` resolves once the page has the step; read back through the input log.                                                                                                                                                      |
| `trace.ts`      | `traceRendering(page, body)`: main-thread counts of UpdateLayoutTree / Layout / PrePaint / Paint / Layerize / UpdateLayer / ScrollLayer / HitTest, `countBetween`, long tasks; `installLongTaskLog` / `readLongTasks`; `startCompositorTrace`: when the compositor presents.                                                                                                      |
| `curves.ts`     | `holdAnimations`, `armHold`, `seekAnimations`, `sampleCurve` (presented transform / opacity at any t), `waitForAnimation`, `watchAnimations`, `waitForRest`, `settlesAt` (a computed value reached and every animation inside finished, on `waitForRest`'s deadline), `releaseAnimations`, `releaseAnimationLog` (frees what the recorder kept, before a heap or listener count). |
| `math.ts`       | Oracles independent of the code under test: `cubicBezier`, `timingFunction`, `springStep` (SwiftUI response / dampingFraction, initial velocity), `projectDecay`, `rubberBand`, `parseTransform`, `compareCurve`, `timeline`.                                                                                                                                                     |
| `storyboard.ts` | `animationStoryboard` (seek to t = 0, 16.7, 33.3 … ms), `touchStoryboard` (a frame per scripted event), `castStoryboard` (real screencast frames): PNG contact sheet + JSON trace.                                                                                                                                                                                                |
| `output.ts`     | `evidenceDir`, `writeEvidence`: where evidence goes and how it is attached to the report.                                                                                                                                                                                                                                                                                         |
| `story.ts`      | `phone`, `withStorybook`, `openStory`, `frames`, and the timer gate (`installTimerGate`, `freezeTimers`, `thawTimers`).                                                                                                                                                                                                                                                           |
| `pointer.ts`    | `newFinePointerPage(browser)`: a page under a mouse that really reads `(pointer: fine)`. `assertFinePointer` / `assertCoarsePointer`: fail before a case's checks when the page reads the other pointer.                                                                                                                                                                          |

## A fine pointer

Every interaction project is the touch phone, and a context a test makes with
`browser.newContext()` inherits it: it reads `(pointer: coarse)` unless it
passes `hasTouch: false`. A case that shows touch work costs nothing under a
mouse opens its page with `newFinePointerPage(browser)`, which turns touch and
mobile off and checks the pointer first. A case that builds its own context
calls `assertFinePointer(page)` before its checks.

## The proofs

**Real touch.** Untrusted DOM events are not input: they start no native
scroll, claim no gesture, and read `isTrusted: false`. Chromium input goes
through CDP `Input.dispatchTouchEvent` with an explicit timestamp per event: the
page's `event.timeStamp` is the scripted time to 0.1 ms, whatever the
dispatch latency, and the events go through the compositor's gesture detection
(native scrolling, flings with velocity from those timestamps, `touch-action`,
`pointercancel`). WebKit input goes through the engine's own input command; see
the limits below. Read positions a frame after a move: Chromium delivers
`pointermove` aligned to animation frames.

**Stories, not Storybook.** `openStory` turns Storybook's highlight module off
on every page it opens, and checks that its root element is absent. Left on,
the module observes `#storybook-root` and, on every insertion, reads the
computed style of every element on the page inside the inserting task (117
reads and two forced style recalculations for one exit copy in a Button story),
so a proof would measure Storybook as well as the component.
`openStory(page, origin, id, args, {storybookHighlight: true})` keeps it on.

**Curve sampling.** Pause every running animation (CSS transitions and
animations are Web Animations too), seek to a time, read `getComputedStyle`:
the presented value at that exact time, independent of frame timing. Finished
animations, ones the page paused and ones on a scroll or view timeline are left
alone; held animations keep their offsets from the first hold's earliest start, and release
resumes only them. A hold sent from the test reaches the page after a round
trip, and on a loaded runner a short animation can end first: for one that an
action starts, `await armHold(page, scope, {judges})` before the action arms the page
itself: it looks on every frame and every 4 ms between frames (WebKit can go
about 70 ms without a frame while it first composites a layer),
holds everything running under the scope as soon as one of them runs (or
`count` of them, for parts that start apart; with `newOnly`, only what starts
after the arm, for a turn that starts mid-motion), and `held()` after the
action returns that held set. Other animations under the scope (a press, a
colour change) can meet that count before the motion a test judges starts,
and a hold that took only them proves nothing about it. So every armed hold
names the motion it judges, `{judges: {target, property}}` (a list for
several; `pseudoElement` for a `::before` or `::after`), and `held()` rejects
when the hold took no animation of it. A judged run that the page cancels after
the hold (a later style change retargets a CSS transition) fails the next
`seekAnimations` or `sampleCurve` by name: a read would show a run that the
hold did not take. A hold whose scope is not on the page within 5 s fails by
name too. `judges: 'count-only'` checks nothing:
it marks a call site whose hold does not take its judged motion yet.
A hold sent from the test (`holdAnimations`, and `animationStoryboard`
without `held`) takes the same `judges` and rejects the same way: it takes
what runs when it reaches the page, and on a busy runner the judged motion
can still be to come or already over.
Compare it with an
oracle from `math.ts` through `compareCurve`; a tolerance states the error
budget (for a spring baked into `linear()` stops of `h` ms, chords err by up to
`h² / 8 · |x''|`). A seek past an animation's end lands half a millisecond
inside it, the last frame it presents, and the sample says so (`presentedAt`,
where oracles are read). An animation whose keyframes end in a run of
identical values (an end value held so a later interruption can read it)
ends where that run starts: `curveEndMs`, `waitForAnimation`'s interval and
the default storyboard times stop there, and `waitForRest`, which judges the
presented `transform`, `translate`, `rotate`, `scale` and `opacity` rather
than `playState`, does not wait the hold out. That holds for an animation that
plays forward under a linear or cubic-bézier effect easing (the time the run
starts is solved from the curve); under any other effect easing (steps,
`linear()` stops, an overshoot) or another direction the curve is read to its
full end, and `waitForRest` waits the hold out. An animation reversed before it starts (`reverse()`
on a new animation, a negative playback rate from the start) is reported by
`waitForAnimation` from when it started, but `holdAnimations` refuses it:
seeking and sampling run a curve forward. The recorder keeps one entry per
`Animation` object, so one reversed or replayed mid-run is misread: a watch
taken before the reversal rejects, and an unwatched wait returns at once with
a curve dated before it. Take a fresh animation for each run a proof reads.
`sampleCurve(locator, times, {pseudoElement: '::before'})` samples the
element's `::before` or `::after` instead: its presented values, labelled by
that pseudo-element's own animations.

**Waiting for an animation.** The page records every animation from the first
call into `curves.ts` on it (and on every later document): a frame loop on the
page's own `requestAnimationFrame`, the CSS animation and transition events,
and `Element.animate` as it is called, pending animations included. So
`waitForAnimation` also reports one that started after the last
`waitForRest`, `waitForAnimation` or `watchAnimations` and has already finished (`finishedAt`
set): a short entrance no longer races the first look on a cold page. A run
that the page cancels while it plays ended there, with no finish event. Core's
motion animator retires each run with `cancel()` once its curve ends. The
recorder dates such a run at the cancel, and a wait reports it once it
presented `minProgressMs`. When the action may be the page's first contact
with the harness, take `watchAnimations(locator)` before it and read
`watch.started()` after.

**Busy main thread.** Mark the element, start the screencast, start the
animation, wait until it runs (`waitForAnimation`: an animation cannot start
while the thread is held), block the main thread for 1 s (`spec:AST-094`
FR5's verification row), stop. Always
start the gesture or animation first and block mid-flight, never before:
in headless Chromium a touch that starts while the main thread is busy does
not scroll or start a gesture even with only passive listeners (the input
waits for the main thread). Tracking a finger under a busy main thread is
therefore proven on the iOS simulator, not here. The
screencast is captured off the main thread, so a compositor animation shows a
new position every frame of the block, and a main-thread animation shows none
(nothing changed, so no frame is sent at all: `busyWindowProof` counts the
whole window as one stall). `settledWithin` (2 px) stops judging at the easing
tail: the screencast rounds to whole pixels, so a tail that still moves shows
plateaus within a pixel or two of rest. `settledWithinSteps` counts that bound
in the cast's own position steps, read from the cast (`castStep`, from the
`step` `trackMarker` gives each frame of the default marker; a control tracked
by another color carries none, and `castStep` refuses it): 1 px in Chromium's PNG cast and 2 px in
WebKit's JPEG cast, whose 4:2:0 chroma holds the marker's color in 2 by 2
pixel blocks and so makes the tail's plateaus longer. Two steps stop at the
same tail in either engine while a freeze further from rest is still judged.

Motion slower than two whole pixels a frame needs a finer read. In Chromium,
`trackMarker(page, frames, {subpixel: true})` reads the marker under a pixel
from its anti-aliased edges: a 10 px slide over 60 frames read 0.164 to 0.169
px a frame, where it moves 0.167 px, and a box at rest between pixels read the
same value on every frame. Each frame then carries `SUBPIXEL_STEP_PX`
(0.05 px) as its step, and the proof counts a change from half of it. The
marker must be opaque on a plain background. Use the default chip marker: an
outline marker's window holds the element's own content. WebKit's JPEG cast
holds color in 2 by 2 pixel blocks, so the read throws there.

A judged part shorter than four of the
screencast's intervals fails: the animation under test was not moving during
the block. One that had already settled when the judged part began (nothing in
the window to judge) throws `BusyWindowTooLateError`, with the numbers: the
block ran too late, which is no reading of the component. The held animation
can also end inside the block. When it keeps no end value (`holds` false: no
held tail, and no fill the compositor honors; WebKit on Linux honors none)
and no settle bound applies, the judged part ends at its curve's end. Past it,
WebKit presents the value the main thread last committed, not the animation.
If that leaves the control fewer than four frames, where the uncut part held
enough, the block also began too late: `BusyWindowTooLateError`, with
`curveEndMs`. A starved run still throws `FrameStarvationError`. With
`during`, `blockMainThread` starts the loop from a task queued in the frame
that saw the animation, after that frame's rendering update: WebKit hands a
newly started animation to its compositor there, and a loop inside the rAF
callback would freeze even a compositor animation. Call it before the release
that starts a settle and await it after, so the page is already waiting when
the settle begins. An animation counts once it is no longer pending and has
run at least one frame: a `minProgressMs` under 16 is raised to 16, since one
created in the frame the page looks is not on the compositor yet. It counts
only before its curve's held tail (keyframes that end in a run of identical
values, read as `waitForRest` reads them): when the only animation running
there started while the page waited, or the wait times out with only such
animations, the page looked too late, and the wait rejects with
`BusyWindowTooLateError`. A wait that times out with no animation reads the
page's animation recorder too. A run that counts, began after the call and
before the wait, and has ended is the action's run: the page received the
action before the wait, as a late runner can deliver it. That also rejects
with `BusyWindowTooLateError`, with `startedBeforeWaitMs` and
`endedBeforeWaitMs`. A run that began before the call is an earlier action's,
and the wait still finds no start. The call's time maps onto the page's clock
through its time origin, with 5 ms of slack. A clock that slews further moves
that line, and only the error's name changes. `blockMainThread` starts the
recorder passive: the `animate()` wrapper and the CSS events log what starts,
with no frame loop and no document-wide read. The first call of `curves.ts`
adopts it as if it started then. With `pseudoElement` (`'::before'` or
`'::after'`), only that pseudo-element's animations on `during` itself count,
as `sampleCurve` reads them: a child's animation, such as a switch thumb's
press, does not start the block. With `property`, only animations that set
that property count, named as CSS names it (`translate`, `background-color`,
`--press-strength`), as a hold's judged motion names it. The animation must
also be the same one the page saw at its frame before:
a component can rebuild a running animation on its old clock, and the page sees
it running before the compositor shows a frame of it. The window names the
animation it caught (`animation`): when it started and where its curve ends.
These times are on the real clock, as the window's own are, after a page
freeze too. The page waits up to `TARGET_WAIT_MS` (5 s) for `during` to be on
the page. Past it, the wait fails by name: the element is gone, or it never
came. An element that leaves the page while the wait looks fails the wait at
once, with when it left.
The `verdict` judges the
frames the screencast delivered, whatever its rate (a loaded machine's can
deliver one frame in five or six), and tolerates nothing a frozen animation
does: at least one frame in the judged part, no stall longer than three of the
screencast's intervals (two dropped frames), and at least 90% of the frames it
delivered in the judged part presenting a new position (one miss is always
allowed; a frame it did not deliver is a gap, for the stall check, unless
it delivered fewer than four frames there: then the judged part's span counts
every frame, so one late frame is not "1 of 1 moved"). Pass
`maxMedianFrameMs` (20 at 60 Hz) only in a proof that claims display rate.
`verdict.failures` names each miss with its numbers, and `summary` carries the
raw numbers for the report. Frames are judged in presentation order: a loaded
machine can deliver them out of order. `castStoryboard` turns the frames of the
block into a filmstrip.

To read frames after a moment, such as the rest after a block, wait for them by
time: `waitForCastFrame(cast, {after, during})` returns once the cast holds a
frame presented after `after`, epoch ms on the page's clock. A frame that
arrives after that moment can still have been presented before it, so a count
of frames delivered is no such wait. `cast.lastFrameAt()` reads the latest
presentation time captured so far. Past 5 s with no such frame, the wait fails.
When no frame came for longer than `FRAME_STARVATION_MS`, it throws
`FrameStarvationError`: the screen did not change, or the page was starved of
frames. Keep something moving, such as `startBusyControl`, to tell them apart.
While frames still come, all presented before `after`, the error names both
times.

A just-started animation can reach the screen after the block began (50–100 ms
later in WebKit on a loaded machine). When the cast saw the element at rest
before the block (wait for `cast.frameCount()` to pass 0 before starting the
animation), judging starts at its first presented change: the judged part still
ends with the block (or the held curve, above) and still needs four intervals,
and `onScreenFromMs` and the
summary report when it came. So is an element that moved, then held from
before the block until its first presented change inside it: WebKit presents
a just-started compositor animation late (a sheet's release held on screen for
130 to 300 ms while its timeline ran), and its cast reaches Node about 0.7 s
late on a loaded runner, too late to wait on before blocking. Only a hold that
starts before the block, on two frames at least, at the position the page last
set before the block is excused. Pass that position as `setBeforeBlock`, such
as the drag's last position at the release. Without it, a block with `during`
takes the position on the cast's last frame before the caught animation's
start. Chromium on a loaded runner presents a just-started compositor
animation late too: a slider's coast first showed 25–111 ms after its start.
An animation frozen at the block's
start holds a position of its own, and is judged as a stall. Every frame after
its first change is judged, so a freeze later in the block still fails.
An element off screen before the block, such as a card that enters from an
edge, is judged from its first position inside the block. The cast's frames
before the block must show the screen without it. A main-thread entrance
shows no frame during the block, so it still fails. With no frame before the
block at all, nothing is known, and the block is judged from its start.
Any other element already moving is judged from the block's start. WebKit's
casts are 2 px quantized: their JPEG frames hold the
marker's color in 2 by 2 pixel chroma blocks (4:2:0, which the frame header
reports), so positions move in 2 CSS px steps (Chromium's in 1). With under two steps of
motion per frame, a frame delivered a few ms early shows no step and reads as
not moved. The proof reports `stepPx` and `pxPerFrame` and notes each stretch
that moves under two steps per frame, read over four frames at a time so a
slow tail inside a fast window shows, which never fails it. Move a proof's element at least two
steps a frame: the self-tests move 560 px in 1,600 ms, about 4.8 px a frame.

On a two-core runner the software compositor and the screencast share the core
the block spins on, so every compositor animation presents fewer frames there:
Lightbox's double-tap zoom, pinned to two cores, missed a display-rate bound in
7 of 10 runs while it moved on every frame the compositor presented. Judge such
a proof against a control instead of a rate: `startBusyControl(page)` shows a
small `CONTROL_RGB` box in the top layer (a manual popover, so above a modal
dialog opened before it; `raise()` after one opened later) whose transform
moves it along the top edge for as long as the page runs. A proof of a
dialog's backdrop mounts the control inside the dialog with
`startBusyControl(page, {within: dialog})`, a plain fixed box with no top-layer
entry: in WebKit, with the popover above BottomSheet's open modal dialog, the
sheet's dim held for 155 to 225 ms into a block while the control moved, and
inside the dialog it moves in step with the sheet. `waitForAnimation` and
`blockMainThread`'s `during` never count the control's own animation, so on
a dialog they still wait for the backdrop's. Track a top-layer control from
the same screencast with `trackControl(page, frames)`, which searches only the
top strip it crosses. To track the marker and the control from one decode of
each frame, pass both colors to `trackMarkers(page, frames, {colors:
[MARKER_RGB, controlColor()]})`: `controlColor()` carries the control's strip. A control mounted
`within` a dialog moves with it, so track that one with `trackMarker(page,
frames, {rgb: CONTROL_RGB})`, or track the marker and the control together
with `trackMarkers(page, frames, {colors: [MARKER_RGB, CONTROL_RGB]})`, which
decodes each frame once. A proof reads frames up to
`BUSY_PROOF_LOOKAROUND_MS` (250 ms) around its judged part, so a spec may
decode only those. Pass either as `control`: the component passes when it moved on every frame the control
moved and its longest stall is no longer than the control's. Both are read from
the same screencast frames, so a compositor animation misses none. A window in
which the control moved on fewer than four frames is under the floor. Under the
floor, a run with no component failure on the frames shown is too little to
judge: `busyWindowProof` throws `FrameStarvationError` instead of returning a
verdict. The error names the control's moves, the cast's frames in the window
and its longest gap. A component that missed a frame the control moved on, or
stalled longer than it, failed on frames the compositor presented, so the
verdict keeps that red. A run the machine starved, with no frame for longer
than `FRAME_STARVATION_MS`, throws either way. `maxMedianFrameMs` judges the
cast's pace, not the component, so under the floor it keeps no red.
A run of frames with no new position counts as
moved when the change that ends it is a single cast step: the component moves
under one step a frame there, as on an easing tail, which the cast cannot show
on every frame. Where it moved under two steps a frame over the frames just
before the run (a spring's slow tail inside a fast window), or across the run
itself (its catch-up over the frames it spans) where the curve slows faster
than those frames show, a frame delivered early can show no step too, so the change may carry the motion of every frame
the run held at that pace, to the nearest step. The run must also read as a
slowing curve, at most one frame longer than the component's run before it.
Under `settledWithinSteps`, a run under one cast step a frame may instead last
ceil(step ÷ travel) frames, whatever the run before it. The travel is the
slower moving pace around the run, never less than its own catch-up per frame.
The run also lasts at most one frame more than the pace into it allows:
ceil(step ÷ max(pace before, catch-up per frame)) + 1. A
freeze ends in a catch-up of more than that, a stall in a frame-counted animation is longer than its runs
before it, and a run that no change ends stays a miss. The component still has
to show a new position on at least four of the control's frames. The cast step (`stepPx`)
is read from the value's changes in the judged part, so a position the page
commits off the grid once the block ends does not shrink it.
A main-thread animation still fails: the control moves and it does not.
Each such run counts in the control read's `belowStep`. A proof that claims a
new position on every frame the control moved passes `judgeEveryFrame`. A frame
the cast's step explains is then too little to judge: `busyWindowProof` throws
`BusyFrameUnjudgedError` with each such frame, the component's move per frame
there and the cast's step. A verdict that fails anyway comes back as it is, so
a frozen or main-thread component stays a red on the component.

A window that caught an animation (`blockMainThread` with `during`) predicts
each frame instead, when two things hold. The proof passes both controls,
`ahead` included, so every frame has a time of its own. The engine is
Chromium. A geometry replay also needs the harness marker on the caught
element. Once the loop ends, the
page replays the element's geometry animations, paused, on a hidden copy of
its box. The copy is aligned to the element, and its box is read every 2 ms.
A fade or a pseudo-element replays one numeric channel. The tracked value at
rest and at the curve's end map that channel to a position. The proof dates
each frame on the controls' clock, from the controls' starts that the window
keeps. A frame predicted to move a full cast step since the last new position must
show one, so a hold ends once its moves add up to a step.
A frame predicted to move less is too little to judge, and so is a frame with
no control reading of its own. Each such frame is named in the proof's
`unjudged` list and in its summary. It counts neither as moved nor as missed,
and `judgeEveryFrame` throws for none. When too few judged frames are left,
the proof throws `FrameStarvationError`. Where a replay predicts, one the
proof cannot read throws `BusyPredictionError`: an ancestor moves too, or a
run composites onto another. A replay whose travel or first judged position
differs from the cast's by more than two steps or a tenth of the travel falls
back by name. So does a geometry window without the marker, a window without
`ahead` or in WebKit, and a window whose run left the element before the
replay. WebKit reads the element's box at the loop's end before its
animation's current time, so the replay cannot be aligned there. A window that falls back is judged exactly as without a
replay, and its notes say why. The proof gives its `judged` part in the
cast's stamps, so a spec selects frames by it as before.

`controlClock(control)` reads the compositor's own time in each frame off the
control's position, for a proof that judges motion against time, not against
the screencast's stamps. A loaded machine stamps frames late, and
`inPresentationOrder` can then put a frame after frames that came after it.
The clock takes the cycle origin that most frames agree with, so such a frame
moves only its own reading. A frame within 36 px of a turn gets no reading.
A proof that needs every frame read starts a second control after the first,
`startBusyControl(page, {ahead: true})`: an `AHEAD_CONTROL_RGB` box in the
strip below, half a leg (200 ms) ahead. Wherever the first control is near a
turn, the one ahead is mid-leg. Track it with `controlColor({ahead: true})` in
the same `trackMarkers` call, or with `trackControl(page, frames, {ahead:
true})`, and read it with its own `controlClock`. `startBusyControl`
resolves with each control's `start` on the page clock, where its own time
is zero. Keep the component's marker out of the top 28 px then.

In WebKit, a busy proof with a control judges every frame on the controls'
clock, not on the screencast's stamps. WebKit stamps the frame after a delivery
gap about 60 ms late. So `busyWindowProof` and `pooledBusyProof` date each
WebKit frame from the control's positions, the component's and the control's
alike. A frame with no reading keeps its stamp's distance from the nearest frame
whose stamp agrees with its reading. The dated frames keep the cast's order,
since the cast delivers them in the order they were drawn. The proof's `judged`
part stays on the cast's stamps, so a spec selects the judged part from its own
cast; frames the display-rate keep left out fall inside it too. A spec that
needs a frame's own time for another check reads it with `pageTimesOnControls`,
the readings the proof dates from. Without the control ahead, a late frame near
the first control's turn keeps its lateness. A proof that judges every frame
near a turn starts the control ahead too
(`startBusyControl(page, {ahead: true})`). It passes that control's frames as
`ahead`, per run in a pool; `controlStarts` is optional. A Chromium cast with
a control is dated the same way. Its cast stamps each frame as it arrives.
Under load, the stamps trail presentation unevenly: in a slider's coast, by a
median 4.6 ms and up to 38 ms. So the frame interval read from the stamps is
wrong, and a proof on them misreads a slow tail's pace. Two frames a whole
frame apart can even carry stamps 2 ms apart. Without the control ahead, such a
pair near the first control's turn keeps its stamps, as a late WebKit frame
there keeps its lateness. Only frames that carry their engine, as `trackMarker`
reads them, are dated. Frames a spec builds without it, and a cast with no
control, are judged on their stamps. On
WebKit's stamps, a late frame inside the judged part changes no verdict, since
the proof reads a slow curve's held frames as motion. At the part's start, it
shows a stall the control does not have: the false reds came from there.

A WebKit proof keeps one dated frame per display interval. A frame under one
interval after the last one kept is left out; the earlier one stays. WebKit's
compositor can draw two frames 6 to 9 ms apart, and a curve then shows no new
step between them. A frame with no reading always stays, since its time is a
neighbour's. A WebKit cast rarely shows two frames one interval apart. So
the proof judges motion on every kept frame the control moved, but no 30 Hz
cadence. Its summary says so in a note, with the count of pairs one interval
apart. Chromium's cast judges that cadence.

An animation that lasts a fraction of a second, such as a 0.2 s fade, leaves a
block only a few frames to judge: in WebKit, or on a loaded machine, the control
can present fewer than four, and one run cannot decide. Play it several times
and judge the runs pooled (`pooledBusyProof(runs)`, each run with its own
tracked frames, control and window): the control must move on at least four
frames over all the runs, the component on every one of them, and in each run
its longest stall may be no longer than that run's control's, since a stall
belongs to its run. A run whose control moved on fewer frames than
`minRunFrames` (1 by default) is too little to judge: the summary names it,
and the pool leaves it out, so it never counts as a pass. A run whose block
began too late for its motion is left out the same way: its `runs` entry
is null, and `late` holds its `BusyWindowTooLateError`. The pool reads each
run without the starvation throw. With fewer than `minJudgedRuns` judged runs
(half of all the runs, rounded up), or a control that moved on fewer than four
frames over them, the pool is under the floor. Under the floor, a pool with no
component failure on the frames shown is too little to judge, and it throws
`FrameStarvationError`. A pool left short of judged runs by a run that began
too late fails instead, and so does a pool whose judged runs show a component
red. In each judged run,
the component must move on every frame its control moved on, so a freeze fails
its run.

On a loaded machine Chromium's screencast can skip frames the compositor
still presents. `startCompositorTrace(page)`, started with the screencast and
stopped after the block, records when the compositor presented each frame
(`Display::FrameDisplayed`); pass it as `presented`. The record is
browser-wide (its frames carry no page identity), so it throws when another
page is open as it starts or stops, or opened while it ran. A gap between two moved
frames with nothing delivered inside it is then measured between the
compositor's own frames: the frames it presented there count as presented
(`recorderSkipped`, in the summary), and a gap it did not present through is
a stall as before. A gap that opens or closes the judged part, or holds a
delivered frame that did not move, is judged from the screencast, so a
frozen element fails whatever else the compositor draws (a rAF animation's
block presents no compositor frame at all). With the record, the 90% counts the
compositor's frames from the first to the last moved frame; the gaps before and
after are the stall check's. WebKit has no such trace:
`stop()` resolves to `[]` and the screencast is judged alone.

**Too few frames.** A proof that samples the page every frame (`sampleRects`,
or a rAF trace of its own) takes its frames through `requireFrames(samples,
{min, during, where})`. It returns the samples that `where` selects when there
are at least `min` of them. A loaded machine, or a long task on the page, can
starve the page of frames. When no frame came for longer than
`FRAME_STARVATION_MS` (50 ms) around the selected samples, the proof fails
with `FrameStarvationError`, which names the frames drawn and the longest gap.
So a run that cannot prove anything still fails, and says why. With too few frames on pace, the motion did not last that
long, and the error says that instead.
`waitForRest` fails the same way when it cannot tell. The element held still
in its last frame, or no frame came after the deadline, and no frame came for
longer than `FRAME_STARVATION_MS`: it throws `FrameStarvationError`, not
"still moving". The same holds when the frame past the deadline shows motion
after such a gap, since the element may have stopped unseen in it. The error
then gives the last move. It also holds when the still frames begin just after
such a gap and are too few at the deadline. An animation whose curve outlasts the
gap is still moving, and says so.

**No Layout / Paint.** `traceRendering` records a Chromium trace around the
interaction; `countBetween` counts the steady middle of an animation (its
first and last frames may commit). A transform/opacity animation does no
Layout or Paint there; a layout-property animation does one per frame. Each
counted `Paint` names the node it painted (`node`), and each `UpdateLayoutTree`
counts the elements it restyled (`elements`). A proof that expects no Layout
can explain one: `traceRendering(page, body, {keepEvents: true})` keeps the
window's main-thread events, and `layoutSources` names the task that ran each
Layout and each invalidation before it. The
harness's own animation recorder stands down while the trace runs, since its
frame loop would make every frame a main-thread one, restyling each running
animation's target and laying out an anchored one: it reads only the element a
CSS animation or transition event names, once, when that animation starts, and
catches up afterwards. A CSS run's end event reads nothing then either: the
recorder keeps the end and dates the run once the trace ends. The frame it
requested before the trace runs before the start mark, so the whole window
counts none of its work. A `waitForRest`
awaited inside the traced body stands
down too: it waits on timers for the scheduled ends of the element's curves
(looking `frames` times a frame apart before settling on none, so an
animation the action starts a frame or two later is waited for) and polls no
style until the trace ends (in the anchored fixture's steady middle,
24 Layouts before, 0 now). Its one read of the element's animations, as it is
called, restyles the element (2 Layouts and 2 style recalculations in the
anchored fixture when called 200 ms into its animation), so await it right
after the action that starts the motion, before the window a proof counts. So do `waitForAnimation` and a watch's
`started()`: they take the element's animations from the recorder's log,
judge a started one by its own times, and reach the element through a handle,
since each `locator.evaluate` makes a main-thread frame (there too, 24
Layouts before, 0 now). That holds for script animations and CSS
transitions. On a CSS `@keyframes` animation (and, unwatched, a cancelled CSS
transition), `waitForAnimation` and `started()` read the animation's timing,
which flushes its style and adds Layouts to the trace: wait on one with
`waitForRest`, or after the trace. Taking a watch (`watchAnimations`) inside
a trace reads the watched element's animations, which restyles it (and lays
out an anchored one), so a proof takes its traced watch before the window it
counts. The trace's `longTasks` are the page's own: only a task the harness marked as its own read
(`waitForAnimation` describing keyframes, `blockMainThread` without `during`)
is in `devtoolsTasks` instead, and only when no page script ran inside it. A
test's own `page.evaluate` stays the page's own task, long or stretched,
whether it calls page code directly or sets it off. Each long task carries its wall time (`durationMs`)
and the main thread's own run time (`threadMs`, from the trace's thread
clock). A busy machine stretches the first but not the second, so a task is
long only when its thread ran longer than 50 ms: the page's own work. A task
only the wall clock stretched past 50 ms is in `stretchedTasks`, with both
times. A thread that waits (a synchronous request, `Atomics.wait`) gains wall
time but no thread time, so a claim about a blocking wait judges
`stretchedTasks` too.

**Storyboards.** Deterministic: frames come from seeking held animations or
from stepping scripted input, never from wall-clock capture. The JSON trace
carries each frame's measurements and the spec asserts on it; the sheet is
evidence. A component that finishes an animation from a timer (a transitionend
backstop, a cleanup render) would do so behind a held storyboard's back:
`installTimerGate` before the animation starts and `freezeTimers` while
photographing. The page can still cancel a held callback, a held frame callback
gets the time it actually runs, and the harness's own waits (its frame waits,
`blockMainThread` with `during`, `sampleRects`) are not held.
An animation that repeats forever does not set a storyboard's default length;
with nothing else to film, pass `times`. A touch filmstrip keeps the scripted
event `timeStamp`s (Chromium), but a handler that reads `performance.now()` or
`Date.now()` sees one event per photograph, about 100 ms apart, so a
clock-timed release flings slower when filmed than when played: a storyboard
cannot show such a gesture; record it in real time instead, with
`startScreencast` and `castStoryboard`. A photograph the engine fails
throws the engine's error; a storyboard never takes it again.

## Page freeze

A proof that must act on a component mid-animation (a second tap mid-slide, a
finger that lands before the last lift reaches the app) races the test
process: on a loaded runner the motion has moved on, or ended, before the next
command reaches the page. The page freeze (`src/freeze.ts`) stops the scene
instead, and the proof acts at an instant of the scene's own time.

- `installPageFreeze(page)` installs the page clock, before the page loads
  (before `openStory`); then `installTimerGate` as usual. A page that never
  calls it keeps its own clock. Code that kept a bound `performance.now`
  before the install keeps the real clock.
- `freezePage` and `thawPage` stop and start the scene in one page task.
- `freezePageOn(page, type)` freezes on the next `type` event, in that
  event's own task and before any page listener for it: the install adds one
  window capture listener for each pointer, touch, mouse, key, wheel and
  scroll event before any page script runs, and the call arms it. Any other
  type throws.
  A freeze armed on `scroll` lands when the scroll event fires, after the
  scroll position has already moved.
- `freezePageWhen(page, predicate, arg)` freezes on the first real frame the
  predicate holds, and rejects after its timeout.
- `advanceFrozenPage(page, ms)` moves the page's clock and every held
  animation on together by `ms`; timers and frame callbacks stay held.
- `holdInputUntil(page, {afterResumeMs})` makes the page handle its next lift
  late, after the thaw, while the scene runs (below).

While frozen, every animation in the document is paused where it stands (Web
Animations, CSS animations and transitions), and so is any the page starts
meanwhile, at its start. The timer gate holds the page's timers and frame
callbacks. These clocks stand still: `performance.now()`, `Date.now()`,
`event.timeStamp`, frame callback times, `document.timeline.currentTime`
and `Animation.startTime`. `new Date()` keeps the real clock. Timeouts the
page set before the freeze stop counting too, and come due on the page's clock
after the thaw. An interval keeps the real clock and skips its ticks while
frozen. The harness's own waits keep the real clock, so they still sample,
hold and time out on a frozen page. Only animations on the document timeline are held: one on a
scroll or view timeline follows its scroller, frozen or not. Input still
arrives, and its handlers run, each reading the frozen instant. An animation
reads as it did before the freeze (`playState` stays `running`).

At the thaw every held animation plays on from where it stood, dated on the
timeline's own time, so it is drawn where it stood in the thaw frame. That
includes one whose start the page wrote while frozen: the timeline reads the
current frame's time, which trails the page's clock by however far into the
frame the thaw runs, so a start dated from now would sit before its start for
the rest of that frame. After a thaw the page's times run again, behind real
time by every frozen span so far, so the page's clock and its animations on
the compositor agree as they did before the freeze.

Not held yet: a run the page reverses, or a finished run it plays again,
while frozen. A freeze holds the top document; a frame's content keeps running.
A CSS animation a freeze held no longer follows `animation-play-state` after
the thaw. A freeze in which no frame starts ends at the frame before it, so the page's
clock and its runs come out of it up to a frame ahead.

The clock lives in script because no engine has a native freeze that holds
animations. Chromium's `Emulation.setVirtualTimePolicy` stops
`performance.now()` and timers but not Web Animations or frame callbacks in
the headless shell (300 ms into a pause the timeline had advanced 300 ms and a
compositor animation 45 px), and its `advance` policy cannot return to real
time: it fast-forwards whenever the page is idle.

### Input the page handles late

A frozen page handles input at once. A proof that needs a late handling, with
the compositor still moving, cannot freeze through the input. A held run resumes
only at the first frame after the thaw, and a block before that frame holds the
screen too. `holdInputUntil(page, {afterResumeMs})`, called before the thaw,
holds the next lift instead (`pointerup` or `touchend`; `on` names others). The
install's window capture listener runs first in the input's task and keeps the
main thread busy until `afterResumeMs` after that first frame. Send the input
once `resumed()` resolves. `landed()` then gives when the input arrived, when it
was due, and when the page let it through. The event keeps its own `timeStamp`,
earlier than its handling, as on a busy page. An input that arrives more than a
frame late, before that first frame, or while the page is frozen again, rejects
`landed()` with `LiftPlacementError` and the numbers. The page cannot hold back
an input it has not received, and a hold before the frame would stop the screen.
Choose `afterResumeMs` above the runner's time from `resumed()` to the input's
arrival. Under load, that round trip is what makes a hold late. The page lets
the input through at its time, or at its arrival if that came later within the
frame. On a starved runner it can be later still, by as long as its main thread
did not run: `landed()` gives that as `stalledMs`.

`navigator.scheduling.isInputPending()` cannot gate a lift. In Playwright's
Chromium 149 it reports a queued mouse press or key at once, but never a touch
sent with `Input.dispatchTouchEvent`. WebKit has no `isInputPending`.

## Engine limits (measured with Playwright 1.61)

|                                                        | Chromium 149                                                                                                           | WebKit 26.5 (Linux build)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trusted touch + pointer events, multi-touch            | yes                                                                                                                    | yes (a `touchstart` lists only the fingers that landed in it; pointer events exact)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Page sees the scripted timestamps                      | yes, exactly                                                                                                           | no: real dispatch time; pacing keeps velocities within ~1 ms on an idle runner; after a stall each step waits its gap, less 2 ms, after WebKit answered the one before, even with `onEvent`, so no gap can shrink; a play fails when its page read a resting finger where the script moves, a throw where the script rests, or fewer than two moves, or, given `releaseTolerance`, a release straying further from the script's (each read as Core's tracker reads it): `TouchLiftStallError` when `onEvent` held the lift back, `TouchPageStallError` when the page's listeners held an event, `TouchStarvationError` when the page drew no frame across the late gap, else `TouchPacingError`; the lift's `release` names what the page read |
| Sub-pixel touch positions                              | yes                                                                                                                    | no: integer CSS px                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Native scroll, fling, pinch-zoom from injected touches | yes                                                                                                                    | no                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Lifting one finger while others stay down              | yes                                                                                                                    | pointer events right, but that `touchend` lists no remaining `touches`: skip with `PARTIAL_LIFT_SKIP`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Click synthesised from a touch                         | yes                                                                                                                    | only from `driver.tap` (WebKit's tap gesture), not from a raw touch sequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Curve sampling, storyboards, input log                 | yes                                                                                                                    | yes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| A CSS animation shorter than a gap between two frames  | yes: a pending animation starts at the next frame, and runs then                                                       | no: it can start and finish inside the gap, and its start event, sent at the next frame, finds nothing to record; `waitForAnimation` names it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Screencast frame evidence (busy main thread)           | yes                                                                                                                    | yes (WebKit's own screencast; frames keep coming while the main thread is blocked)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Rendering trace, long tasks                            | yes                                                                                                                    | no (Playwright exposes neither)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Compositor presentation record                         | yes                                                                                                                    | no: `stop()` resolves to `[]`; the busy verdict judges the screencast alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Wheel steps, exact CSS px deltas (`webInput.ts`)       | yes                                                                                                                    | desktop context only (`isMobile: false`): skip with `WHEEL_SKIP`; the step also moves the mouse there (a `pointermove`) and holds Control as a key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Pen strokes, pressure, scripted timestamps             | yes                                                                                                                    | no: skip with `PEN_SKIP`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Pen over a native scroller                             | no pan: the pen takes the mouse pipeline, so a stroke scrolls nothing, raises no `pointercancel` and ends in a `click` | no: skip with `PEN_SKIP`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

What WebKit cannot show here — native scroll hand-off, flings, a finger
lifting while another stays down, finger tracking under a busy main thread, and
anything iOS-only — needs Mobile Safari itself, on a device or the iOS
simulator. Skip such a proof on the driver's flag, citing the reason:
`test.skip(!driver.partialLifts, PARTIAL_LIFT_SKIP)`.

A touch play waits for its `onEvent` before it sends the next event, so page
work there delays that event by a round trip. WebKit stamps a touch when it
arrives. So a lift that reaches the page past the 40 ms stillness interval
after its finger's last move reads as a resting finger. The page releases it
at 0. Every WebKit play reads its release from the page's own stamps, however
it is paced, and fails by name when the page's release is not the script's.
The error is `TouchLiftStallError` when `onEvent` alone carries the scripted
gap past the stillness interval, however much a loaded runner stretched it.
Record what the page did in a listener of its own, or let the script rest
before the lift. A runner too loaded to dispatch in time stretches a
gesture the same way, and the play fails with `TouchPacingError`. When the
page also drew no frame for longer than `FRAME_STARVATION_MS` across that
gap, and no page work held the event, it fails with `TouchStarvationError`:
the runner starved the page, so judge the proof from a run with CI's CPU
limits. A play whose
proof reads no release from the lift, such as a pinch's end, passes
`releaseUnread`.

A proof whose component decides on a threshold names it in `boundaries`:
the release speed a pager pages from (`releasePxPerS`), or the hold after
which it catches the content (`holdMs`). In WebKit the play then fails by
name when the page read the release, or the first finger's hold from
touch-down to lift, on the other side of the threshold from the script. A
scrolling surface reads its release as Core's `scrollVelocity` does: pass
`release: 'scroll'`. Each pacing error names the longest time the page drew no
frame during the gesture. A page that drew nothing for 100 ms or more never
received the gesture as scripted. To read a frame before the gesture, a judged
play starts one frame later.

A wheel gesture is a run of steps, and `wheel` waits for each step's round
trip, so on a loaded runner awaited steps land as far apart as a round trip
takes: 49 to 141 ms in WebKit, past the 100 ms a proof may allow between the
steps of one wheel gesture. `wheelBurst({x, y, steps, everyMs, maxGapMs})`
sends a run at one point on its schedule (16 ms by default) without waiting for
each round trip and resolves once the page has the run's whole delta; where the
page still handles one step when the next arrives, the engine coalesces them,
as it does a trackpad's.

WebKit dispatches a step only once the page's main thread is free, and the
steps it holds meanwhile reach the page coalesced into one, stamped like the
step before it, so the burst times each WebKit step by when the page's first
listener received it (`wheelArrivals`). A gap of `maxGapMs` or more splits the
run, as Core's gesture host ends a wheel gesture at a pause of its end window or
more. A proof whose component reads the run as one trackpad scroll passes its
axis's `WHEEL_SCROLL_END_MS`. Three things can split a run. When a step reached
the page within one frame of its own wheel
listeners finishing the step before, and the gap is more than a frame wider
than the harness's own spacing of those sends, those listeners held it back:
the burst throws `WheelPageStallError`, the page split the gesture, and the
proof fails. A page can only widen a gap, so one no wider than the send
spacing is the dispatch's even when a starved renderer also held the step.
When the page drew no frame across nearly all of a widened gap, engine or page
work held the main thread: the burst records the page's frames and throws
`WheelPageStallError` with the frame gap, the arrival gap and the listeners'
time. A starved runner's renderer draws no frame either, so judge such a stall
from a run with CI's CPU limits. Otherwise the dispatch stalled before the
page (a loaded runner) and it throws `WheelPacingError` with the gaps. A proof
never re-takes itself: a `WheelPacingError` stays red, named as the runner's.
Where one shows in CI's profile, fix the wheel's delivery, not the proof. The
burst times the
page's handling with a listener on the window that runs after the page's own.
A step whose propagation the page stops is marked by a task queued when it
arrived, and never later than the next step's arrival. So its handling, with
any work queued before that task, counts as the page's. Other main-thread work
between steps that leaves frames running still counts as the dispatch's stall.
Chromium stamps a step with its dispatch time, so a page that holds its main
thread does not widen the gaps there, and every gap of `maxGapMs` or more is a
`WheelPacingError`.

The WebKit input command is reached through Playwright's in-process server
object, so it needs a locally launched browser (the default), not `connect()`.
Firefox has no touch input path and no project.
