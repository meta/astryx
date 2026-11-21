---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a one-mode gradient layer's stops by the CSS list grammar, so a gradient that ends in its position and a length size after a spaced slash, whose first stop is an `rgb()` color with `max()`, `min()` or `clamp()` in its last channel (`linear-gradient(rgb(0 0 max(10, 15)) 1px, transparent 1px) 0 0 / 24px 24px`), with no function in its other stops and no angle, direction or shape before it, keeps the `background` shorthand in that mode.

@josephfarina
