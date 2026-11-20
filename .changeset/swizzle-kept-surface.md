---
'@astryxdesign/cli': patch
---

[perf] A second copy from the same package in one process (a script or host that calls the swizzle API in-process, or the test suite) no longer parses the whole package again: it drops from about 2.1 s to under 60 ms, because the package's public surface is kept while every file it read is unchanged. Recording what that read touched makes a single `astryx swizzle` run, including a tool call through `astryx mcp`, about 0.1 s slower.

@josephfarina
