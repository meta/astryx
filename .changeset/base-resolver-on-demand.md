---
'@astryxdesign/cli': patch
---

[perf] A run whose base is plainly Core, with no `--base` naming another package and no integration that could declare a base, no longer loads the base resolver. Core's base declaration reads Core's package name from a small module of its own, so it loads no provider-identity code. Output is unchanged.

@josephfarina
