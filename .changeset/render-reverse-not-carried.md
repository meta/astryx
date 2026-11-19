---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export --reverse` names every file the render records as not carried as missing, so `exact` is false whenever one is. A rendered file now records the files the render left out, and the reverse adds them to `missing`. This covers a module the page imports through a path alias from outside the carried folder, which the reverse cannot resolve and used to report as exact.

@josephfarina
