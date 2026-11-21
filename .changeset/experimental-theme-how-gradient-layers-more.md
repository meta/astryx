---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` keeps three or more gradient layers of a part's background in one value (`linear-gradient(…), linear-gradient(…), linear-gradient(…)`). A comma before an ask that only holds a gradient later ("…, hover linear-gradient(…)") still starts a new ask, and a table body's background reads as a part's.

@josephfarina
