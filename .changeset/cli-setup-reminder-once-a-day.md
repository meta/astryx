---
'@astryxdesign/cli': patch
---

[fix] The reminder to run `astryx init` in a project that has not run it no longer prints before every command. It now prints after a command that succeeds, at most once a day per project, recorded in the per-user state as the daily hints are. It does not print with `--json`, after a command that fails, or when `CI` is set. `astryx doctor` still reports the missing setup in its agent-docs check every time. No JSON shape or exit code changes.

@josephfarina
