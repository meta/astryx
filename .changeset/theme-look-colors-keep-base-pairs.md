---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the category and status colors a look grows now follow only the look's own inputs (accent, neutral, vibrancy). A page fill or a link color set exactly no longer moves them, and a category fill stays a tint instead of following a text color to white or black.

Where a base theme draws its own text with one of these colors and the grown value would not read, the base theme's value stays in that mode, with a note. This covers butter's coloured cards with their dark text in dark mode, and gothic's Delete button.

A set `--color-on-accent` (or another role's text or icon color) reaches only what reads it, and a role color set for one mode leaves the base theme's own parts as they are in the other mode.

@josephfarina
