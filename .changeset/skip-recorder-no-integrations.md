---
'@astryxdesign/cli': patch
---

[perf] In a project with no integration (no Astryx config, not an integration itself, and no installed dependency that ships one), `component`, `template`, `theme` and `discover` no longer record their run for kept check results, so they skip that work entirely (about 15–40 ms each).

@josephfarina
