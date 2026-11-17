---
'@astryxdesign/cli': patch
---

[fix] Outside a project, `astryx upgrade` without `--from` now says that the folder is outside a project, and to run upgrade with `--from <old version>` in the app's folder. Before, it asked only for `--from`, and adding `--from` got a second refusal.

@josephfarina
