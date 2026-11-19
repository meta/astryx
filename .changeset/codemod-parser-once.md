---
'@astryxdesign/cli': patch
---

[perf] `upgrade` binds jscodeshift to each parser once per codemod instead of once per file, which built a new copy of jscodeshift's helpers for every file. An upgrade over a 240-file app runs about 150 ms faster. Output does not change.

@josephfarina
