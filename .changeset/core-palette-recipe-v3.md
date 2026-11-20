---
'@astryxdesign/core': patch
---

[feat] `@astryxdesign/core/palette`: `themePalette()` and `generateTonalPalette()` also take the `astryx-oklch-v3` recipe (v2, with a dusty seed's pale tints kept at or below its own chroma), and the entry exports `PALETTE_RECIPE_V3` and `PALETTE_RECIPE_NEWEST`. A palette that names no recipe still runs `astryx-oklch-v1`, and v1 and v2 draw what they shipped with.

@josephfarina
