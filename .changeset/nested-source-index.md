---
'@astryxdesign/cli': patch
---

[perf] `component --list` finds a component that has no folder of its own about 20 ms sooner: one index of Core's folders replaces a check of each folder in turn. Output is unchanged.

@josephfarina
