# Themes

Ready-made theme packages for Astryx. A theme is a CSS custom property override
layer: install one, pass its built object to `Theme`, and import its
`theme.css`. See the [core Quick Start](../core/README.md#quick-start) for the
full setup. To create your own theme, install `@astryxdesign/cli` and run
`astryx docs theme`.

| Theme                            | Package                         | Style                                                                                                                      |
| -------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [Butter](butter/README.md)       | `@astryxdesign/theme-butter`    | Golden buttery surfaces with blue accents; Sarina for display type, Outfit for headings and body.                          |
| [Chocolate](chocolate/README.md) | `@astryxdesign/theme-chocolate` | Warm chocolate and cozy beige; Fraunces for headings and Albert Sans for body text.                                        |
| [Gothic](gothic/README.md)       | `@astryxdesign/theme-gothic`    | Dark-only atmospheric theme with deep blue-gray surfaces and pastel categorical accents; Manufacturing Consent and Fustat. |
| [Matcha](matcha/README.md)       | `@astryxdesign/theme-matcha`    | Earthy green palette; Playwrite US Trad for headings and DM Sans for body text.                                            |
| [Neutral](neutral/README.md)     | `@astryxdesign/theme-neutral`   | Muted, minimal aesthetic with Figtree typography.                                                                          |
| [Stone](stone/README.md)         | `@astryxdesign/theme-stone`     | Warm stone and slate tones; Montserrat for headings and Figtree for body text.                                             |
| [Y2K](y2k/README.md)             | `@astryxdesign/theme-y2k`       | Playful Y2K pop with a soft periwinkle body, charcoal accent, holographic categorical colors, Poppins, and Crimson Text.   |

`@astryxdesign/theme-probe` is a private, generated test fixture that styles every
declared theming target for the visual gate. It is never published and is not a
theme to use in an app.

A theme's specification record lives beside its package as
`<theme>/<theme>.spec.md`; [`docs/themes/`](../../docs/themes/README.md) is the
guide and index.
