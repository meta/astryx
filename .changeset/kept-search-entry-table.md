---
'@astryxdesign/cli': patch
---

[perf] `search` keeps the index it builds over a kept catalog beside that catalog, so a later search over the same catalog reads the index back instead of building it again. The index is a function of the catalog's text, so it reads back exactly as built; it is kept only where catalogs are kept. Every search prints the same answer.

@josephfarina
