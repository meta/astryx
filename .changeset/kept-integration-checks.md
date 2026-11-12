---
'@astryxdesign/cli': patch
---

[perf] `component`, `template`, `theme`, `discover` and `search` keep each integration's contribution-check results in the per-user cache folder beside search's catalogs, and read them back while every file, folder and environment variable the checks read is unchanged, instead of checking the integration again on every call. On a project with a large integration this takes about 0.2–0.3 s off each of these commands. `doctor`'s cache row names the commands that keep what they gather.

@josephfarina
