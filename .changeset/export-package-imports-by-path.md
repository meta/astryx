---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export` reads the page's packages faster. Node looks up the package scope of every module it loads and parses a package's exports map again for each one, so a page that loads hundreds of Core's modules parsed Core's exports map hundreds of times. The export now resolves an import between two files of one installed package by its path, and reads each folder's package.json at most once. Every other import, and every import of the page's own files, resolves as before. Exported files do not change.

@josephfarina
