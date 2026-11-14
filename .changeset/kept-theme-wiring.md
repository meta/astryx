---
'@astryxdesign/cli': patch
---

[perf] `doctor` keeps its scan of how the app wires its themes between runs, like its docs checks, so a repeat `doctor` answers about 20 to 35 ms sooner. An edit to the app's source, a theme or a theme package scans again on the very next run.

@josephfarina
