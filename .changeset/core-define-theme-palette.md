---
'@astryxdesign/core': patch
---

[feat] `defineTheme({palette})`: a theme can take its color tokens from a few seeds. `themePalette({accent, neutral, success, warning, danger, info, vibrancy, recipe})` from the new `@astryxdesign/core/palette` entry generates the palette and maps it to the color tokens the CLI theme editor sets for the same color settings (surfaces, text, borders, icons, the accent and the status colors); explicit `tokens` and `components` still win, one by one. A palette that names no recipe runs `astryx-oklch-v1`, so its generated shades never change with an upgrade; secondary text it lifts on a tinted part is measured against the installed Core's default tokens and follows them. Only apps that import `@astryxdesign/core/palette` ship the generator. The entry also exports `generateTonalPalette()` and its types.

@josephfarina
