---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental icon` ranks faster: each icon set's searchable words are worked out once per set and each query's forms once per pass, so a search reads every icon without rebuilding its words. Answers are unchanged. `rankIconIndex()` reads each set object as data that does not change; pass a new index object when a set changes.

@josephfarina
