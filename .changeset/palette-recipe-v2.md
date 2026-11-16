---
'@astryxdesign/cli': patch
---

[feat] Palette generation has a second recipe, `astryx-oklch-v2`, and new palettes now use it: its pale and very dark stops, where a vivid seed asks more than the sRGB gamut holds, follow the vibrancy and each seed's own chroma instead of all landing on the gamut's edge, and a dusty seed stays dusty in its tints; the middle of a ramp at the default vibrancy is drawn as v1 draws it. Existing palette configs are unchanged: a config that names no recipe keeps the one its last receipt records, else `astryx-oklch-v1`, so the shipped themes' palettes and any existing config regenerate the same colors. A fresh request (`generateTonalPalette()` with no recipe) runs v2, and every result and receipt names the recipe that ran. To pin v1, record `"recipe": "astryx-oklch-v1"` in the palette config. New palettes made by `astryx experimental theme editor` name v2; a theme saved before keeps the recipe it was made with, and a color change on it says how to move it.

@josephfarina
