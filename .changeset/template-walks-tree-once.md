---
'@astryxdesign/cli': patch
---

[perf] `astryx integration check` and `astryx doctor integration validate` gather the parts of each source file the template walks judge once per check, instead of walking the file's whole syntax tree again for every template that reaches it. For a package with many templates that share helpers, each check finished about 0.4 seconds sooner. Output does not change.

@josephfarina
