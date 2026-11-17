---
'@astryxdesign/cli': patch
---

[experimental] A color with an opacity after its slash, as Tailwind writes it (`ring-black/5`, `bg-blue-500/20`, `#000/12`, `white/[.08]`), is read as that color at that opacity. `astryx experimental theme editor how` writes it as `rgb(r g b / alpha)` (a card's `ring-1 ring-black/5` is a 1px ring at 5% black, no longer a solid black ring), and `set` refuses the shorthand, which is no CSS, offering the same color written out at that opacity. The opacity is never dropped.

@josephfarina
