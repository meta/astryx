---
'@astryxdesign/cli': patch
---

[perf] `build` keeps its block picker's per-block vectors beside the kept search catalog and reads them back on a later run with the same catalog, instead of working them out on every call. Every answer is the same.

@josephfarina
