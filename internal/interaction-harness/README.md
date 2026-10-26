# @astryxdesign/interaction-harness

Playwright instruments for touch interaction and animation proofs: real touch
input and curve sampling. **Internal and unpublished.** Specs live
next to their component as `*.interaction.browser.spec.ts` and run under
[`playwright.interaction.config.ts`](../../playwright.interaction.config.ts) on
a phone-sized touch screen (402 × 714 CSS px page, 402 × 874 screen, 3 device
pixels per CSS px, touch, mobile viewport rules), in Chromium and WebKit.

The harness proves its own instruments in
[`src/harness.interaction.browser.spec.ts`](src/harness.interaction.browser.spec.ts),
on fixture pages written inline.

## Running

```sh
pnpm storybook:build                      # component specs read stories from the built Storybook
pnpm exec playwright install chromium webkit
pnpm test:interaction --project chromium  # everything, Chromium
pnpm test:interaction <spec file>         # one spec, both engines
```

## Instruments

| Module       | What it gives a spec                                                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts.ts` | Touch scripts as data: `tap`, `drag` (hold, rest), `flick` (exact final-move speed, velocity profiles), `holdThenDrag`, `pinch`, `rotate`, `path`, `merge` (a second finger mid-gesture), `releaseVelocity`, `toTouchEvents`. |
| `touch.ts`   | `touchDriver(page).play(script)`: the script as real engine input. `installInputLog` / `readInputLog`: what the page received.                                                                                                |
| `curves.ts`  | `holdAnimations`, `seekAnimations`, `sampleCurve` (presented transform / opacity at any t), `releaseAnimations`.                                                                                                              |
| `math.ts`    | Oracles independent of the code under test: `cubicBezier`, `timingFunction`, `springStep` (SwiftUI response / dampingFraction, initial velocity), `projectDecay`, `rubberBand`, `parseTransform`, `compareCurve`, `timeline`. |
| `story.ts`   | `phone`, `withStorybook`, `openStory`, `frames`.                                                                                                                                                                              |

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
ends where that run starts: `curveEndMs` stops there. That holds for an
animation that plays forward under a linear or cubic-bézier effect easing (the
time the run starts is solved from the curve); under any other effect easing
(steps, `linear()` stops, an overshoot) or another direction the curve is read
to its full end. `holdAnimations` refuses an animation running backward
(`reverse()`, a negative playback rate): seeking and sampling run a curve
forward.

## Engine limits (measured with Playwright 1.61)

|                                                        | Chromium 149 | WebKit 26.5 (Linux build)                                                                             |
| ------------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------- |
| Trusted touch + pointer events, multi-touch            | yes          | yes (a `touchstart` lists only the fingers that landed in it; pointer events exact)                   |
| Page sees the scripted timestamps                      | yes, exactly | no: real dispatch time; real-time pacing keeps velocities within ~1 ms                                |
| Sub-pixel touch positions                              | yes          | no: integer CSS px                                                                                    |
| Native scroll, fling, pinch-zoom from injected touches | yes          | no                                                                                                    |
| Lifting one finger while others stay down              | yes          | pointer events right, but that `touchend` lists no remaining `touches`: skip with `PARTIAL_LIFT_SKIP` |
| Click synthesised from a touch                         | yes          | only from `driver.tap` (WebKit's tap gesture), not from a raw touch sequence                          |
| Curve sampling, input log                              | yes          | yes                                                                                                   |

What WebKit cannot show here — native scroll hand-off, flings, a finger
lifting while another stays down, and anything iOS-only — needs Mobile Safari
itself, on a device or the iOS simulator. Skip such a proof on the driver's
flag, citing the reason: `test.skip(!driver.partialLifts, PARTIAL_LIFT_SKIP)`.

The WebKit input command is reached through Playwright's in-process server
object, so it needs a locally launched browser (the default), not `connect()`.
Firefox has no touch input path and no project.
