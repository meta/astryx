---
'@astryxdesign/cli': patch
---

[perf] Contribution validation now loads `@babel/parser` only when it parses a contribution's source, so a run where nothing else loads the parser, such as `component <Name> --json` or `hook --list`, no longer loads it. Every command prints the same output.

@josephfarina
