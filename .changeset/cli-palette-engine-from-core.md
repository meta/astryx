---
'@astryxdesign/cli': patch
---

[docs] The theme authoring doc shows `defineTheme({palette})` with `themePalette()` from `@astryxdesign/core/palette`. `astryx theme palette generate` and the theme editor's colors give the same output as before: the CLI now runs a copy of the palette engine and its token mapping generated from Core's source.

@josephfarina
