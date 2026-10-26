# Motion

Internal motion foundation for the touch presentations of core components. It
starts with the UIKit constants table: every spring, duration, deceleration
rate, rubber-band constant, curve and gesture threshold a touch presentation
uses, each with its source. Nothing here is exported from the package entry
point. Core's motion and gesture modules read it by path; components take
touch motion from the theme's motion roles (`spec:AST-094` FR4), not from
this table.

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

Component-specific values (a sheet's detents, a switch's geometry, a context
menu's timeline) live in a domain file per component, `uikit/<component>.ts`,
under the same rules.

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
