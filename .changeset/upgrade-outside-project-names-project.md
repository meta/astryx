---
'@astryxdesign/cli': patch
---

[fix] Outside a project, `astryx upgrade` without `--from` now leads with the reason: the folder is outside a project. It says to run upgrade with `--from <old version>` in the app's folder. Before, it led with "Missing required --from", so adding `--from` in the same folder got a second refusal.

@josephfarina
