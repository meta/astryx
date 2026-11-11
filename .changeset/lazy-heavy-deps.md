---
'@astryxdesign/cli': patch
---

[perf] jiti now loads on first use instead of with every command, and `component --json` no longer loads the theme API, which only `component`'s text output needs, so commands that never need them start faster. Every command prints the same output.

@josephfarina
