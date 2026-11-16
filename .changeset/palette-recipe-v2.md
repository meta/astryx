---
'@astryxdesign/cli': patch
---

[fix] Palette generation has a second recipe, `astryx-oklch-v2`, beside `astryx-oklch-v1`: its pale (and very dark) stops follow the vibrancy and each seed's own chroma instead of all landing on the edge of the sRGB gamut, and a dusty seed stays dusty in its tints. A request or config runs v2 only when it names it (`"recipe": "astryx-oklch-v2"`); one that names no recipe runs v1 and regenerates exactly what it made before, so the shipped themes' palettes and any existing config keep their colors. New palettes made by `astryx experimental theme editor` name v2; a theme saved before keeps the recipe it was made with, and a color change on it says how to move it.

@josephfarina
