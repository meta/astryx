---
'@astryxdesign/cli': patch
---

[perf] `component --list` keeps its list between runs in a project where an integration can load, like template discovery's records, so a repeat list answers about 220 ms sooner there. A new, removed or edited component, doc or integration lists again on the very next run.

@josephfarina
