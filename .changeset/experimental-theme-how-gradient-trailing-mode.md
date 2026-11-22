---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a mode said at the end of a sized gradient (`header background linear-gradient(…) 0 0 / 24px 24px in dark mode`) as that mode, the same as a leading mode: the slash between the gradient's position and its length or percent size, right after the `background` word, no longer splits the ask, so the pattern is written whole in that mode, a stop with one function inside it (`rgb(0 0 max(10, 15))`) included. A slash between two asks still splits them (`… in dark mode / buttons blue`), and a question that names a second gradient layer anywhere after the slash, or a keyword size after it, reads as before.

@josephfarina
