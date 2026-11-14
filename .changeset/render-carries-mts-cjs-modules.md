---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` carries the `.mts`, `.cts` and `.cjs` modules a page imports, and `--reverse` gives them back and follows their imports. The render loaded them but left them out of the file, so the page came back with `exact: false` and those modules missing.

@josephfarina
