---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a `--color-border` in a color of its own now reaches the input frames even when it is fainter than them.

The emphasized border, which frames inputs, selectors, selectable cards and collapsible triggers, takes the border's hue at the frame's own strength, so controls stay in the border's family and keep their contrast. A stronger border still carries the frame as it is, a fainter gray leaves it, and an exact `--color-border-emphasized` keeps its own color.

@josephfarina
