# Motion

Internal motion foundation for the touch presentations of core components: the
UIKit constants table (every spring, duration, deceleration rate, rubber-band
constant, curve and gesture threshold a touch presentation uses, each with its
source) and the spring, decay, rubber-band and projection math UIKit uses.
Nothing here is exported from the package entry point. Core's motion and
gesture modules read the table by path; components read touch motion through
its internal motion roles (`roles.ts`), so each keeps its measured value; no
shipped component reads the roles yet.

## Files

| File                  | What it is                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `uikit/`              | THE constants table: every spring, duration, deceleration rate, rubber-band constant and curve, with its source.        |
| `uikit/springs.ts`    | Interaction springs (navigation, sheets, alerts, menus, controls, keyboard, banners) and the SwiftUI / UIKit presets.   |
| `uikit/scroll.ts`     | UIScrollView: deceleration rates, rubber band, bounce-back spring, paging, `delaysContentTouches`, scroll to top.       |
| `uikit/timing.ts`     | Non-spring clocks and curves: press highlight, Core Animation's named curves, keyboard, Reduced Motion cross-fade.      |
| `uikit/navigation.ts` | UINavigationController: push velocity, parallax, dimming, transition clock, interactive pop finish rule.                |
| `uikit/gestures.ts`   | Gesture recognizer thresholds, the velocity filter and haptic stand-ins, as `{value, unit}` entries (sources in JSDoc). |
| `MEASUREMENTS.md`     | The UIKit reference captures each unconfirmed value still needs.                                                        |
| `spring.ts`           | Closed-form damped spring, every Apple parameterization, settling duration, a spring chasing a moving target.           |
| `decay.ts`            | UIScrollView's momentum coast.                                                                                          |
| `rubberBand.ts`       | UIScrollView's resistance past an edge, and its inverse.                                                                |
| `projection.ts`       | Release targets: the rest point nearest the projected coast; paging.                                                    |

Component-specific values (a sheet's detents, a switch's geometry, a context
menu's timeline) live in a domain file per component, `uikit/<component>.ts`,
under the same rules.

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
