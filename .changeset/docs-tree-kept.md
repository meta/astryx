---
'@astryxdesign/cli': patch
---

[perf] `docs` keeps the CLI's own docs tree between runs, while every file it was read from is unchanged. In a project where an integration can load, `docs` and its topics start about 30 to 65 ms sooner. Where none can load, `docs` keeps nothing and nothing changes. `doctor` still checks the tree's files themselves. Output does not change, except that `doctor`'s row for the per-user cache now names the docs tree among the entries it holds.

@josephfarina
