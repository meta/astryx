---
'@astryxdesign/cli': patch
---

[feat] Palette recipe `astryx-oklch-v3`: v2, and a dusty seed's palest tints (shade 90 and paler) stay at or below its own chroma even where the gamut is wide, so a muted olive gives an earthy tint instead of chartreuse. Up to shade 70 a ramp is drawn as v2 draws it; v3 changes shades 75 and paler. The theme editor names v3 for a new palette. `astryx-oklch-v2` draws exactly what it first shipped with, and a palette keeps the recipe its config names.

@josephfarina
