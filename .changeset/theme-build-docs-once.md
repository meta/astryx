---
'@astryxdesign/cli': patch
---

[perf] `theme build` reads each Core component doc at most once per run. A theme whose component overrides name prop values (such as `variant:ghost` or `size:sm`) was checked against up to three views of Core's docs (the theming targets, the known prop values, and the components a new value augments), and each view read and checked every doc again. Such a build now finishes about 50 to 110 ms sooner. A theme with no such overrides reads the docs once, as before. Output does not change.

@josephfarina
