---
'@astryxdesign/cli': patch
---

[perf] The CLI loads its schema checker (zod) and builds the authored-value schemas only when a run validates something, so a template list, component list, search or build in a project where no integration can load (no Astryx config and no installed package that ships an integration) answers about 50 ms sooner. Where an integration can load, the parsers load up front as before. Output and error messages are unchanged.

@josephfarina
