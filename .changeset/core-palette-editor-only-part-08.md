---
'@astryxdesign/core': patch
---

[chore] `@astryxdesign/core/palette`: the theme editor's look rules (a tinted gray's primary ink, status fills checked for color-blind readers, accent text on a selected tint, and a coloured card's own secondary text left to the card, which a tinted gray no longer lifts) live in the editor's own module, which the editor passes to the palette mapping. `themePalette()` and `defineTheme({palette})` output is unchanged, and an app that imports only `themePalette()` ships none of these rules.

@josephfarina
