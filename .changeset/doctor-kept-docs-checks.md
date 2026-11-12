---
'@astryxdesign/cli': patch
---

[perf] Once a search or build has made the per-user cache folder, `doctor` keeps its three checks that read only files (the docs tree, progressive disclosure and the CLI's docs) beside search's catalogs, and reads each back while every file it read is unchanged, so a later `doctor` skips them (about 0.2 s, more with large integrations). An edit to any doc shows on the very next run. Its cache row names doctor among the commands that keep what they gather.

@josephfarina
