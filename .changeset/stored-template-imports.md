---
'@astryxdesign/cli': patch
---

[perf] `build` reads which packages a template Astryx ships imports from a copy stored when the package is published, instead of parsing the template's source on every call. Any other template, such as an integration's, is parsed as before, and every answer is the same.

@josephfarina
