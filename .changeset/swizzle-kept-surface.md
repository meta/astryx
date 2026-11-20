---
'@astryxdesign/cli': patch
---

[perf] Copies of a second component from the same package in one process (a script or host that calls the swizzle API in-process, or the test suite) no longer parse the whole package again: the package's public surface is kept while every file it read is unchanged. Each `astryx swizzle` run, including a tool call through `astryx mcp`, is unchanged.

@josephfarina
