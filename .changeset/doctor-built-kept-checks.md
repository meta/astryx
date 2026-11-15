---
'@astryxdesign/cli': patch
---

[perf] `doctor --built <path>` now reads doctor's kept checks back as `doctor` does, once the per-user cache folder exists: the CLI took the path after `--built` for a subcommand, so those runs checked the docs again every time. In a project whose integrations add docs, a warm `doctor --built` is about 200 ms faster; in a Core-only project the difference is within noise. The build itself is still checked on every run. Check results do not change; the cache row counts the kept checks.

@josephfarina
