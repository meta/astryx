---
'@astryxdesign/cli': patch
---

[perf] `theme build` reads each Core component doc once per run. It checked a theme against three views of Core's docs (the theming targets, the known variant values, and the components a variant map augments), and each view read and checked every doc again. `theme build` now finishes about 50 to 110 ms sooner. Output does not change.

@josephfarina
