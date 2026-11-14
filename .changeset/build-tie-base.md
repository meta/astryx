---
'@astryxdesign/cli': patch
---

[fix] `astryx build` settles an exact ranker tie by whether a template is its family's base, instead of by how many hyphen-separated parts its id has: a family's base keeps its place ahead of a tied variant. Templates still tied, in the same family or not, are ordered by how strongly each one's own descriptor answers the idea, then by how typical of its family it is, then by name. The page-pick model settles an exact tie between pages the same way, so the order of its weights file never decides.

@josephfarina
