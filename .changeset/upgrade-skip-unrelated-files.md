---
'@astryxdesign/cli': patch
---

[perf] `upgrade` skips a codemod on a file it cannot change: a core codemod may declare the words a file must say for it to act, and a file that says none of them, holds no backslash, and parses, is left untouched without running the transform. A file that does not parse still reaches the transform, so it is reported as before. One codemod that checked every spread against every component now checks only components the file imports. Every run writes and prints the same.

@josephfarina
