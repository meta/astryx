---
'@astryxdesign/cli': patch
---

[perf] jiti and the theme API behind `component`'s text output load on first use instead of with every command, so commands that never need them start faster. Every command prints the same output.

@josephfarina
