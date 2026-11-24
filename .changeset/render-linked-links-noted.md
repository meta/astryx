---
'@astryxdesign/cli': patch
---

[perf] `astryx experimental export` and the theme editor's previews render a page that uses a linked package faster when the page reaches the package's files by their path first: the worker now takes each package linked into the page's `node_modules` folders as linked before it renders, by the same rule, so imports between that package's own files resolve by path from the start. Pages render as before.

@josephfarina
