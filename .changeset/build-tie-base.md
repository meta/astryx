---
'@astryxdesign/cli': patch
---

[fix] `astryx build` settles an exact ranker tie by whether a template is its family's base, instead of by how many hyphen-separated parts its id has: a family's base keeps its place ahead of a tied variant. Templates still tied, in the same family or not, are ordered by how strongly each one's own descriptor answers the idea, then by how typical of its family it is, then by name. A template the idea names by its whole name wins a tie. The page-pick model settles an exact tie of its final score the same way, and its rank features give equal values equal ranks, so the order of the weights file never decides.

@josephfarina
