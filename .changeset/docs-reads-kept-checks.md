---
'@astryxdesign/cli': patch
---

[perf] In a project with integrations, `docs` keeps the integration check results it gathers, with the theme records they include, so a repeated `docs` call reads them back instead of checking every integration again. An edit to a doc topic shows on the very next call. `doctor`'s cache row names `docs` among the commands that keep what they gather.

@josephfarina
