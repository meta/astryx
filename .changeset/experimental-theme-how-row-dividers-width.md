---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: "make the table row dividers thicker" writes nothing and explains why. The cells draw the row line at a width Core sets per render, so any width the editor could write would also thicken the borders of the controls inside the row (checkboxes, buttons).

@josephfarina
