---
'@astryxdesign/cli': patch
---

[fix] A `debug` handler that an installed integration exports, with no astryx.config entry naming it, now receives `--version` runs too, with or without an astryx.config. A config that names neither `debug` nor `integrations` no longer makes commands that load the project print a warning about a missed debug handler in such a project. Output and exit codes are unchanged.

@josephfarina
