# Motion

Internal motion foundation for the touch presentations of core components: the
UIKit constants table (every spring, duration, deceleration rate, rubber-band
constant, curve and gesture threshold a touch presentation uses, each with its
source), the spring, decay, rubber-band and projection math UIKit uses, and a
compositor animator that plays it. Nothing here is exported from the package
entry point. Core's motion and gesture modules read the table by path;
components read touch motion through its internal motion roles (`roles.ts`),
so each keeps its measured value; no shipped component reads the roles yet.

## Files

| File                                             | What it is                                                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uikit/`                                         | THE constants table: every spring, duration, deceleration rate, rubber-band constant and curve, with its source.                                                     |
| `uikit/springs.ts`                               | Interaction springs (navigation, sheets, alerts, menus, controls, keyboard, banners) and the SwiftUI / UIKit presets.                                                |
| `uikit/scroll.ts`                                | UIScrollView: deceleration rates, rubber band, bounce-back spring, paging, `delaysContentTouches`, scroll to top.                                                    |
| `uikit/timing.ts`                                | Non-spring clocks and curves: press highlight, Core Animation's named curves, keyboard, Reduced Motion cross-fade.                                                   |
| `uikit/navigation.ts`                            | UINavigationController: push velocity, parallax, dimming, transition clock, interactive pop finish rule.                                                             |
| `uikit/gestures.ts`                              | Gesture recognizer thresholds, the velocity filter and haptic stand-ins, as `{value, unit}` entries (sources in JSDoc).                                              |
| `roles.ts`                                       | The internal motion roles: the springs, durations and curves `spec:AST-094` FR4 names, registered by the shared tables, and a role's CSS form read back.             |
| `roleValue.ts`                                   | A role's CSS form, written: a spring's duration and bounce, a duration in ms, a curve's `cubic-bezier()`.                                                            |
| `resolveMotion.ts`                               | A role's value: its table value, as the per-role tables stay internal (`spec:AST-094` DEC-15).                                                                       |
| `MEASUREMENTS.md`                                | The UIKit reference captures each unconfirmed value still needs.                                                                                                     |
| `spring.ts`                                      | Closed-form damped spring, every Apple parameterization, settling duration, a spring chasing a moving target.                                                        |
| `decay.ts`                                       | UIScrollView's momentum coast.                                                                                                                                       |
| `coast.ts`                                       | A release's momentum curves for `animator.decay`: the coast, the edge spring, a release past an edge.                                                                |
| `rubberBand.ts`                                  | UIScrollView's resistance past an edge, and its inverse.                                                                                                             |
| `projection.ts`                                  | Release targets: the rest point nearest the projected coast.                                                                                                         |
| `resolveSnapPoint.ts`                            | Release policy: the snap point a release lands on (flick, back-out cancel, step limit), on `selectSnapPoint`. Internal.                                              |
| `selectPage.ts`                                  | Paging: at most one page per release, on `resolveSnapPoint`.                                                                                                         |
| `bezier.ts`                                      | Cubic-bézier timing functions (Core Animation's named curves).                                                                                                       |
| `animator.ts`                                    | Compositor animator: springs, coasts and any closed-form curve compiled to Web Animations, read back analytically.                                                   |
| `reducedMotionPlan.ts`                           | The animator's Reduce Motion planner: what one call becomes, a cross-fade whose travel lands while transparent or at once.                                           |
| `__tests__/animator.interaction.browser.spec.ts` | Browser proofs on the interaction harness (Chromium and WebKit): busy main thread, end state through a block, no Layout / Paint, seeked curves, a dialog's backdrop. |

Component-specific values (a sheet's detents, a switch's geometry, a context
menu's timeline) live in a domain file per component, `uikit/<component>.ts`,
under the same rules.

## Motion roles

The motion roles are the springs, durations and curves `spec:AST-094` FR4
names for their use (`springs.settle`, `timing.stateChangeMs`,
`timing.curves.move`, …): a shared table lists them when it registers
(`roles`), and every other value, a component's measured spring included, is
a plain constant. The per-role tables stay internal (`spec:AST-094` DEC-15): a
role plays its table value, and nothing reads its CSS variable
(`--motion-springs-settle`), so no page or theme style sets a role. A table's
roles exist once its `register<Name>Table()` has run: the animator registers
the Reduce Motion fade's curve, and code that plays the shared springs calls
`registerSpringsTable()` before its first motion. The animator resolves each
role it is handed when the motion starts; code that times something itself
calls `resolveMotion(element, timing, 'stateChangeMs')`. Gesture thresholds and
the timings that decide who gets a touch are not roles.

## Animator

```
import {createAnimator} from '../motion/animator';
import {coast} from '../motion/coast';
import {solveSpringTowardRamp, toSpring} from '../motion/spring';
import {resolveMotion} from '../motion/resolveMotion';
import {registerSpringsTable, springs} from '../motion/uikit';

// Once, so the springs are registered as their roles:
registerSpringsTable();

const animator = createAnimator(sheet);
// The animator plays a motion role (spec:AST-094 FR4), its table value, as the
// per-role tables stay internal (DEC-15); math on a spring reads the role with
// resolveMotion.
const spring = springs.settle;

// A drag writes one style per frame and never renders:
animator.set({y: offset});

// The finger lifts: spring to the detent with the release velocity (px/s).
const handle = animator.animate({y: detent}, {spring, velocity: {y: 1200}});

// A finger lands mid-flight: where is the sheet right now, how fast?
const y = animator.get('y', event.timeStamp);
const v = animator.getVelocity('y', event.timeStamp);
animator.stop(['y']); // freezes at the value on screen

