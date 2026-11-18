---
'@astryxdesign/cli': patch
---

[perf] `astryx template` works out the components its "Read the components it uses in one call" line names in one pass: a name the component list holds under Core or a configured integration needs no lookup, a chart library's import needs none, and the names it does look up share each folder listing and doc read. In a project with an integration, a template answer is about 0.3–0.7 s faster again. Every answer is unchanged.

@josephfarina
