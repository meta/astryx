---
'@astryxdesign/cli': patch
---

[feat] Palette generation has a second recipe, `astryx-oklch-v2`, beside `astryx-oklch-v1`: its pale stops, where a vivid seed asks more than the sRGB gamut holds, follow the vibrancy and each seed's own chroma instead of all landing on the gamut's edge, and a dusty seed stays dusty there; the dark side of a ramp, and every pale stop whose gamut holds the most vivid seed at the default vibrancy, are drawn exactly as v1 draws them, so role text and dark fills keep their strength. New palettes name v2: `astryx experimental theme editor` records `"recipe": "astryx-oklch-v2"` in each palette config it makes, and the palette guide's example config names it. A request or config that names no recipe still runs v1, from `generateTonalPalette()` and `astryx theme palette generate` alike, so existing callers, the shipped themes' palettes and any existing config keep their colors; a config keeps the recipe it records, and naming one pins it. A theme the editor saved before keeps the recipe it was made with, and a color change on it says how to move it.

@josephfarina
