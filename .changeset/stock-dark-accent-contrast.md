---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] The stock theme's dark-mode accent (`--color-accent`) is now `#0171E3` instead of `#2694FE`, so white text on an accent fill, such as a primary Button's label at rest, meets 4.5:1 (4.70:1, was 3.11:1). Hovered and pressed primary Buttons improve too (about 4.36:1 and 4.03:1, from under 3:1) but stay under 4.5:1. Light mode keeps `#0064E0`. Everything else painted with `--color-accent` in dark mode also darkens: accent fills, focus rings and accent icons. MetadataList's "Show more", Table's sort rank and DateRangeInput's applied preset now use `--color-text-accent`, so their text stays readable on dark surfaces. The theme template that `astryx theme template` writes uses the same dark accent, and the generated color token docs list it. To keep the previous look, a theme can set `'--color-accent': ['#0064E0', '#2694FE']`.

@cixzhang
