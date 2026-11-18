---
'@astryxdesign/cli': minor
---

[feat] Palette recipe `astryx-oklch-v3`: v2, and a dusty seed's pale tints (above shade 70) stay at or below its own chroma even where the gamut is wide, so a muted olive gives an earthy tint instead of chartreuse. The middle of a ramp is still drawn as v1 draws it. New palettes, including the ones the theme editor makes, name v3. `astryx-oklch-v2` draws exactly what it first shipped with, and a palette keeps the recipe its config names.

- `astryx theme add`: when a theme name is one typo from a real theme, the unknown-theme answer leads with that theme's add command; the doc on where a theme you wrote must live comes after it.

@josephfarina
