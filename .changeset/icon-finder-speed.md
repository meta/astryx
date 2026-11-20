---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental icon` ranks faster: each search works out every icon set's searchable words once and each query's forms once per pass, so its passes read every icon without rebuilding its words. Answers are unchanged.

@josephfarina
