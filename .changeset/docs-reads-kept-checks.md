---
'@astryxdesign/cli': patch
---

[perf] In a project with integrations, `docs` reads the integration check results, issue list and theme records that other commands keep, instead of checking every integration again on each call (about 0.4 s with a large integration). An edit to a doc topic shows on the very next call. `doctor`'s cache row names `docs` among the commands that keep what they gather.

@josephfarina
