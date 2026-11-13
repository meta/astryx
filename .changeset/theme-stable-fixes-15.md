---
'@astryxdesign/cli': patch
---

[fix] `theme build` and `experimental theme compile` refuse a theme that sets a private `--_*` variable: the build fails with `ERR_THEME_INVALID` (exit 1, a JSON error envelope) and writes nothing, a `--check` included. Before, it printed the errors and exited 1 but still wrote the outputs and reported `[ok]` and a success receipt, so a reader of the JSON saw a pass.

@josephfarina
