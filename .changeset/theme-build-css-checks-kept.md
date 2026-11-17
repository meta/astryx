---
'@astryxdesign/cli': patch
---

[perf] `astryx theme build` of a theme whose part styles hold pseudo-class keys (`':hover'`, `'::before'`) or whose tokens hold names without two dashes finishes about 20 to 30 ms sooner on a repeat build. What its css-tree checks of those keys and names find is kept beside the kept gathers and read back while the keys and every file of css-tree's code and data are unchanged, so such a build loads no css-tree. The build's warnings, errors and written files do not change.

@josephfarina
