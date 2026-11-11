---
'@astryxdesign/cli': patch
---

[perf] `search`, `build` and `template` read the components of a template Astryx ships from a list stored in the package when it is published, instead of parsing the template's source on every call. The list holds exactly what parsing returns, keyed by the source text, so a changed source or an integration's template is parsed as before. Every command prints the same output.

@josephfarina
