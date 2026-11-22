---
'@astryxdesign/cli': patch
---

[perf] `astryx theme build` and the theme editor find Core's folder faster: a package.json on the way up is read and parsed once while its file is unchanged, not on every look-up. Builds are unchanged.

@josephfarina
