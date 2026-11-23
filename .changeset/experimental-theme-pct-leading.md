---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads a bare percent given as the line height ("line height 150%", "make line height on cards 150%") as CSS does, a share of the text size: 1.5. A percent "of the font size" keeps its earlier reading. A percent said as a change ("50% taller", "increase the line height by 50%") still scales the line height there now.

@josephfarina
