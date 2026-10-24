# @astryxdesign/interaction-harness

Playwright instruments for touch interaction and animation proofs: real touch
input, frame evidence, curve sampling and storyboards. **Internal and
unpublished.** Specs live next to their component as
`*.interaction.browser.spec.ts` and run under
[`playwright.interaction.config.ts`](../../playwright.interaction.config.ts) on
a phone-sized touch screen (402 × 714 CSS px page, 402 × 874 screen, 3 device
pixels per CSS px, touch, mobile viewport rules), in Chromium and WebKit.

The exemplar to copy is
[`BottomSheetDetent.interaction.browser.spec.ts`](../../packages/core/src/BottomSheet/__tests__/BottomSheetDetent.interaction.browser.spec.ts).
The harness proves its own instruments in
[`src/harness.interaction.browser.spec.ts`](src/harness.interaction.browser.spec.ts):
every positive check has a negative control beside it (a rAF animation that
freezes, a `top` animation that lays out every frame).

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
image (podman or docker; the repository is mounted at the same path):

```sh
node internal/interaction-harness/scripts/webkit-container.mjs [playwright test args…]
```

Evidence (storyboards, curve traces, busy-main-thread frames) is written to
`test-results/interaction-evidence/` (override with
`ASTRYX_INTERACTION_EVIDENCE`) and attached to the test report. It is never
committed: a pull request links or attaches it.

## Instruments

