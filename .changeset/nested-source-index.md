---
'@astryxdesign/cli': patch
---

[perf] `component --list` resolves each component's import from one index of Core's folders instead of probing every folder per component, about 20 ms sooner. Output is unchanged.

@josephfarina
