# Motion

Internal motion foundation for the touch presentations of core components:
the UIKit constants table (every spring, duration, deceleration rate,
rubber-band constant, curve and gesture threshold a touch presentation uses,
each with its source), the spring, decay, rubber-band and projection math
UIKit uses, and a compositor animator that plays it. Nothing here is exported
from the package entry point; components import it by path.

## Files

| File                                             | What it is                                                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uikit/`                                         | THE constants table: every spring, duration, deceleration rate, rubber-band constant and curve, with its source.                                                     |
| `uikit/springs.ts`                               | Interaction springs (navigation, sheets, alerts, menus, controls, keyboard, banners) and the SwiftUI / UIKit presets.                                                |
| `uikit/scroll.ts`                                | UIScrollView: deceleration rates, rubber band, bounce-back spring, paging, `delaysContentTouches`, scroll to top.                                                    |
| `uikit/timing.ts`                                | Non-spring clocks and curves: press highlight, Core Animation's named curves, keyboard, Reduced Motion cross-fade.                                                   |
| `uikit/navigation.ts`                            | UINavigationController: push velocity, parallax, dimming, transition clock, interactive pop finish rule.                                                             |
| `uikit/gestures.ts`                              | Gesture recognizer thresholds, the velocity filter and the haptic stand-ins, as typed entries the gesture system reads.                                              |
| `roles.ts`                                       | Motion roles: each spring, duration and curve of a registered table, named by its path, and its CSS variable.                                                        |
| `resolveMotion.ts`                               | A role's value under an element's theme, read once when a motion starts.                                                                                             |
| `MEASUREMENTS.md`                                | The UIKit reference captures each unconfirmed value still needs.                                                                                                     |
| `spring.ts`                                      | Closed-form damped spring, every Apple parameterization, settling duration, a spring chasing a moving target.                                                        |
| `decay.ts`                                       | UIScrollView's momentum coast.                                                                                                                                       |
| `rubberBand.ts`                                  | UIScrollView's resistance past an edge, and its inverse.                                                                                                             |
| `projection.ts`                                  | Release targets: the rest point nearest the projected coast; paging.                                                                                                 |
| `bezier.ts`                                      | Cubic-bézier timing functions (Core Animation's named curves).                                                                                                       |
| `animator.ts`                                    | Compositor animator: springs, decays and any closed-form curve compiled to Web Animations, read back analytically.                                                   |
| `experimental.ts`                                | The experimental public subpath (`@astryxdesign/core/motion/experimental`).                                                                                          |
| `useAnimator.ts`                                 | React wrapper that never re-renders per frame.                                                                                                                       |
| `__tests__/animator.interaction.browser.spec.ts` | Browser proofs on the interaction harness (Chromium and WebKit): busy main thread, end state through a block, no Layout / Paint, seeked curves, a dialog's backdrop. |

Component-specific values (a sheet's detents, a switch's geometry, a context
menu's timeline) live in a domain file per component, `uikit/<component>.ts`,
under the same rules.

## Theme

Every spring, duration (a key ending in `Ms`) and curve of a table that calls
`registerMotionTable` is a motion role named by its path, such as
`springs.sheetPresent` or `timing.curves.easeInOut`. A theme retunes a role
with `defineTheme({motion: {springs, durations, curves}})`, which writes the
role's CSS variable (`--motion-springs-sheet-present: 0.6s 0.1`) only for the
roles it sets; the table's value stays the default. The animator resolves each
table spring and curve it is handed when the motion starts; code that times
something itself calls `resolveMotion(element, timing.press, 'highlightOutMs')`.
Gesture thresholds and the timings that decide who gets a touch are not roles
(`exclude`). `pnpm generate:motion-roles` regenerates the role table in the
motion docs.

## Experimental subpath

`@astryxdesign/core/motion/experimental` exposes this foundation to lab
components, outside the stable compatibility promise (`spec:AST-017` FR21): it
may change or be removed in a patch release, it is never re-exported from the
package root or an ordinary subpath, and every declaration it exposes carries
`@experimental`. It exports `createAnimator`, `animatorFor`, `useAnimator`,
`toSpring`, `solveSpring`, `rubberBand`, `rubberBandInverse`, `cubicBezier`,
`prefersReducedMotion`, `resolveMotion` and the table as the read-only `uikit` namespace. The
gestures have their own, `@astryxdesign/core/gestures/experimental`.

## Animator

```
import {createAnimator} from '../motion/animator';
import {solveSpringTowardRamp, toSpring} from '../motion/spring';
import {springs} from '../motion/uikit';

const animator = createAnimator(sheet);

// A drag writes one style per frame and never renders:
animator.set({y: offset});

