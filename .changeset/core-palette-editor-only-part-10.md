---
'@astryxdesign/core': patch
---

[chore] `@astryxdesign/core/palette`: the theme editor's look rules (text on dark surfaces, `--color-on-dark`, tinted with a tinted gray) live in the editor's own module, which the editor passes to the palette mapping. `themePalette()` and `defineTheme({palette})` output is unchanged, and an app that imports only `themePalette()` ships none of these rules.

@josephfarina
