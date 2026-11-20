---
'@astryxdesign/cli': patch
---

[perf] A command that keeps catalogs keeps the parse of each shipped doc it reads, by the doc's text, so a later read of that doc does not parse it again. The doc parsers build their schemas only when they first parse, not when the CLI loads them. Output is unchanged.

@josephfarina
