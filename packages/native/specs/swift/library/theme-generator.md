# Theme generator (Swift)

- Status: draft
- Relation: extends AST-082 FR10, FR18 and AST-093 FR4, and applies AST-082
  FR16 and AST-006. It is the one path by which a theme reaches Swift.

## Summary

An iOS app built with Astryx shows its own brand, not only core's default: any
Astryx theme, from a published theme package such as neutral or from the
product itself, becomes a Swift `Theme` that `.astryxTheme(.neutral)`
applies, with the same light and dark values and typeface the web uses. Every shared
token is a typed Swift member, so a misspelled token fails to compile instead
of drawing nothing. The generator runs core's own resolver, so Swift never
re-implements theme logic.

## Requirements

- **G1 — Input is a portable theme; core resolves it.** The generator is one
  function, `renderSwiftTheme(theme, options)`. Its input is a `PortableTheme`
  (name, tokens, theme-local tokens; AST-082 FR18). A `DefinedTheme` from
  `defineTheme` passes unchanged, since it is a `PortableTheme` plus a web
  part the generator ignores. Until core ships `PortableTheme`, the input type
  is `DefinedTheme`. Values come only from core's
  `resolveThemeTokens(theme, {mode})`, called once with `mode: 'light'` and
  once with `mode: 'dark'`. A theme's `[light, dark]` tuple reaches the
  generator already split, one side per mode. A `light-dark(<light>, <dark>)`
  at any depth of a value (the whole value, or inside `color-mix()`, a
  relative color, or a shadow layer) takes its first argument in light mode
  and its second in dark mode. The generator never reads `theme.tokens`
  directly and never resolves a reference itself; it converts each resolved
  CSS value to a Swift value (G7).
- **G2 — Core is read only at build time.** The generator runs at build time;
  generated Swift imports only SwiftUI and carries nothing from core at run
  time (AST-082 FR16). Until core's portable entry ships, the generator reads
  core at build time through `@astryxdesign/core/theme` and
  `@astryxdesign/core/theme/tokens`, the build-time reads AST-082 FR16 allows
  a native build script, each listed in the boundary check; once the portable
  entry ships, it reads core only through that entry.
- **G3 — One shared token type, one file per theme.**
  - `apple/Sources/Astryx/Theme/Generated/Tokens.swift` declares the typed
    token surface: `Tokens` with one member per group (`color`, `space`,
    `radius`, `size`, `font`, `shadow`), each a struct with one typed member
    per token, except `font`, whose members are the sub-groups G6 names: a
    `TypeStyleTokens` per type style and `FontFamilyTokens`, `FontSizeTokens`,
    and `FontWeightTokens` for the scales.
    It is generated from core's resolved token names, which are the same for
    every theme (G5), so it does not depend on any one theme.
  - Type names follow the Swift component API spec: unprefixed, in the
    `Astryx` module, so `Astryx.Theme.neutral` and `Theme.neutral` name the
    same value.
  - Each theme becomes `apple/Sources/Astryx/Theme/Generated/<SwiftName>Theme.swift`,
    which declares `Theme.<swiftName>` with a `Tokens` value for
    light and one for dark.
  - `<swiftName>` is the theme's `name` with a leading `astryx-` removed, in
    lower camel case (`neutral` → `neutral`, `y2k` → `y2k`, a product's
    `acme-brand` → `acmeBrand`). Core's defaults, which core resolves with no
    theme (`resolveThemeTokens(null, {mode})`), are `default`. A name that is not a valid Swift identifier, is a Swift keyword
    other than `default`, or repeats another generated theme's name fails the
    run.
  - Each file starts with a header naming the source package and the theme
    name, says "Do not edit", and names the regenerate command. The header
    never names a version, so a release that only bumps versions changes no
    generated file.
- **G4 — Output is deterministic.** The same theme and the same core produce
  byte-identical files: members sorted, numbers in their shortest exact form,
  no dates, paths, or machine details.
