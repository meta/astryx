---
'@astryxdesign/cli': patch
---

[perf] `astryx experimental export` and the theme editor's previews render a page that imports a linked package (a workspace package, or one added with `npm link` or a `file:` dependency) faster, when the package's own package.json is the nearest one above the files the page reaches: imports between that package's own files resolve by path, as they already do for an installed package. A linked package that keeps another package.json nearer its files (as some packages built for both module formats do) resolves as before. Pages render as before.

@josephfarina
