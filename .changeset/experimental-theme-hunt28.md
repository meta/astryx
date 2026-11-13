---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor show` renders its pages again when the Core or base theme package it runs from changes, even at the same version (a linked or patched copy), and when a page was edited by hand: the page records a hash of itself beside its render key. A folder in place of an output the build writes for some themes only (the variants types) is refused by name, like the other outputs.

@josephfarina
