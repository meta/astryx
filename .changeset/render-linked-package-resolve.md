---
'@astryxdesign/cli': patch
---

[perf] `astryx experimental export` and the theme editor's previews render a page that imports a linked package (a workspace package, or one added with `npm link` or a `file:` dependency) faster: imports between that package's own files resolve by path, as they already do for an installed package. Pages render as before.

@josephfarina
