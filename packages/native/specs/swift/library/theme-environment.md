# Theme environment (Swift)

- Status: draft
- Relation: extends AST-093 FR4 and AST-082 FR10, FR11; builds on
  `packages/native/specs/swift/library/theme-generator.md` (the `Theme` and
  `Tokens` it generates, and its font family reader) and
  `packages/native/specs/swift/library/component-api.md` (names).

## Summary

In an app built with Astryx, the system's own controls and Astryx components
match, and the person's system settings are honored everywhere: dark mode,
Increase Contrast, text size, Reduce Motion, Reduce Transparency, Bold Text,
and right-to-left all come from SwiftUI's own environment. Inside an Astryx
theme, stock SwiftUI controls take the theme's accent as their tint wherever
it stays readable, and otherwise keep their own colors. Astryx adds no second
settings system for an app to keep in step.

## Requirements

- **E1 — Settings are read from SwiftUI, never duplicated.** Components and the
  theme read these environment values and Astryx offers no API of its own for
  any of them:

  | SwiftUI value                     | What Astryx does with it                                                                                                                                                                                                                                                                                  |
  | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `colorScheme`                     | Chooses the theme's light or dark tokens, so `.preferredColorScheme(_:)` and the system setting drive the mode, except inside a single-mode theme, which sets its subtree's `colorScheme` (E2)                                                                                                            |
  | `colorSchemeContrast`             | When increased, borders and separators use `color.borderEmphasized` instead of `color.border`                                                                                                                                                                                                             |
  | `dynamicTypeSize`                 | Scales text, through text-style-relative fonts, and the metrics beside text, through `@ScaledMetric`                                                                                                                                                                                                      |
  | `accessibilityReduceMotion`       | Movement becomes a cross-fade or no animation                                                                                                                                                                                                                                                             |
  | `accessibilityReduceTransparency` | Translucent surfaces become opaque                                                                                                                                                                                                                                                                        |
  | `layoutDirection`                 | Leading and trailing follow it                                                                                                                                                                                                                                                                            |
  | `legibilityWeight`                | Bold Text: system and text-style fonts follow it by themselves; a custom face from the theme's family list is drawn heavier when it is `.bold`: ultra light → thin, thin → light, light → regular, regular → semibold, medium → semibold, semibold → bold, bold → heavy, heavy → black, black stays black |

- **E2 — The theme writes SwiftUI's own values where a native equivalent
  exists.** `.astryxTheme(_:)` sets, for the subtree, in the current mode:

  | SwiftUI value | From the theme                                                                                                                                 |
  | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
  | `.tint(_:)`   | `color.accent`, in a mode where white meets 3:1 against it, because stock controls draw white on their tint; the system tint in any other mode |

  A theme whose page ground, card ground, primary text, and accent are the same
  in light and dark (a single-mode theme, such as Gothic) also sets its subtree's `colorScheme` to the mode its page ground
  belongs to, dark for a dark ground, so stock controls inside draw that
  appearance on its grounds.

  So stock SwiftUI controls (`Toggle`, `Picker`, `ProgressView`, `Menu`,
  `List`, `Slider`, `Link`) draw with the brand's accent wherever it stays
  legible. The theme affects stock SwiftUI controls only through the tint and
  writes no foreground style: an inherited one would override stock controls'
  own label colors, turning a link into plain text and a prominent button's
  white label dark. Plain stock text keeps the system's primary color;
  Astryx's own text uses the theme's. (Decided by cixzhang, 2026-10-25.)
  Whether the theme also sets the default font is OQ1. Theme values with no SwiftUI environment equivalent are read by
  Astryx components and Astryx's SwiftUI styles (corner radius, spacing,
  element heights, borders, and backgrounds), and an app reads spacing for its
  own SwiftUI stacks from the typed tokens (`theme.space.s4`). Control size has no clean mapping: Astryx sizes are a per-
  component prop, so the theme sets no `controlSize`.

- **E3 — The mode always follows SwiftUI.** A token value is chosen from the
  environment's `colorScheme` where it is read, so a subtree with its own
  `.preferredColorScheme` or `.environment(\.colorScheme, …)` gets that mode's
  tokens.
- **E4 — No modifier still means the platform's settings.** Without
  `.astryxTheme(_:)`, components use core's default theme and still follow
  `colorScheme` and every E1 value; only E2's writes are absent.
- **E5 — Subtrees can change theme.** `.astryxTheme(_:)` on a subtree replaces
  the theme for that subtree only, including E2's writes.
- **E6 — The theme is one environment value.** The theme travels as a single
  environment value declared with `@Entry`; components read it with
  `@Environment` and never through a singleton.

## Acceptance checks

| Requirement | Check                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1, E3      | A view test with only `.preferredColorScheme(.dark)` (no other Astryx setting) draws an Astryx component with dark tokens; with `colorSchemeContrast` increased, a Card draws `color.borderEmphasized`. With `legibilityWeight` set to `.bold`, an Astryx Text in butter's registered body face at regular weight resolves to semibold, and at bold to heavy.                      |
| E2          | A stock SwiftUI `Toggle` inside `.astryxTheme(.butter)` in light draws butter's accent, and in dark, where butter's pale accent fails 3:1 against white, the system tint; a stock `Link` and a borderless `Button` draw their labels in the tint, and a prominent `Button` keeps its white label; under `.astryxTheme(.gothic)` in a light appearance, a stock surface draws dark. |
| E4          | With no `.astryxTheme(_:)`, an Astryx component under `.preferredColorScheme(.dark)` draws core's default dark tokens.                                                                                                                                                                                                                                                             |
| E5          | A subtree with `.astryxTheme(.neutral)` inside `.astryxTheme(.butter)` draws neutral's accent, and its stock `Toggle` does too.                                                                                                                                                                                                                                                    |
| E6          | A source check finds no static or singleton theme state; the environment key is declared with `@Entry`.                                                                                                                                                                                                                                                                            |

## Current state

- `packages/native/apple` has the `Astryx` product: the `Theme` and `Tokens`
  types, the `.astryxTheme(_:)` modifier, which sets the tint and a
  single-mode theme's color scheme, and SwiftUI components that read the theme
  from the `astryx` environment value.

## Open questions

- **OQ1 — Should the theme set the default font for all text in its subtree?**
  It brands stock SwiftUI text, and it also changes text an app draws itself.
  Recommendation: set it, because a theme's typeface is part of its identity
  and an app can still set its own `.font(_:)` on any view.
