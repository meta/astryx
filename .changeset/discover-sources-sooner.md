---
'@astryxdesign/cli': patch
---

[perf] `astryx discover` asks the project's discover sources for their catalogs while it reads the installed packages, instead of after. In a project whose integration's source answers from a remote catalog, the list comes back about 0.4 seconds sooner. Output does not change.

@josephfarina
