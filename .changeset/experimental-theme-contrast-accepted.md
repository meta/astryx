---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` can keep a contrast problem as designed when its failing color is one the theme typed, copied from an original: the problem offers `set <theme> contrast-accepted '<reason>' --on <part> --ground <part> --mode <mode>`, which needs a specific reason and covers that exact pair of colors in that one place; a later change to either color makes it a problem again. A color the editor made, and an official theme, are never accepted; one undo takes an acceptance back. `show` (`acceptedContrast`) and `doctor` list every acceptance with its reason, and `none` takes one back.

@josephfarina
