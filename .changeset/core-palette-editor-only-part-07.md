---
'@astryxdesign/core': patch
---

[chore] `@astryxdesign/core/palette`: the theme editor's look rules (code colors, the code background and the overlay scrim) live in the editor's own module, which the editor passes to the palette mapping. `themePalette()` and `defineTheme({palette})` output is unchanged, and an app that imports only `themePalette()` ships none of these rules.

@josephfarina
