---
'@astryxdesign/cli': patch
---

[fix] `astryx build` gives a page template its word tables don't list (an integration's template, or one added later) a fair chance to start: when the idea names a word only that template's own name, category or keywords carry, it competes on the tables' scale at its place in the ranker's order instead of at the bottom.

@josephfarina
