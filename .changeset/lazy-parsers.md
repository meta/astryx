---
'@astryxdesign/cli': patch
---

[perf] The CLI loads its schema checker (zod) and builds the authored-value schemas only when a run validates something, so a template list, component list, search or build in a project with no Astryx config answers about 50 ms sooner. Output and error messages are unchanged.

@josephfarina
