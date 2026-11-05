# Augmentable variants (Swift)

- Status: draft
- Relation: applies the native form of the AST-082 FR4 rule for augmentable
  props (`docs/specs/AST-082-native-first-surfaces/spec.md`, FR4 as amended) (a string-backed value with built-in constants, extended by the theme
  generator, that decodes any name and draws an unknown name in the base look)
  to Swift, and extends `packages/native/specs/swift/library/theme-generator.md`.
  Native style data comes from `defineNativeTheme` platform entries (AST-082
  FR10, FR18; AST-093 FR4).

## Summary

A brand that adds its own button or badge variant gets the same variant name on
iOS: an iOS developer writes `Button("Save", variant: .primaryMuted)`, it
compiles because the theme declares it, and the person using the app sees it
styled as the brand's native theme defines it. A variant name nothing styles
draws the component's base look, with no value style, instead of failing.

## Requirements

- **V1 — An augmentable prop is an open, string-backed type.** For every prop
  the platform's contract keeps that the core contract marks augmentable, the contract generator emits a
  `struct <Name><Prop>: RawRepresentable, Hashable, Codable, Sendable,
ExpressibleByStringLiteral` holding the web value as its raw string, instead
  of a closed `enum`. Each built-in value is a static constant named by the
  theme generator's name rule (`.primary`, `.ghost`); a name that is a Swift
  keyword is written in backticks, so Card's built-in `default` is
  `` .`default` ``. Decoding accepts any
  string, so a value the app has no constant for still decodes; the wire
  encodes and decodes the raw string unchanged. Code never switches over every
  value.
- **V2 — Each theme's added values become static members.** For each
  augmentable axis, the theme generator collects the values a theme adds and
  emits each one as a static member in an extension
  (`extension ButtonVariant { public static let primaryMuted: ButtonVariant = "primary-muted" }`).
  A value is declared once per generation run, however many themes add it, in a
  generated `Variants.swift` beside the theme files, and never when it is a
  built-in. A product's run skips values the package already declares. A
  Swift keyword is written in backticks, as in V1. A value whose Swift name
  collides with another fails the run with both values.
- **V3 — Native style data comes from platform entries.** A value's native
  style comes from the native theme's platform entries for the platform being
  built (`platforms.ios` on iOS, `platforms.macos` on macOS). In an entry's
  `components`, a target holds, beside its own style keys, a key
  `'<axis>:<value>'` whose value is that value's style map
  (`components.button['variant:primary-muted'] = {backgroundColor: …}`); the
  `PlatformEntry.components` type allows that nested map. Each theme file keeps
  every such entry with its platform, `minVersion`, and `maxVersion`, and its
  style per mode as typed data keyed by the raw value: colors (foreground,
  background, border), border width, corner radius, font family, size, and
  weight, and padding. Values are resolved per mode with references to tokens
  replaced by the token's value (theme generator G1, G7). At run time a value's
  style is chosen by AST-082 FR10's entry rule: only entries for the running
  platform whose range holds the running OS version apply, and a later
  matching entry replaces an earlier one. The theme's web component overrides
  are never read. A style key Swift does not draw is reported and left out; a
  value in a drawn key that Swift cannot read fails the run.
- **V4 — Components look style up by name.** A component reads its style for an
  augmentable prop from the theme in the environment, by raw value. A built-in
  value always has its built-in look, which the theme's platform entry may
  restyle. A value with no built-in look that no applying entry styles draws
  the component's base look, as AST-082 FR4 says and as the web does: the
  component with no value style at all, not the look of another value. A
  platform entry's style for the component's own target, not for a value,
  still applies. A development build logs that fallback once, naming the
  component, prop, and value.
- **V5 — Accessibility does not depend on the variant.** A custom value changes
  only what V3 carries: paint, shape, font, and padding, never behavior. Name,
  role, and state come from the core contract, as for built-ins.

## Acceptance checks

| Requirement | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1          | The generated `ButtonVariant` is a struct with every built-in as a static constant; Card's built-in `default` generates as `` .`default` `` and compiles; a wire node with `"variant": "primary-muted"` decodes and re-encodes unchanged, with or without a constant for it.                                                                                                                                                                                                |
| V2          | A fixture theme adding `variant:primary-muted` generates `ButtonVariant.primaryMuted`; two themes adding it declare it once; a compile test with `Button("x", variant: .primaryMuted) {}` type-checks; `variant:class` generates as `` .`class` ``; `variant:primary-muted` and `variant:primary_muted` in one run fail with both values.                                                                                                                                   |
| V3          | A fixture native theme whose `platforms.ios` entry styles `variant:primary-muted` generates its light and dark background; a later `platforms.ios` entry with `minVersion` replaces it only on OS versions in its range; a macOS build reads `platforms.macos` and not `platforms.ios`; a `var(--color-accent)` reference generates the accent's value; a `transition` key is reported and absent; a web `components` override for the same value changes nothing in Swift. |
| V4          | Under neutral, `.primary` and `.ghost` Buttons draw their built-in looks with no warning; an added variant nothing styles draws the Button with no value style, not the default variant's look, and logs one development warning; when an applying `platforms.ios` entry styles the `button` target itself, that unstyled added variant draws with it. A Heading with an added `type` nothing styles draws with no type style.                                              |
| V5          | Accessibility assertions for a custom variant equal those for the default variant.                                                                                                                                                                                                                                                                                                                                                                                          |
| Drift       | The theme generator's drift check regenerates `Variants.swift` and each theme's style data and fails on any difference.                                                                                                                                                                                                                                                                                                                                                     |

## Current state

- Generated contracts declare every closed set, including visual axes, as a
  closed `enum` (`ButtonVariant`, `BadgeVariant`).
- `PlatformEntry.components` is flat today: a target maps to one style map,
  with no `'<axis>:<value>'` keys.
- Published themes style values on augmentable axes in their web component
  overrides (for example butter's `variant:muted`); no published theme has a
  native theme with platform entries, and no Swift theme carries style data
  for any component.

## Open questions

None.