// The finger lifts: spring to the detent with the release velocity (px/s).
const handle = animator.animate({y: detent}, {spring: springs.sheetDetent, velocity: {y: 1200}});

// A finger lands mid-flight: where is the sheet right now, how fast?
const y = animator.get('y', event.timeStamp);
const v = animator.getVelocity('y', event.timeStamp);
animator.stop(['y']); // freezes at the value on screen

// A throw on a scroll-like surface, with an edge:
animator.decay({x: velocityX}, {bounds: {x: {min: -maxScroll, max: 0}}});

// Any closed-form curve, here a press that keeps deepening: the target
// scale falls at 0.16/s and the platter follows it on a spring.
const ramp = solveSpringTowardRamp(toSpring(springs.contextMenuLift), {
  from: 1,
  target: 1,
  slope: -0.16,
});
animator.play({scale: {duration: 0.266, at: ramp.value, velocity: ramp.velocity}});

await handle.finished; // true if it ran to the end, false if interrupted
```

- Drives `x`, `y`, `rotate`, `scaleX`, `scaleY` (`scale` sets both) and
  `opacity`, through the individual CSS properties `translate`, `rotate`,
  `scale` and `opacity`. The element's `transform` stays the component's.
- `get` / `getVelocity` evaluate the curves; the DOM is never read.
- Promotion: every animation the animator creates, and every `set`, gives its
  channels a compositing layer in the same task (inline `will-change`, merged
  with the element's own), cleared 500 ms after the last motion. Mobile Safari
  needs it to run a curve through a blocked main thread. A pseudo-element is
  promoted through `--astryx-motion-will-change-<pseudo>` on its host; its
  style opts in with
  `willChange: 'var(--astryx-motion-will-change-before, auto)'`.
- `atRest(properties)` resolves once none of them is moving, after the last
  curve ends, whoever started it.
- `rebase({y: -shift})` moves properties at once, as a layout shift does; a
  property moving on a spring keeps its spring, velocity and target.
- `play` bakes any curve given as value and velocity functions of time (a
  spring chasing a moving target from `solveSpringTowardRamp`, a fitted UIKit
  curve) exactly like a spring.
- `animate` always starts from the presentation value with the presentation
  velocity unless a velocity is handed in, so retargeting is continuous
  (`handle.retarget(to)` keeps the call's spring).
- A call from rest gets no start time, so the browser starts it when it
  commits it, as Core Animation does: in Chromium a block before that frame
  delays the motion instead of skipping into it (WebKit starts it at the
  frame before the block). Everything the call starts shares that start
  (`handle.started`); a retarget keeps an explicit one, and `{at}` puts
  several animators on one clock.
- Reduced Motion (`prefers-reduced-motion: reduce`, design:reduced-motion):
  every `animate` and `play` is replaced and nothing moves, scales or
  springs. On a coarse primary pointer, or for a call started by a touch
  drag's release (`{touchRelease: true}`), it is an opacity-only cross-fade
  of `timing.reducedMotionCrossFadeMs` (200 ms): an entrance lands and fades
  in, an exit fades out then lands, an opacity change fades, any other move
  dips (fade out, land, fade in). Travel lands with a plain style write while
  the element is transparent, never as an animated transform. On any other
  pointer it completes at once.
  `{crossfadeAs: 'entrance'}` or `'exit'` gives a slide that changes no
  opacity its direction. No option or theme value lengthens the fade or keeps
  travel. For motion the animator does not drive, `reducedMotionFade()`
  answers the same policy, and `reducedMotion.stylex.ts` holds its CSS
  constants and the two media queries a StyleX transition spells.
- `animatorFor(element)` returns the one animator for an element, so code
  that animates it from several places (a swipe on x, a removal on y)
  composes in one `translate` track.
- `createAnimator(dialog, {pseudoElement: '::backdrop'})` drives a
  pseudo-element; with no inline style to hold it, a static filling animation
  holds its end value until the next animation replaces it.
- `useAnimator()` returns a stable `{ref, animator}`; attach `ref` to the
  element.

### How it stays on the compositor

Each curve is baked into keyframes, sampled adaptively until linear
interpolation is within 0.05 px, and played with `easing: linear` on one
start time. The element's inline style already holds the end values,
and the keyframes hold the end state for a few seconds past the curve's end;
the main thread drops the animation as soon as it runs after that end. So the
frame an animation ends needs no main thread and shows no flicker, even when
the main thread is blocked as the curve ends (WebKit's compositor otherwise
falls back to the last value its main thread committed, mid-flight).

Keyframes rather than one `linear()` easing: measured in Chromium, both are
composited and, for the same samples, equally precise; but WebKit's Core
Animation path does not accelerate an effect whose easing is `linear()` with
points (`KeyframeEffect::canBeAccelerated`) unless its newer threaded
animations are on, so on older iOS Safari a `linear()` spring would run on the
main thread. Linear segments between keyframes map directly onto Core
Animation keyframe animations.

## Math

`spring.ts` solves m·x″ + c·x′ + k·x = 0 in closed form in all three regimes:
the model behind SwiftUI's `Spring`, `CASpringAnimation` and
`UISpringTimingParameters`. A spring description stays in its source's
vocabulary (mass, stiffness and damping; duration and bounce; response and
damping ratio) and `toSpring` normalizes it, clamping overdamping to critical
as Core Animation does for every spring UIKit attaches. The tests hold it to an
independent fourth-order Runge-Kutta integration over a sweep of damping
ratios, responses and release velocities; to a port of WebKit's own spring
solver; to the WWDC23 "Animate with springs" conversion equations; and to
values read from UIKit on the iOS 26.2 simulator: `settlingDuration` for a
grid of springs and velocities, and the durations UIKit gives its spring APIs,
which the settling formula reproduces to the last digit (underdamped) or within
0.02 % (critically damped). `decay.ts` is held to a literal per-millisecond
simulation of the deceleration rate and to WWDC18's projection function;
`rubberBand.ts` to UIScrollView's overscroll measured on the simulator.
`uikit/values.test.ts` plays the table's values through this math.

## Browser proofs

`__tests__/animator.interaction.browser.spec.ts` runs on the interaction
harness: the real animator, bundled from source onto a blank fixture page, in
Chromium and WebKit on the phone profile.

- A slow spring keeps advancing on every screencast frame while the main
  thread is blocked for 1 s, and every frame sits on the analytic curve with
  one consistent time offset.
- A spring that ends inside the block keeps showing its end state. Without the
  animator's end-state hold, WebKit falls back to a mid-flight value.
- No Layout or Paint runs while it animates (Chromium trace).
- Seeked to fixed times, the engine plays the analytic curve within 0.05 px,
  with every channel on one start time.
- A finished animation leaves the element within a frame or two of the curve's
  end.
- A dialog's `::backdrop` follows the curve when seeked and holds its end
  state.
- A theme that retunes `springs.sheetPresent` changes the curve the engine
  plays for an element in its scope, and only there.

```
pnpm test:interaction packages/core/src/motion
```

Where WebKit cannot launch on the host, the harness's container script runs
it. The iOS Safari check is the same proof on the iOS simulator.

## Sources

Every value in `uikit/` carries its source next to it, as a JSDoc tag on the
entry:

```
/**
 * What the value is, in UIKit's words.
 * @source apple-docs https://developer.apple.com/documentation/…
 */
