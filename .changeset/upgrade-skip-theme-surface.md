---
'@astryxdesign/cli': patch
---

[perf] `upgrade --from` a version before 0.7.0 skips the theme-alias codemod on source files that name none of the removed theme targets, as it already skips other codemods on files they cannot change. Every run writes and prints the same.

@josephfarina
