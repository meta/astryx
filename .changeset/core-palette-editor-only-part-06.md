---
'@astryxdesign/core': patch
---

[chore] `@astryxdesign/core/palette`: the theme editor's look rules (a base theme's own text and fill pairs kept readable for the look's colors, and hues leaned toward the accent and neutral) live in the editor's own module, which the editor passes to the palette mapping. `themePalette()` and `defineTheme({palette})` output is unchanged, and an app that imports only `themePalette()` ships none of these rules.

@josephfarina
