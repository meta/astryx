---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a text color for one kind of a part, such as white text on destructive buttons, is now checked against the fill the base theme actually draws for it. The answer applies the color only in the mode where it reads: for example, dark mode only when the light-mode destructive fill is pale. Before, it was checked against a different color than the one drawn, so how could suggest text that the check after setting it flagged as unreadable.

@josephfarina
