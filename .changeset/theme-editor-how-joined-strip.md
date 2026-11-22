---
'@astryxdesign/cli': patch
---

[experimental] `experimental theme editor how` answers "pagination pages in one bordered strip": the row takes the border and corners with no gap between its controls, each control a separator after it, the first and last control the row's corners just inside its border, the last no separator, and the ellipsis a separator too. Corners given as a length and a color said of the lines with it ("with 3px corners and #dddddd lines") go on the strip; an ask that says any other look of the pager with it (a shadow, a line width, "square corners") is answered as before. Said for one mode before it ("dark mode: …") or of its lines ("… with #333333 lines in dark mode"), the strip keeps its shape in both modes and says so; only a line color takes the mode. It reads the parts themselves: the controls are the part whose ends Core marks first and last.

@josephfarina
