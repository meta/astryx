---
'@astryxdesign/cli': patch
---

[perf] `astryx discover` with no query asks the project's discover sources for their catalogs while it reads the installed packages, instead of after. With a large integration whose source asks a remote catalog, the list came back about 0.4 seconds sooner. Output does not change.

@josephfarina
