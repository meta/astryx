---
'@astryxdesign/cli': patch
---

[perf] Commands that load a project's integrations no longer load `@babel/parser` unless they validate a contribution's source; it loads on first use. Every command prints the same output.

@josephfarina
