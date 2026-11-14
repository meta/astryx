---
'@astryxdesign/cli': patch
---

[perf] In a project with integrations, each integration's discovered themes are kept beside search's catalogs and read back while every file they read is unchanged, so `theme list` and the other theme commands skip re-reading an integration's themes on later calls (about 0.1 s with a large integration). An edit to a theme, or to a module it imports, shows on the next run. `doctor`'s cache row names the kept theme records.

@josephfarina
