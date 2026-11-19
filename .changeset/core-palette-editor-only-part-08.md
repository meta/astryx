---
'@astryxdesign/core': patch
---

[chore] `@astryxdesign/core/palette`: the theme editor's look rules (a tinted gray's primary ink, status fills checked for color-blind readers, accent text on a selected tint, and a coloured card's own secondary text left to the card, which a tinted gray no longer lifts) run behind an editor-only option of the palette mapping. `themePalette()` and `defineTheme({palette})` output is unchanged.

@josephfarina
