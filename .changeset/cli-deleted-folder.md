---
'@astryxdesign/cli': patch
---

[fix] Running any command from a folder that no longer exists now gives a plain error with a `cd` to the nearest existing folder (text and `--json`, code `ERR_PROJECT_REQUIRED`) instead of a stack trace; `--help`, `--version` and `docs` still answer.

@josephfarina
