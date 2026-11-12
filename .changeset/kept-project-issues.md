---
'@astryxdesign/cli': patch
---

[perf] In a project with integrations, the whole integration issue list is kept beside search's catalogs (the template and component replacement checks over Core and every integration, as well as each integration's own checks) and read back while every file it read is unchanged, so `component`, `template`, `theme` and `search` skip those passes on later calls (about 0.1–0.25 s each with a large integration).

@josephfarina
