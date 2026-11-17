---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` can keep a contrast problem as designed when its failing color is one the theme typed, copied from an original: the problem offers `set <theme> contrast-accepted '<reason>' --on <part> --ground <part> --mode <mode>`, which needs a specific reason and covers that one place at that ratio; a later change that draws it lower makes it a problem again. A color the editor made is never accepted. `show` (`acceptedContrast`) lists every acceptance with its reason, and `none` takes one back.

@josephfarina
