---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a whole-theme `--color-accent` set as a token now acts as the theme's accent when no accent color is set. Links, selected rows, list items, citations and the accent tint grow from it, as they do from `set <theme> accent`. A dark value set with `--mode dark` carries the dark shades, and the token keeps the exact value it was given in each mode. Set for one mode only, it moves that mode only: the other keeps the base theme's colors.

@josephfarina