key: value,
```

Allowed source kinds:

- `@source apple-docs <developer.apple.com URL>`
- `@source wwdc <year>-<session> "<title>": <what it says>`
- `@source webkit Source/<path> <what it says>` (Apple's engine, matched to
  UIKit in its own comments; confirmed by a measurement)
- `@source measured: <app>, iOS <version>, <method>, <date>`
- `@source GUESS — <what it is based on>`

A `GUESS` or `webkit` value also names the measurement that will confirm or
replace it (`@measure M-…`, listed in MEASUREMENTS.md). An entry may carry
several sources when different parts come from different places.
`uikit/gestures.ts` carries the same information as typed fields that the
gesture system reads at run time: `{value, unit, source}` with a source of one
of the kinds above, or `{value, unit, guess, measure}` with a `measure` that
starts with its MEASUREMENTS.md ID. `uikit/uikit.test.ts` enforces all of it on
every domain file, in both forms: an unsourced value, an unknown kind, a guess
without a task, or a task missing from MEASUREMENTS.md fails the build.

Measurements come from the iOS simulator: built-in apps (Settings, Maps,
Photos, Files, Contacts, Calendar, Reminders, Safari's own chrome) or a UIKit
host app that reads the animations, recognizers and haptics UIKit attaches.
Each names its iOS version; iOS 26.2 is the reference.

### Adding a constant

1. Find the source: Apple's documentation, a WWDC session, or a measurement on
   the iOS simulator.
2. Add the entry to the domain file it belongs to, in the vocabulary of its
   source (a spring published as response and damping ratio stays
   `{response, dampingRatio}`).
3. Tag it with its `@source`. No source yet: write the best-founded `GUESS`,
   say what it is based on, add a measurement task to MEASUREMENTS.md and tag
   the entry with it.
4. When a measurement lands, replace the value, tag it
   `@source measured: …`, and drop the `@measure` tag.

## Measurements

[MEASUREMENTS.md](MEASUREMENTS.md) is the one list of UIKit reference captures:
what each value still needs from the iOS simulator, the app and gesture to
capture, the value to extract and the method. Every `@measure` ID in `uikit/`
resolves there.
