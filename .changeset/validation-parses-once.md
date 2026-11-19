---
'@astryxdesign/cli': patch
---

[perf] `astryx integration check` and `astryx doctor integration validate` parse each of a package's source files once for the walks that follow each template's imports, instead of once for every template that reaches the file. For a package with many templates that share helpers, each check finishes about a second sooner. Output does not change.

@josephfarina
