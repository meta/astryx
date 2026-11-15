---
'@astryxdesign/cli': patch
---

[feat] `astryx build` reports `start.fit` on a page-template start: the page-pick model's probability for that template among the ready page templates, from 0 to 1. A start at or above `CLEAR_FIT` is a clear choice; below it, several templates fit about as well. `--verbose` text shows it too.

@josephfarina
