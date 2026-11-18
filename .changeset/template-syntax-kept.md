---
'@astryxdesign/cli': patch
---

[perf] `astryx template` keeps what it reads from a template's source to name the components it uses, by the source's text and the parser's release, so a warm template answer parses nothing and loads no parser. Every answer is unchanged.

@josephfarina
