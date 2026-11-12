---
'@astryxdesign/cli': patch
---

[perf] `search` (and `build`, which ranks with it) splits each name into words, lowercases each description, and builds each query term's word pattern once per run instead of once per candidate and term. Every result is the same.

@josephfarina