- **G5 — The token set is a contract.** The generator keeps these groups of
  core's resolved token names: `color-*`, `spacing-*`, `radius-*`,
  `size-element-*`, `border-width`, `font-size-*`, `font-weight-*`,
  `font-family-*`, and `text-<style>-*` for `heading-1` to `heading-6`,
  `display-1` to `display-3`, `body`, `large`, `label`, `supporting`, and
  `code`, the type styles core's Text and Heading draw, and `shadow-low`,
  `shadow-med`, and `shadow-high`, the elevations core's Card and Button draw. Core fills every shared token a
  theme leaves out, so every theme has the same shared members. Adding a group
  changes this spec, the generator, and the Swift reader in one pull request,
  together with the first component that reads it.
- **G6 — Token names map to Swift members by one rule.** A token's Swift member
  is its group and the rest of its name in lower camel case, with each `-`
  between two digits written `_`:

  | Token                                    | Member                                                                                                                                                                                                      |
  | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `color-<rest>`                           | `color.<rest>`: `color-text-primary` → `color.textPrimary`, `color-data-blue-1` → `color.dataBlue1`                                                                                                         |
  | `spacing-<n>`                            | `space.s<n>`: `spacing-4` → `space.s4`, `spacing-0-5` → `space.s0_5`                                                                                                                                        |
  | `radius-<rest>`                          | `radius.<rest>`: `radius-element` → `radius.element`                                                                                                                                                        |
  | `size-element-<rest>`, `border-width`    | `size.element<Rest>`: `size-element-md` → `size.elementMd`; `size.borderWidth`                                                                                                                              |
  | `text-<style>-<part>`                    | `font.<style>.<part>`, one `TypeStyleTokens` per style with `size`, `weight`, and `leading`: `text-body-size` → `font.body.size`, `text-heading-1-weight` → `font.heading1.weight`                          |
  | `font-family-<rest>`                     | `font.family.<rest>`: `font-family-body` → `font.family.body`                                                                                                                                               |
  | `font-size-<rest>`, `font-weight-<rest>` | `font.size.<rest>`, `font.weight.<rest>`, with a name that starts with a digit taking `s`: `font-size-2xl` → `font.size.s2xl`, `font-size-base` → `font.size.base`, `font-weight-bold` → `font.weight.bold` |
  | `shadow-<level>`                         | `shadow.<level>`: `shadow-low` → `shadow.low`                                                                                                                                                               |

  Font tokens group by kind because each type style is several tokens a
  view reads together: a view takes `font.body` whole, and a style missing its
  size, weight, or leading fails the run naming the style. Two tokens that map
  to the same member, or a member part that is a Swift keyword or does not
  start with a letter, fail the run with both token names.

