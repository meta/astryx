---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` can keep a contrast problem as designed when its failing color is one the theme typed, copied from an original: the problem offers `set <theme> contrast-accepted '<reason>' --on <part> --ground <part> --mode <mode>`, which needs a specific reason and covers that exact pair of colors in that one place; a later change to either color, or a lower ratio (what shows under a see-through fill), makes it a problem again; the line is offered only where both colors can be named. A color the editor made, and an official theme, are never accepted; one undo takes an acceptance back. `show` (`acceptedContrast`) lists every acceptance with its reason, and `none` takes one back.

@josephfarina
