---
'@astryxdesign/cli': patch
---

[perf] The theme build loads jiti, which transpiles TypeScript theme sources, the first time it loads a theme, through the same CommonJS entry the CLI's other loaders use, instead of importing jiti's ES module entry whenever any command loads the theme API. `component` in text, `doctor` and `theme build` start about 25 to 30 ms sooner. Output does not change.

@josephfarina
