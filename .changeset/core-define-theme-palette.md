---
'@astryxdesign/core': patch
---

[feat] `defineTheme({palette})`: a theme can take every color token from a few seeds. `themePalette({accent, neutral, success, warning, danger, info, vibrancy, recipe})` from the new `@astryxdesign/core/palette` entry generates the palette and maps it to the color tokens as the CLI theme editor does (surfaces, text, borders, icons, the accent, the status colors, and the category, chart and code colors that follow the look); explicit `tokens` and `components` still win, one by one. A palette that names no recipe runs `astryx-oklch-v1`, so its colors never change with an upgrade. Only apps that import `@astryxdesign/core/palette` ship the generator. The entry also exports `generateTonalPalette()` and its types.

@josephfarina