| Module          | What it gives a spec                                                                                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts.ts`    | Touch scripts as data: `tap`, `drag` (hold, rest), `flick` (exact release velocity, velocity profiles), `holdThenDrag`, `pinch`, `rotate`, `path`, `merge` (a second finger mid-gesture), `releaseVelocity`, `toTouchEvents`. |
| `touch.ts`      | `touchDriver(page).play(script)`: the script as real engine input. `installInputLog` / `readInputLog`: what the page received.                                                                                                |
| `frames.ts`     | `startScreencast` (timestamped composited frames), `markElement` (a marker chip or outline), `trackMarker` (marker box per frame), `sampleRects` (per-rAF rects), `frameStats`.                                               |
| `busy.ts`       | `blockMainThread(page, ms)` and `busyWindowProof(tracked, window)`: frames presented, frames that moved, longest stall, and a verdict.                                                                                        |
| `trace.ts`      | `traceRendering(page, body)`: main-thread Layout / Paint / UpdateLayoutTree / PrePaint counts, `countBetween` for a sub-window, long tasks. `installLongTaskLog` / `readLongTasks`.                                           |
| `curves.ts`     | `holdAnimations`, `seekAnimations`, `sampleCurve` (presented transform / opacity at any t), `waitForAnimation`, `waitForRest`, `releaseAnimations`.                                                                           |
| `math.ts`       | Oracles independent of the code under test: `cubicBezier`, `timingFunction`, `springStep` (SwiftUI response / dampingFraction, initial velocity), `projectDecay`, `rubberBand`, `parseTransform`, `compareCurve`, `timeline`. |
| `storyboard.ts` | `animationStoryboard` (seek to t = 0, 16.7, 33.3 … ms), `touchStoryboard` (a frame per scripted event), `castStoryboard` (real screencast frames): PNG contact sheet + JSON trace.                                            |
| `output.ts`     | `evidenceDir`, `writeEvidence`: where evidence goes and how it is attached to the report.                                                                                                                                     |
| `story.ts`      | `phone`, `withStorybook`, `openStory`, `frames`, and the timer gate (`installTimerGate`, `freezeTimers`, `thawTimers`).                                                                                                       |

## The proofs

**Real touch.** Untrusted DOM events are not input: they start no native
scroll, claim no gesture, and read `isTrusted: false`. Chromium input goes
through CDP `Input.dispatchTouchEvent` with an explicit timestamp per event: the
page's `event.timeStamp` is the scripted time to the microsecond, whatever the
dispatch latency, and the events go through the compositor's gesture detection
(native scrolling, flings with velocity from those timestamps, `touch-action`,
`pointercancel`). WebKit input goes through the engine's own input command; see
the limits below. Read positions a frame after a move: Chromium delivers
`pointermove` aligned to animation frames.

**Curve sampling.** Pause every animation (CSS transitions and animations are
Web Animations too), seek to a time, read `getComputedStyle`: the presented
value at that exact time, independent of frame timing. Compare it with an
oracle from `math.ts` through `compareCurve`; a tolerance states the error
budget (for a spring baked into `linear()` stops of `h` ms, chords err by up to
`h² / 8 · |x''|`). A seek past an animation's end lands half a millisecond
inside it, the last frame it presents. An animation whose keyframes end in a run of
identical values (an end value held so a later interruption can read it)
ends where that run starts: `curveEndMs`, `waitForAnimation`'s interval and
the default storyboard times stop there, and `waitForRest`, which judges the
presented `transform`, `translate`, `rotate`, `scale` and `opacity` rather
than `playState`, does not wait the hold out.

**Busy main thread.** Mark the element, start the screencast, start the
animation, wait until it runs (`waitForAnimation`: an animation cannot start
while the thread is held), block the main thread 500–1000 ms, stop. Always
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
plateaus within a pixel or two of rest. The `verdict` tolerates what a
loaded machine does to a screencast and nothing a frozen animation does: a
median frame interval of at most 20 ms, no stall longer than three screencast
intervals (two dropped frames), and at least 90% of the window's whole frame
intervals presenting a new position (one miss is always allowed).
`verdict.failures` names each miss with its numbers, and `summary` carries the
raw numbers for the report. Frames are judged in presentation order: a loaded
machine can deliver them out of order. `castStoryboard` turns the frames of the
block into a filmstrip.

**No Layout / Paint.** `traceRendering` records a Chromium trace around the
interaction; `countBetween` counts the steady middle of an animation (its
first and last frames may commit). A transform/opacity animation does no
Layout or Paint there; a layout-property animation does one per frame.

**Storyboards.** Deterministic: frames come from seeking held animations or
from stepping scripted input, never from wall-clock capture. The JSON trace
carries each frame's measurements and the spec asserts on it; the sheet is
evidence. A component that finishes an animation from a timer (a transitionend
backstop, a cleanup render) would do so behind a held storyboard's back:
`installTimerGate` before the animation starts and `freezeTimers` while
photographing.

## Engine limits (measured with Playwright 1.61)

|                                                        | Chromium 149 | WebKit 26.5 (Linux build)                                                                             |
| ------------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------- |
| Trusted touch + pointer events, multi-touch            | yes          | yes (a `touchstart` lists only the fingers that landed in it; pointer events exact)                   |
| Page sees the scripted timestamps                      | yes, exactly | no: real dispatch time; real-time pacing keeps velocities within ~1 ms                                |
| Sub-pixel touch positions                              | yes          | no: integer CSS px                                                                                    |
| Native scroll, fling, pinch-zoom from injected touches | yes          | no                                                                                                    |
| Lifting one finger while others stay down              | yes          | pointer events right, but that `touchend` lists no remaining `touches`: skip with `PARTIAL_LIFT_SKIP` |
| Click synthesised from a touch                         | yes          | only from `driver.tap` (WebKit's tap gesture), not from a raw touch sequence                          |
| Curve sampling, storyboards, input log                 | yes          | yes                                                                                                   |
| Screencast frame evidence (busy main thread)           | yes          | yes (WebKit's own screencast; frames keep coming while the main thread is blocked)                    |
| Rendering trace, long tasks                            | yes          | no (Playwright exposes neither)                                                                       |

What WebKit cannot show here — native scroll hand-off, flings, a finger
lifting while another stays down, finger tracking under a busy main thread, and
anything iOS-only — needs Mobile Safari itself, on a device or the iOS
simulator. Skip such a proof on the driver's flag, citing the reason:
`test.skip(!driver.partialLifts, PARTIAL_LIFT_SKIP)`.

The WebKit input command is reached through Playwright's in-process server
object, so it needs a locally launched browser (the default), not `connect()`.
Firefox has no touch input path and no project.
