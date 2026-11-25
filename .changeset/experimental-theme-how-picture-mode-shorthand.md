---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` writes one gradient layer said for one mode with its position and a length size after a spaced slash (`linear-gradient(…) 0 0 / 24px 24px`) as the `background` shorthand in that mode, so the pattern is written as said; before, it moved to `background-image`, which takes no size, and nothing was written. Its stops are read by the CSS list grammar, so a stop nested at any depth (`linear-gradient(rgb(0 0 max(10, 15)) 1px, transparent 1px) 0 0 / 24px 24px`) counts as one layer when the ask reader keeps the value whole. A saved one-layer gradient with its position and size after a spaced slash, a keyword size such as `cover` included, asked darker for one mode is written the same way. Any other one-mode gradient, two or more gradient layers included, moves to `background-image` as before.

@josephfarina
