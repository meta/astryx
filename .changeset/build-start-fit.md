---
'@astryxdesign/cli': patch
---

[feat] `astryx build` reports `start.fit` on a page-template start: the page-pick model's probability for that template among the ready page templates, from 0 to 1. At 0.4 or more the choice is clear; below it, several templates fit about as well. It is absent for a template the word tables do not list. `--verbose` text shows it too.

@josephfarina
