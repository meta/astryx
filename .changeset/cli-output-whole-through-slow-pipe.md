---
'@astryxdesign/cli': patch
---

[fix] A long answer piped to a slow reader arrives whole. When a command ended in an error with an answer longer than 64 KiB, such as `astryx template <name> --json` with many suggestions, a reader like `$(…)` or `| (sleep 1; wc -c)` got only the first 64 KiB, so `--json` callers got invalid JSON. Every command now writes piped output in full before it exits; short answers are as fast as before.

@josephfarina
