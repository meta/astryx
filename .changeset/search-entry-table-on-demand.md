---
'@astryxdesign/cli': patch
---

[perf] A warm `astryx search` reads back from its kept entry table only the word lists the query names, not every list, so it allocates less and spends less time collecting garbage. Every answer is unchanged.

@josephfarina
