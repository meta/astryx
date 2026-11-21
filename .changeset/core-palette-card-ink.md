---
'@astryxdesign/core': patch
---

[feat] `@astryxdesign/core/palette`: `themePalette()` no longer lifts the secondary text of a coloured card (`variant:<color>`): that text is the card's own ink, which the base theme draws for its fill. Its `components` output leaves card variants out.

@josephfarina