- **G7 — Values are typed, and each conversion is exact or stated.** Each
  value is read in one mode after G1's `light-dark()` rule.
  - Colors are `Color` values. The generator reads hex (`#RGB`, `#RGBA`,
    `#RRGGBB`, `#RRGGBBAA`); the 148 CSS named colors and `transparent`;
    `rgb()`/`rgba()` and `hsl()`/`hsla()` in comma or space syntax; `hwb()`;
    `lab()`, `lch()`, `oklab()`, and `oklch()`; `color()` in `srgb`,
    `srgb-linear`, `display-p3`, `a98-rgb`, `prophoto-rgb`, `rec2020`,
    `xyz`, `xyz-d50`, and `xyz-d65`; `color-mix()` in any of those spaces or
    `hsl`, `hwb`, `lab`, `lch`, `oklab` (the default), and `oklch`, with
    `shorter`, `longer`, `increasing`, or `decreasing` hue; and relative
    colors (`rgb(from <color> r g b / alpha)`, the same for every function,
    and `color(from <color> <space> …)`). A channel is a number, a
    percentage of its CSS reference range, `none`, a channel keyword of a
    relative color, or `calc()`, `min()`, `max()`, or `clamp()` over those;
    a hue is a number or an angle in `deg`, `rad`, `grad`, or `turn`; alpha
    follows `/` (or a fourth comma) as a number or a percentage. Commas are
    read only where CSS allows them: in `rgb()` and `hsl()` (and their `a`
    forms), with no `none`, `rgb()` channels all numbers or all
    percentages, and `hsl()` saturation and lightness as percentages.
  - Conversion uses CSS Color 4's equations and matrices through CIE XYZ D65,
    with Bradford adaptation for D50 spaces; `rec2020` uses the BT.2020
    piecewise transfer curve, as Chromium draws it; CSS Color 4 specifies a
    2.4 gamma.
    In a color written with literal channels, `rgb()` channels clamp to
    0–255; `hsl()` and `hwb()` saturation, whiteness, and blackness clamp at
    0, and `hsl()` saturation and lightness at 100%, as browsers read them; Lab and OKLab lightness clamp to their
    range and chroma at 0. A relative color's channels do not clamp, so it
    keeps its origin's gamut. Alpha clamps to 0–1. `color-mix()` follows CSS Color 5: an omitted percentage
    is 100% minus the other (both omitted are 50% each), the pair is scaled
    to sum to 100%, a sum under 100% multiplies the result's alpha by it, a
    sum of 0% has no static form, hues are taken modulo 360° before the hue
    method applies, a `none` alpha takes the other color's alpha before
    premultiplying, channels interpolate premultiplied by alpha, and a
    `none` channel takes the other color's analogous channel (CSS Color 4's
    analogous components: reds, greens, and blues including X, Y, and Z;
    lightness, `hsl()`'s included; colorfulness; hue; and the two opponent
    axes; HWB's whiteness and blackness have none). A channel
    still missing at output is 0.
  - A color inside sRGB (every channel within 0.000075 of 0–1) is SwiftUI's
    own `Color(.sRGB, red:green:blue:opacity:)`. A color outside sRGB and
    inside Display P3 is `Color(.displayP3, red:green:blue:opacity:)` (D5). A
    color outside Display P3 is a value Swift cannot express exactly: each
    channel clips to Display P3, as Chromium draws it, and the run warns
    (G15), the warning ending "outside Display P3; clipped to match the web". Each channel and alpha rounds to the nearest of 256 steps,
    halves up, and is written as `0`, `1`, or the exact decimal of its step
    over 255 (the same `Double` as `n / 255`); the package declares no color
    initializer of its own.
  - Lengths are `CGFloat` points: `px` × 1, `rem` and `em` × 16, `pt` × 4/3,
    `pc` × 16, `in` × 96, and `cm`, `mm`, and `Q` from `in`; `calc()`,
    `min()`, `max()`, and `clamp()` over those; `thin`, `medium`, and
    `thick` as 1, 3, and 5 for `border-width` only, with no length elsewhere. A unitless number is points. An `em` is read
    against the 16-point root and warns.
  - Font weights (`font-weight-*`, `text-*-weight`) are numbers from 1 to
    1000; `normal` is 400 and `bold` 700. `bolder` (700) and `lighter` (100)
    are read against 400 and warn.
  - Line heights (`text-*-leading`) are multipliers of the font size: a
    number as is, a percentage ÷ 100, a length ÷ the same style's
    `text-<style>-size` in the same mode (so an `em` counts against that
    size and `1.5em` is 1.5), to 12 significant digits. `normal` is 1.2 and warns.
  - Font families are `[String]`, quotes removed, in the CSS stack's order.
  - Shadows are `[ShadowLayer]`, one per `box-shadow` layer in order, its
    color and lengths in either order; `none` is no layers. A drop layer is
    `x y [blur [spread]] color`; SwiftUI draws no drop spread, so a spread is
    left out and warns. An inset layer is a ring, `inset 0 0 0 <width> color`, which a
    view draws inside its border, as CSS draws an inset shadow.
  - These have no static form (G15): `currentColor`; system colors such as
    `Canvas`; percentages outside color channels and line heights; viewport
    and container units; font-relative units (`ex`, `ch`, `ic`, `cap`,
    `lh`, and their root forms); a `var()` core's resolver leaves unresolved;
    `env()` and `attr()`; CSS-wide keywords; `calc()` that adds unlike
    kinds; a `color-mix()` whose percentages add up to 0%; a shadow layer
    with no color, which draws in `currentColor`; and an offset or blurred
    inset shadow. This holds in every token, font families and shadows
    included. Such a value takes core's default or fails the run as G15
    says, its reason ending "Swift has no static value". A value outside the
    forms above, valid CSS or not, fails the run ending "the Swift theme
    generator does not read this form", so a reader gap is not reported as a
    value Swift cannot hold. A token present in one mode and missing in the other fails
    the run with the theme, mode, and token.
