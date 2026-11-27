---
'@astryxdesign/cli': patch
---

[perf] `astryx experimental export` and the theme editor's previews resolve each package name and `#` import that a page's ES modules import once for each folder they are imported from, instead of once for each module, so a page that uses many Core components renders faster. Every import resolves as before.

@josephfarina
