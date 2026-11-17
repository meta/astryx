---
'@astryxdesign/cli': patch
---

[perf] `component --list` keeps its list between runs in a project where an integration can load, like template discovery's records, so a repeat list answers sooner there (about 220 ms with a large TypeScript integration). A new, removed or edited component, doc or integration lists again on the very next run.

@josephfarina
