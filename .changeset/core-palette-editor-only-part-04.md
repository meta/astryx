---
'@astryxdesign/core': patch
---

[chore] `@astryxdesign/core/palette`: the theme editor's look rules (the category and chart colors a look grows) live in their own module, which the editor passes to the palette mapping. `themePalette()` and `defineTheme({palette})` output is unchanged, and an app that imports only `themePalette()` ships none of these rules.

@josephfarina