- **G8 — Theme-local tokens wait for a per-mode source.** A theme's local
  tokens (AST-006) are generated only once core's resolver returns them per
  mode, as it returns shared tokens; until then the generator emits none and
  reports each local token it leaves out. When generated, each value is keyed
  by its exact custom-property name (AST-006 FR3, DEC-2), with no second
  identifier and no prefix read or removed, in a map of its value's type (G7)
  for light and for dark, carried only by that theme
  (`Theme.neutral.local.dark.colors["--astryx-theme-neutral-color-status-fill-accent"]`).
  A name the theme does not declare returns `nil`, and the caller chooses
  what to draw. Only code written for that theme reads them; shared components never
  do.
- **G9 — Components read typed members.** Components read tokens only through
  the typed members (`theme.color.textPrimary`). A lookup by token name may
  exist inside the package as a fallback for wire-driven code; it is not public
  and no component uses it.
- **G10 — Font names map to SwiftUI fonts, with a system fallback.** The reader
  walks a family list in order and uses the first family the app has
  available (`UIFont(name:size:)` on iOS, `NSFont(name:size:)` on macOS, is
  not nil) as `Font.custom(_:size:relativeTo:)`, so on iOS it still scales
  with Dynamic Type. A
  generic or system name ends the walk with the system font: `-apple-system`,
  `system-ui`, `BlinkMacSystemFont`, and `sans-serif` → `.default` design;
  `ui-monospace`, `SF Mono`, `monospace` → `.monospaced`; `ui-serif`, `serif`
  → `.serif`; `ui-rounded` → `.rounded`. A list with no available family draws
  the system font. The library never bundles or downloads a font; an app that
  wants its brand typeface bundles and registers the font file itself.
- **G11 — Native intent has a reserved slot.** `Theme.native` is a
  documented member that is empty until a component reads native intent (D3).
- **G12 — Every published theme is generated, and a product's own theme can be.**
  Core's default theme and every theme package under `packages/themes/` whose
  `package.json` is not `private` has a generated file. A product generates its
  own theme by passing its theme to `renderSwiftTheme`, or through the
  package's command (`generate:swift-ios --theme <module>#<export>`).
- **G13 — The drift check covers the typed surface.** A test regenerates
  `Tokens.swift` and every committed theme file and fails when any file
  differs, when a published theme has no file, or when a file has no published
  theme. The failure names the regenerate command.
- **G14 — Generated files stay committed for now.** Swift Package Manager
  installs from a git commit and cannot run the Node generator, so generated
  files are committed beside the Swift sources until CI publishes generated
  Swift to a Swift-only branch or tag, as the package README notes.

