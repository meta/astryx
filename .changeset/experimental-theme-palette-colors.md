---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: theme colors now come from the palette generator. `set <theme> accent <color>` (and the new `neutral`, `success`, `warning`, `danger` and `info` dials) writes the color as a family in `themes/<theme>/palette.config.json`, in the shape `theme palette generate` reads, and runs the same generator to write `tokens/<theme>.palette.ts` and its receipt. The theme's color tokens point at stops of that palette, light and dark from one color, following the stops the official themes use. A token moves to a nearer stop of the same family when it must read (text at 4.5:1, the focus ring at 3:1); the editor no longer mixes colors of its own. `show` reports the palette, which stop feeds each token, and the contrast behind each choice; `how palette` explains it; `undo <theme> accent` removes the family and its tokens. An exact token (`set <theme> --color-accent <color>`) still wins over the palette. Color dials apply to the whole theme: `--on` and `--mode` are refused, with the exact-token command to use instead.

@josephfarina
