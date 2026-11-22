---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a mode said at the end of a sized gradient (`header background linear-gradient(…) 0 0 / 24px 24px in dark mode`) as that mode, the same as a leading mode: the slash between the gradient's position and its length or percent size, right after the `background` word, no longer splits the ask, so the pattern is written whole in that mode, a stop with one function inside it (`rgb(0 0 max(10, 15))`) included. A slash between two asks still splits them (`… in dark mode / buttons blue`), and an ask with a second gradient layer, or a keyword size after the slash, reads as before.

@josephfarina
