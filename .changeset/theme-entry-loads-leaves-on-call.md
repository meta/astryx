---
'@astryxdesign/cli': patch
---

[perf] The theme entry loads the theme build, add, eject and targets code on its first call, so a `component` read that only resolves the project's theme no longer loads it. Output is unchanged.

@josephfarina
