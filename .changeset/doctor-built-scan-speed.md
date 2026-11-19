---
'@astryxdesign/cli': patch
---

[perf] `doctor --built` reads source files faster: it parses each file without attaching comments to syntax nodes, blanks comments in one pass, and walks a file's syntax tree for `require()` and `import()` calls only when its text can hold one. On a 240-file app the source scan takes about a third less time. Output does not change.

@josephfarina
