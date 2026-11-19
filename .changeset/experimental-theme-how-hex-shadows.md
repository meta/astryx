---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads every shadow color through the one shared color reader, so themes that write 8-digit hex shadow colors (butter, chocolate, gothic, matcha, stone, y2k) get an answer to "make shadows darker", "make shadows lighter" and "the shadows are too strong", each color's alpha scaled in the form it was written.

@josephfarina
