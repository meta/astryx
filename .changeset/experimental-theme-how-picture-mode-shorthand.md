---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` writes one gradient layer said for one mode with its position and a length size after a spaced slash (`linear-gradient(…) 0 0 / 24px 24px`), its stops nested at most two levels deep, as the `background` shorthand in that mode, so the pattern is written as said; before, it moved to `background-image`, which takes no size, and nothing was written. Any other one-mode gradient, two or more layers included, moves to `background-image` as before.

@josephfarina
