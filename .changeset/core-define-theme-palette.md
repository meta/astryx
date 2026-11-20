---
'@astryxdesign/core': patch
---

[feat] `defineTheme({palette})`: a theme can take its color tokens from a few seeds. `themePalette({accent, neutral, success, warning, danger, info, vibrancy, recipe})` from the new `@astryxdesign/core/palette` entry generates the palette and maps it to the color tokens the CLI theme editor sets for the same color settings (surfaces, text, borders, icons, the accent and the status colors); explicit `tokens` and `components` still win, one by one. A palette that names no recipe runs `astryx-oklch-v1`. With a `neutral` seed, a pinned recipe keeps the generated shades across upgrades. Without one, the surfaces are Core's defaults, so shades picked by contrast against them follow the installed Core, as does secondary text lifted on a tinted part. Only apps that import `@astryxdesign/core/palette` ship the generator. The entry also exports `generateTonalPalette()` and its types.

@josephfarina
