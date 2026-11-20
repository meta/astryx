---
'@astryxdesign/cli': patch
---

[perf] `astryx build` no longer parses its start template's source when the template draws icons by meaning: the published package stores the imports of each template's filled copy, as it stores the template's own, so build's setup notes read them without loading a parser. Every answer is unchanged.

@josephfarina
