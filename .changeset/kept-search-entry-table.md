---
'@astryxdesign/cli': patch
---

[perf] `search` keeps the index it builds over a kept catalog beside that catalog, so a later search over the same catalog reads the index back instead of building it again. The index is a function of the catalog's text, so it reads back exactly as built; it is keyed by that text and by the CLI code and files that build it (the CLI files the catalog depends on, the index's own code and the component cards), so an edit to an installed copy, as patch-package or a hand edit leaves it, is never answered from an index built before the edit. It is kept only where catalogs are kept. Every search prints the same answer.

@josephfarina
