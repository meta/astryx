---
'@astryxdesign/cli': patch
---

[feat] In an Astryx project, and outside any package, `astryx search` finds the experimental guides for sharing a page as one HTML file. A search for words like "share", "single file", "static html", "snapshot" or "artifact" now returns them, one entry per guide, and each says it is experimental; every other experimental doc still stays out of search, and in a package without Astryx search answers as before. A reference doc gains the optional field `searchable: true`, which only these CLI guides may set.

@josephfarina
