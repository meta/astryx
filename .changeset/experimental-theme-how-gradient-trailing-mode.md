---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a mode said at the end of a sized gradient (`header background linear-gradient(…) 0 0 / 24px 24px in dark mode`) as that mode, the same as a leading mode: the slash between the gradient's position and its length or percent size, right after the `background` word, no longer splits the ask, so the pattern is written whole in that mode, its stops nested up to three levels deep. A slash between two asks still splits them (`… in dark mode / buttons blue`), and a second gradient layer or a keyword size reads as before.

@josephfarina
