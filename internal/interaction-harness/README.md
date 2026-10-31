# @astryxdesign/interaction-harness

Playwright instruments for touch interaction and animation proofs: real touch
input, frame evidence, curve sampling and storyboards. **Internal and
unpublished.** Specs live next to their component as
`*.interaction.browser.spec.ts` and run under
[`playwright.interaction.config.ts`](../../playwright.interaction.config.ts) on
a phone-sized touch screen (402 × 714 CSS px page, 402 × 874 screen, 3 device
pixels per CSS px, touch, mobile viewport rules), in Chromium and WebKit.

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
pnpm test:interaction <spec file>         # one spec, both engines
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

Evidence (storyboards, curve traces) is written to
`test-results/interaction-evidence/` (override with
`ASTRYX_INTERACTION_EVIDENCE`) and attached to the test report. It is never
committed: a pull request links or attaches it.

## Instruments

| Module          | What it gives a spec                                                                                                                                                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts.ts`    | Touch scripts as data: `tap`, `drag` (hold, rest), `flick` (exact final-move speed, velocity profiles), `holdThenDrag`, `pinch`, `rotate`, `path`, `merge` (a second finger mid-gesture), `releaseVelocity`, `toTouchEvents`.                                                |
| `touch.ts`      | `touchDriver(page).play(script)`: the script as real engine input. `installInputLog` / `readInputLog`: what the page received.                                                                                                                                               |
| `frames.ts`     | `startScreencast` (timestamped composited frames), `markElement` (a marker chip or outline), `trackMarker` (marker box per frame), `frameStats`.                                                                                                                             |
| `busy.ts`       | `blockMainThread(page, ms)` and `busyWindowProof(tracked, window)`: frames presented, frames that moved, longest stall, a verdict; `presented` adds the compositor's own frames.                                                                                             |
| `webInput.ts`   | `webInputDriver(page)`: `wheel({x, y, dx, dy, ctrl})` and `pen(points)` as real engine input, for proofs across pointers (`spec:AST-100` FR4); `wheel` resolves once the page has the step; read back through the input log.                                                 |
| `trace.ts`      | `traceRendering(page, body)`: main-thread counts of UpdateLayoutTree / Layout / PrePaint / Paint / Layerize / UpdateLayer / ScrollLayer / HitTest, `countBetween`, long tasks; `installLongTaskLog` / `readLongTasks`; `startCompositorTrace`: when the compositor presents. |
| `curves.ts`     | `holdAnimations`, `seekAnimations`, `sampleCurve` (presented transform / opacity at any t), `waitForAnimation`, `watchAnimations`, `waitForRest`, `releaseAnimations`.                                                                                                       |
| `math.ts`       | Oracles independent of the code under test: `cubicBezier`, `timingFunction`, `springStep` (SwiftUI response / dampingFraction, initial velocity), `projectDecay`, `rubberBand`, `parseTransform`, `compareCurve`, `timeline`.                                                |
| `storyboard.ts` | `animationStoryboard` (seek to t = 0, 16.7, 33.3 … ms), `touchStoryboard` (a frame per scripted event): PNG contact sheet + JSON trace.                                                                                                                                      |
| `output.ts`     | `evidenceDir`, `writeEvidence`: where evidence goes and how it is attached to the report.                                                                                                                                                                                    |
| `story.ts`      | `phone`, `withStorybook`, `openStory`, `frames`, and the timer gate (`installTimerGate`, `freezeTimers`, `thawTimers`).                                                                                                                                                      |

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

**Curve sampling.** Pause every running animation (CSS transitions and
animations are Web Animations too), seek to a time, read `getComputedStyle`:
the presented value at that exact time, independent of frame timing. Finished
animations, ones the page paused and ones on a scroll or view timeline are left
alone; held animations keep their offsets from the first hold's earliest start, and release
resumes only them. Compare it with an
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

**Waiting for an animation.** The page records every animation from the first
call into `curves.ts` on it (and on every later document): a frame loop on the
page's own `requestAnimationFrame`, the CSS animation and transition events,
and `Element.animate` as it is called, pending animations included. So
`waitForAnimation` also reports one that started after the last
`waitForRest`, `waitForAnimation` or `watchAnimations` and has already finished (`finishedAt`
set): a short entrance no longer races the first look on a cold page. When the
action may be the page's first contact with the harness, take
`watchAnimations(locator)` before it and read `watch.started()` after.

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
plateaus within a pixel or two of rest. A judged part shorter than four of the
screencast's intervals fails: the animation under test was not moving during
the block. With
`during`, `blockMainThread` starts the loop from a task queued in the frame
that saw the animation, after that frame's rendering update: WebKit hands a
newly started animation to its compositor there, and a loop inside the rAF
callback would freeze even a compositor animation. Call it before the release
that starts a settle and await it after, so the page is already waiting when
the settle begins. An animation counts once it is no longer pending and has
run at least one frame: a `minProgressMs` under 16 is raised to 16, since one
created in the frame the page looks is not on the compositor yet. The `verdict` judges the
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
machine can deliver them out of order.

A just-started animation can reach the screen after the block began (50–100 ms
later in WebKit on a loaded machine). When the cast saw the element at rest
before the block (wait for `cast.frameCount()` to pass 0 before starting the
animation), judging starts at its first presented change: the judged part still
ends with the block and still needs four intervals, and `onScreenFromMs` and the
summary report when it came. So is an element that moved, then held from
before the block until its first presented change inside it: WebKit presents
a just-started compositor animation late (a sheet's release held on screen for
130 to 300 ms while its timeline ran), and its cast reaches Node about 0.7 s
late on a loaded runner, too late to wait on before blocking. Only a hold that
starts before the block, on two frames at least, is excused, and every frame
after its first change is judged, so a freeze later in the block still fails.
Any other element already moving is judged from the block's start. WebKit's
casts are 2 px quantized: the frames come at the
viewport's size, but the page in them is captured at half resolution, so
positions move in 2 CSS px steps (Chromium's in 1). With under two steps of
motion per frame, a frame delivered a few ms early shows no step and reads as
not moved. The proof reports `stepPx` and `pxPerFrame` and notes motion under
two steps per frame, which never fails it. Move a proof's element at least two
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
a dialog they still wait for the backdrop's. Track it from the
same screencast (`trackMarker(page, frames, {rgb: CONTROL_RGB})`) and pass it
as `control`: the component passes when it moved on every frame the control
moved and its longest stall is no longer than the control's. Both are read from
the same screencast frames, so a compositor animation misses none. A window in
which the control moved on fewer than four frames fails, since the machine
presented too little to judge. A run of frames with no new position counts as
moved when the change that ends it is a single cast step: the component moves
under one step a frame there, as on an easing tail, which the cast cannot show
on every frame. The run must also read as a slowing curve, at most one frame
longer than the component's run before it. A freeze ends in a catch-up of more
than one step, a stall in a frame-counted animation is longer than its runs
before it, and a run that no change ends stays a miss. The component still has
to show a new position on at least four of the control's frames. The cast step (`stepPx`)
is read from the value's changes in the judged part, so a position the page
commits off the grid once the block ends does not shrink it.
A main-thread animation still fails: the control moves and it does not.

An animation that lasts a fraction of a second, such as a 0.2 s fade, leaves a
block only a few frames to judge: in WebKit, or on a loaded machine, the control
can present fewer than four, and one run cannot decide. Play it several times
and judge the runs pooled (`pooledBusyProof(runs)`, each run with its own
tracked frames, control and window): the control must move on at least four
frames over all the runs, the component on every one of them, and in each run
its longest stall may be no longer than that run's control's, since a stall
belongs to its run.

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

**No Layout / Paint.** `traceRendering` records a Chromium trace around the
interaction; `countBetween` counts the steady middle of an animation (its
first and last frames may commit). A transform/opacity animation does no
Layout or Paint there; a layout-property animation does one per frame. Its
`longTasks` are the page's own: only a task the harness marked as its own read
(`waitForAnimation` describing keyframes, `blockMainThread` without `during`)
is in `devtoolsTasks` instead, and only when no page script ran inside it. A
test's own `page.evaluate` stays a long task, whether it calls page code
directly or sets it off.

**Storyboards.** Deterministic: frames come from seeking held animations or
from stepping scripted input, never from wall-clock capture. The JSON trace
carries each frame's measurements and the spec asserts on it; the sheet is
evidence. A component that finishes an animation from a timer (a transitionend
backstop, a cleanup render) would do so behind a held storyboard's back:
`installTimerGate` before the animation starts and `freezeTimers` while
photographing. The page can still cancel a held callback, a held frame callback
gets the time it actually runs, and the harness's own waits (its frame waits,
`blockMainThread` with `during`) are not held.
An animation that repeats forever does not set a storyboard's default length;
with nothing else to film, pass `times`. A touch filmstrip keeps the scripted
event `timeStamp`s (Chromium), but a handler that reads `performance.now()` or
`Date.now()` sees one event per photograph, about 100 ms apart, so a
clock-timed release flings slower when filmed than when played: a storyboard
cannot show such a gesture; record it in real time instead, with
`startScreencast`. Chromium can return an empty copy of
the page's surface right after it changes ("Unable to capture screenshot"); a
storyboard takes that photograph again two frames later, up to three attempts
in all, and lists each retake under `recaptures` in the trace.

## Engine limits (measured with Playwright 1.61)

|                                                        | Chromium 149                                                                                                           | WebKit 26.5 (Linux build)                                                                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trusted touch + pointer events, multi-touch            | yes                                                                                                                    | yes (a `touchstart` lists only the fingers that landed in it; pointer events exact)                                                                |
| Page sees the scripted timestamps                      | yes, exactly                                                                                                           | no: real dispatch time; real-time pacing keeps velocities within ~1 ms                                                                             |
| Sub-pixel touch positions                              | yes                                                                                                                    | no: integer CSS px                                                                                                                                 |
| Native scroll, fling, pinch-zoom from injected touches | yes                                                                                                                    | no                                                                                                                                                 |
| Lifting one finger while others stay down              | yes                                                                                                                    | pointer events right, but that `touchend` lists no remaining `touches`: skip with `PARTIAL_LIFT_SKIP`                                              |
| Click synthesised from a touch                         | yes                                                                                                                    | only from `driver.tap` (WebKit's tap gesture), not from a raw touch sequence                                                                       |
| Curve sampling, storyboards, input log                 | yes                                                                                                                    | yes                                                                                                                                                |
| Screencast frame evidence (busy main thread)           | yes                                                                                                                    | yes (WebKit's own screencast; frames keep coming while the main thread is blocked)                                                                 |
| Rendering trace, long tasks                            | yes                                                                                                                    | no (Playwright exposes neither)                                                                                                                    |
| Compositor presentation record                         | yes                                                                                                                    | no: `stop()` resolves to `[]`; the busy verdict judges the screencast alone                                                                        |
| Wheel steps, exact CSS px deltas (`webInput.ts`)       | yes                                                                                                                    | desktop context only (`isMobile: false`): skip with `WHEEL_SKIP`; the step also moves the mouse there (a `pointermove`) and holds Control as a key |
| Pen strokes, pressure, scripted timestamps             | yes                                                                                                                    | no: skip with `PEN_SKIP`                                                                                                                           |
| Pen over a native scroller                             | no pan: the pen takes the mouse pipeline, so a stroke scrolls nothing, raises no `pointercancel` and ends in a `click` | no: skip with `PEN_SKIP`                                                                                                                           |

What WebKit cannot show here — native scroll hand-off, flings, a finger
lifting while another stays down, finger tracking under a busy main thread, and
anything iOS-only — needs Mobile Safari itself, on a device or the iOS
simulator. Skip such a proof on the driver's flag, citing the reason:
`test.skip(!driver.partialLifts, PARTIAL_LIFT_SKIP)`.

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
listener received it (`wheelArrivals`). Two things can split a run past
`maxGapMs`. When a step reached the page within one frame of its own wheel
listeners finishing the step before, those listeners held it back: the burst
throws `WheelPageStallError`, the page split the gesture, and the proof fails.
Otherwise the dispatch stalled before the page (a loaded runner) and it throws
`WheelPacingError` with the gaps. Wrap such a
proof in `retakeOnWheelPacing(testInfo, attempt)`: one re-take, only on
`WheelPacingError`, listed as a `wheel-retake` annotation. The burst times the
page's handling with a listener on the window that runs after the page's own,
so a listener that stops the step's propagation, or other main-thread work
between steps (timers, frames), still counts as the dispatch's stall. Chromium
stamps a step with its dispatch time, so a page that holds its main thread does
not widen the gaps there, and every gap past `maxGapMs` is a `WheelPacingError`.

The WebKit input command is reached through Playwright's in-process server
object, so it needs a locally launched browser (the default), not `connect()`.
Firefox has no touch input path and no project.
