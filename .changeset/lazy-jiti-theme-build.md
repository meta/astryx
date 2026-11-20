---
'@astryxdesign/cli': patch
---

[perf] The theme build loads jiti, which transpiles TypeScript theme sources, through the module loader's lazy CommonJS loader, instead of importing jiti's ES module entry whenever any command loads the theme API. `component` in text and `doctor` no longer load jiti and start about 15 to 30 ms sooner. `theme build` still loads it, but no longer through the ES module entry, which made Node scan jiti's whole CommonJS bundle for export names; it starts about 15 to 30 ms sooner too. Output does not change.

@josephfarina