// A throw on a scroll-like surface, with an edge (coast.ts builds the curves):
animator.decay(coast(animator, {x: velocityX}, {bounds: {x: {min: -maxScroll, max: 0}}}));

// Any closed-form curve, here a press that keeps deepening: the target
// scale falls at 0.16/s and the platter follows it on a spring. Press
// feedback has no fade of its own, so it is skipped under Reduce Motion.
if (animator.reducedMotion() === 'off') {
  const ramp = solveSpringTowardRamp(toSpring(resolveMotion(sheet, springs.quickChange)), {
    from: 1,
    target: 1,
    slope: -0.16,
  });
  animator.play({scale: {duration: 0.266, at: ramp.value, velocity: ramp.velocity}});
}

await handle.finished; // true if it ran to the end, false if interrupted
```

- Drives `x`, `y`, `rotate`, `scaleX`, `scaleY` (`scale` sets both) and
  `opacity`, through the individual CSS properties `translate`, `rotate`,
  `scale` and `opacity`. The element's `transform` stays the component's.
- `get` / `getVelocity` evaluate the curves; the DOM is never read.
- Promotion: every animation the animator creates, and every `set`, gives its
  channels a compositing layer in the same task (inline `will-change`, merged
  with the element's own), cleared 500 ms after the last motion.
  `set(values, {promote: false})` writes without one, for a one-off switch
  that must not give its element a layer. Mobile Safari
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
  commits it, as Core Animation does: a block before that frame delays the
  motion instead of skipping into it. WebKit dates the start at the frame
  before the block, so when the task that created the animations (a
  presented call's second frame) runs on over two frames, the start moves to
  the call's first read after it, with every call of that task. Everything
  the call starts shares that start
  (`handle.started`); a retarget keeps an explicit one, and `{at}` puts
  several animators on one clock. `{start: 'commit'}` lets the browser date
  a retarget too; `{start: 'presented'}` waits two frames, until the
  element at rest has been presented. `handle.curve(property)` is the curve
  a call plays, for a companion to follow. `{additive: true}` retargets the
  way UIKit does: the old curve keeps going and the change is added on top,
  in one animation.
- Reduced Motion (`prefers-reduced-motion: reduce`, design:reduced-motion):
  every `animate` and `play` is replaced and nothing moves, scales or
  springs. On a coarse primary pointer, or for a call started by a touch
  drag's release (`{touchRelease: true}`), it is an opacity-only cross-fade
  of `timing.reducedMotionCrossFadeMs` (200 ms): an entrance from 0 lands and
  fades in, an exit to 0 fades out then lands, an opacity change fades, any
  other move dips (fade out, land, fade in). Travel lands with a plain style write while
  the element is transparent, never as an animated transform. On any other
  pointer it completes at once.
  `{crossfadeAs: 'entrance'}` or `'exit'` gives a slide that changes no
  opacity its direction. No option or theme value lengthens the fade or keeps
  travel. For motion the animator does not drive, `reducedMotionFade()`
  answers the same policy, and `reducedMotion.stylex.ts` holds its CSS
  constants and the two media queries a StyleX transition spells.
  A decay's momentum keeps its motion under Reduce Motion: momentum that
  continues a throw is direct movement (DR2, DEC-2). A curve marked
  `isTransition` (a coast's spring back from past an edge), like a spring a
  component starts on release toward a target it picks, plays through the
  Reduce Motion policy: a cross-fade on a coarse pointer or after a touch
  release (`decay(curves, {touchRelease: true})`), at once elsewhere.
- `animatorFor(element)` returns the one animator for an element, so code
  that animates it from several places (a swipe on x, a removal on y)
  composes in one `translate` track.
- `createAnimator(dialog, {pseudoElement: '::backdrop'})` drives a
  pseudo-element; with no inline style to hold it, a static filling animation
  holds its end value until the next animation replaces it, while the
  pseudo-element exists. A dialog's `::backdrop` is made again each time the
  dialog opens, so a presentation `set`s its starting value right after
  `showModal()`, in the same task (a `set` before it lands on the backdrop
  the open replaces).

### How it stays on the compositor

Each curve is baked into keyframes on a 30 Hz grid, refined until linear
interpolation is within each channel's tolerance (`SAMPLE_TOLERANCE`, a
quarter pixel for a move), and played with `easing: linear` on one start
time. The element's inline style holds the
value the curve starts from, where the element is, never where it is going;
the keyframes hold the end state for a minute past the curve's end
(`END_HOLD_MS`), and the main thread retires a finished animation as soon as
it runs after that end, writing the end values inline in the same task. So the
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
damping ratio) and `toSpring` normalizes it. A mass, stiffness and damping
description that does not allow overdamping is clamped to critical, as Core
Animation does for every spring UIKit attaches. The tests hold it to an
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
- Seeked to fixed times, the engine plays the analytic curve within the
  sampling tolerance, with every channel on one start time.
- A finished animation leaves the element within a frame or two of the curve's
  end.
- A dialog's `::backdrop` follows the curve when seeked and holds its end
  state.
- A scope that sets `springs.settle`'s variable changes nothing: the per-role
  tables stay internal (DEC-15), so the engine plays the table's spring there
  too.

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
The sources are documentation and stay out of the bundle: no value carries
them, `uikit/gestures.ts` included (its entries ship only `{value, unit}`).
`uikit/uikit.test.ts` enforces all of it on every domain file: an unsourced
value, an unknown kind, a guess without a task, a task missing from
MEASUREMENTS.md, or a source in a value fails the build.

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