- **G15 — Every conversion is exact, warned, or an error.**
  - An exact conversion, including G7's stated rounding, prints nothing.
  - A lossy conversion (a color outside Display P3, clipped as Chromium draws
    it; an `em` read against the root; `bolder` or `lighter` read against 400;
    a `normal` line height read as 1.2; a drop shadow's spread left out) emits
    the value and
    one warning naming the theme, mode, token, CSS value, emitted Swift
    value, and what was lost.
  - A value with no static form stops the run with an error naming the
    theme, mode, token, CSS value, and reason, unless the token is optional.
    A token is optional when core fills a default for it: core's resolver
    returns it with no theme (`resolveThemeTokens(null, {mode})`), as it does
    every G5 token. An optional token takes core's default for that mode,
    converted by G7, and warns, naming the default. A token core has no
    default for, a default with no static form, and every token of core's
    own defaults are required.
  - Warnings print after the run writes its files, one line each, starting
    `warning: `. `--strict` turns every warning into an error: the run prints
    each starting `error: `, writes no file, and exits non-zero. A product
    theme (`--theme`) gets the same treatment, and `renderSwiftTheme` takes `warnings` (a list it appends to) and `strict`; called without a list, it prints each warning to standard error, so a loss is never silent. A token's notes print once per mode, and notes from a value that failed are dropped with it, so a fallback's warning names only the failure and core's default.

## Acceptance checks

| Requirement | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1          | A theme whose resolved token differs from its raw `theme.tokens` entry (a reference) shows the resolved value in Swift. A `DefinedTheme` with web component overrides generates the same file as the same theme without them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| G2          | A source check finds no import of core in `packages/native/` outside the build-time reads AST-082 FR16 lists (the two theme entries, core's component documentation, its built-in icon names, and its locale catalogs; later only the portable entry). Generated Swift imports only SwiftUI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| G3          | `swiftc -typecheck` compiles `Tokens.swift` and every theme file together; each theme file declares one `Theme` static named as G3 says; two themes with the same name fail the run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| G4          | Generating twice, and on two CI machines, gives byte-identical output.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| G5          | Every theme's light and dark values fill every member of `Tokens`, equal to core's resolved names filtered by the G5 groups.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| G6          | Unit tests map every row of the G6 table; two tokens that collide fail with both names; a type style without its leading fails naming the style; `Tokens.swift` declares one `TypeStyleTokens` and every theme fills `font.body`, `font.display1`, and `font.heading1` as one. A Swift fixture referencing `theme.color.textPrimray` fails to compile.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| G7          | A table test converts every listed syntax to its exact 8-bit value (tolerance 0 of 255): CSS Color 4's examples `lab(29.2345% 39.3825 20.0664)`, `oklab(40.101% 0.1147 0.0453)`, and `oklch(40.101% 0.12332 21.555)` generate `#7D2329` and `lch(52.2345% 72.2 56.2)` generates `#C65D06`; `color(display-p3 1 0 0)` generates `Color(.displayP3, red: 1, green: 0, blue: 0, opacity: 1)`; `color-mix(in srgb, red, blue)` generates `#800080`. A `[light, dark]` tuple and a `color-mix()` with a nested `light-dark()` generate each side in its mode. A `20px` line height with a `16px` size generates 1.25. Neutral's `--shadow-low` generates two drop layers and an inset ring, its ring color taken per mode. `"Figtree", -apple-system, sans-serif` becomes `["Figtree", "-apple-system", "sans-serif"]`. Each G7 form with no static form fails with its reason. Generated colors are `Color(.sRGB, …)`, and a Swift test finds `Theme.default.light.color.accent` equal to `Color(.sRGB, red: 0, green: 100 / 255, blue: 224 / 255, opacity: 1)`. A relative `rgb()` over a Display P3 origin stays Display P3; a `1.5em` line height on a 14px style is 1.5; `medium` outside `border-width` fails; a `none` alpha, a missing blue mixed in Lab, and a 400° hue mix as CSS Color 4 reads them; `color-mix(in lab, hsl(0 50% none), lab(50 20 30))` generates `#8E705E` (HSL lightness carries); `hsl(120, 200%, 40%)` and `hsl(120 200% 40%)` generate `#00CC00`; `calc(4px+2px)`, `calc(1rem-2px)`, and a `"Figtree", inherit` family fail as invalid CSS; `color(rec2020 0.4 0.6 0.2)` generates `#4AA829` and `color(rec2020 0.5 0.5 0.5)` generates `#8B8B8B`, as Chromium draws them; `oklch(0.9 0.4 300)` generates Display P3 `#FB7CFF`, as Chromium draws it, and warns "outside Display P3; clipped to match the web" with its theme, mode, token, and value; `currentColor`, `--font-family-body: inherit`, and a colorless shadow layer fail ending "Swift has no static value", and `color(display-p3-linear 1 0 0)` fails ending "the Swift theme generator does not read this form". |
| G8          | Neutral's local tokens generate nothing today and each is reported; a fixture whose local tokens come back per mode generates its values keyed by their exact custom-property names in that theme's `local` maps, none in `Tokens`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| G9          | A source check finds no token lookup by string in any component.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| G10         | On iOS and macOS, a Swift test with no bundled Figtree resolves `font.family.body` to the system font and with a registered test font resolves to that font; on iOS, both scale between Large and AX5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| G11         | `Theme.native` exists, is documented, and holds no values.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| G12         | A test reads `packages/themes/*/package.json` and finds one generated file per non-private package plus `default`. A fixture product theme renders through `renderSwiftTheme`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| G13         | Editing one generated value or member name by hand fails the drift test with the regenerate command in the message.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| G14         | The README's generated-Swift note lists the generated theme files.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| G15         | `oklch(0.7 0.4 150)` emits `Color(.displayP3, red: 0, green: 0.8196078431372549, blue: 0, opacity: 1)`, clipped as Chromium draws it, and warns in light and dark with theme, mode, token, value, and that Swift value, ending "outside Display P3; clipped to match the web"; `--spacing-4: 2vw` emits core's default and warns; `currentColor` in a token core has no default for fails with theme, mode, token, value, and reason; with `--strict`, a theme that warns fails and no file is written. Without a list, `renderSwiftTheme` prints each warning to standard error; `calc(1em + 2vw)` falls back with one warning that does not mention the `em`; `calc(1em + 1em)` warns once per mode.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Decisions

- **D1 — The boundary check covers all of `packages/native/`.** The
  package-boundary check scans every folder under `packages/native/`, so a core
  import anywhere in the package is checked against AST-082 FR16, with every
  build-time read FR16 allows listed by name: the generator's two theme entries
  (G2), the contract generator's reads of core's component documentation and
  built-in icon names, and the strings generator's read of core's locale
  catalogs.
- **D2 — Shared tokens are typed from the start.** For the shared token
  surface, the generator emits typed members
  (G3, G6), not string-keyed dictionaries, so a wrong token name fails to
  compile and autocompletion lists every token. Rejected: string keys with a
  missing-token fallback, because a typo ships invisible text. A theme's local
  values are keyed by their exact names instead (G8), because AST-006 FR3
  allows no second identifier.
- **D3 — Native intent comes from `defineNativeTheme` into a reserved slot.**
  Native visual intent (durable `material`, platform entries, icons; AST-082
  FR10, FR17) comes from `defineNativeTheme`, a native theme that wraps the
  portable theme. When the first component reads `material`, the generator
  takes the native theme, reads the wrapped portable theme from it, and fills
  `Theme.native` already resolved per OS version range, so one call
  produces one file. A platform entry's icons (`{systemName}` or
  `{assetName}`, AST-082 FR17) become `Theme.icons` entries of
  `.systemName(_:)` or `.assetName(_:)`. Composing native intent inside `defineTheme` is outside
  this spec.

- **D4 — Increase Contrast is outside this spec.** Core themes have light and
  dark modes only, so the generator emits no increased-contrast values. A
  contrast mode in core is decided on its own, outside `packages/native/`.
  Until it exists, when Increase Contrast is on, components draw their borders
  and separators with `color.borderEmphasized` instead of `color.border`
  (checked by a Swift test that sets `colorSchemeContrast` to increased and
  reads the border color).

- **D5 — Colors outside sRGB stay wide.** iPhone and Mac displays are
  Display P3, and a browser on them draws an out-of-sRGB theme color in
  Display P3, so a theme color outside sRGB generates as SwiftUI's own
  `Color(.displayP3, …)`, with no Astryx initializer around it, and only a
  color outside Display P3 is clipped, as browsers draw it, with a warning (G15). Rejected: mapping every color into sRGB, because a brand
  color would then draw duller in Swift than on the web on the same device.

## Current state

- `packages/native/apple/` is one Swift package with the `AstryxNative`
  product (generated contract types) and the `Astryx` product (SwiftUI views).
- Generated themes write every color with SwiftUI's own initializer; the
  `Astryx` module adds no `Color` initializer.
- The generator writes the typed `Tokens.swift` and one theme file for core's
  defaults and each published theme package (`Theme.default`, `Theme.neutral`,
  and so on), under `apple/Sources/Astryx/Theme/Generated/`. Font tokens are
  grouped by type style (`font.body`, `font.code`, `font.display1`–`3`,
  `font.heading1`–`6`, `font.label`, `font.large`, `font.supporting`) and by
  scale (`font.family`, `font.size`, `font.weight`).
- Core's `resolveThemeTokens` returns shared tokens per mode and no local
  tokens; neutral declares local tokens, stored as `light-dark(…)` strings.
- Published theme packages: butter, chocolate, gothic, matcha, neutral, stone,
  y2k (probe is private). Their raw values use `oklch()` and `color-mix()` outside the G5 groups
  (component styles), neutral's shadows use `oklch()` with an inset ring, and
  `color-mix()` appears inside the groups only in
  `--color-syntax-added` and `--color-syntax-removed`.
- Core's resolver substitutes `var()` references between tokens and
  evaluates `color-mix(in srgb, …)` over the colors it parses; the generator
  converts every other G7 form itself.
- Every published theme generates with no warning, and every color in them is
  inside sRGB.

## Open questions

None.
