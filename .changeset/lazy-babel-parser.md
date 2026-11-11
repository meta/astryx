---
'@astryxdesign/cli': patch
---

[perf] Contribution validation now loads `@babel/parser` on first use, so a run that parses no source, such as `component <Name> --json` or `template --list`, no longer loads it. Every command prints the same output.

@josephfarina
