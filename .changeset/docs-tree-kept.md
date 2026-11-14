---
'@astryxdesign/cli': patch
---

[perf] `docs` keeps the CLI's own docs tree between runs, while every file it was read from is unchanged, so `docs` and its topics start about 45 to 70 ms sooner. `doctor` still checks the tree's files themselves. Output does not change.

@josephfarina
