---
'@astryxdesign/cli': patch
---

[fix] Palette recipe `astryx-oklch-v2`: a dusty seed's pale tints (above shade 70) stay at or below its own chroma even where the gamut is wide, so a muted olive gives an earthy tint instead of chartreuse; the middle of a ramp is still drawn as v1 draws it.

@josephfarina
