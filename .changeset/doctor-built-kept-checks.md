---
'@astryxdesign/cli': patch
---

[perf] `doctor --built <path>` now reads doctor's kept checks back as `doctor` does, once the per-user cache folder exists: the CLI took the path after `--built` for a subcommand, so those runs checked the docs again every time. A warm `doctor --built` is about 200 ms faster. The build itself is still checked on every run. Output does not change.

@josephfarina
