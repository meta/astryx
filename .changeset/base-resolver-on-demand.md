---
'@astryxdesign/cli': patch
---

[perf] A run that loads no project, other than `hook`, and whose `--base` names no other package, such as `astryx --version`, `--help` or `manifest`, no longer loads the base resolver. Core's base declaration reads Core's package name from a small module of its own, so it loads no provider-identity code. Output is unchanged.

@josephfarina
