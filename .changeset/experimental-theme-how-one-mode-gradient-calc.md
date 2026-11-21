---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a one-mode gradient layer's stops by the CSS list grammar, so a sized gradient whose first stop nests a function inside a color function (`linear-gradient(rgb(0 0 max(10, 15)) 1px, transparent 1px) 0 0 / 24px 24px`), with no function in its other stops and no angle, direction or shape before it, keeps the `background` shorthand in that mode.

@josephfarina
