---
'@astryxdesign/cli': patch
---

[perf] `astryx template` keeps what it reads from a template's source to name the components it uses, by the source's text and the parser's release, so a warm answer no longer parses the source to name them. Every template answer is unchanged; `doctor --json`'s kept-catalog message names the new kept value.

@josephfarina
