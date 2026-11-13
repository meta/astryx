---
'@astryxdesign/cli': patch
---

[perf] `search` lowercases each candidate's names, keywords and prose once per run instead of on every term and synonym, and scores a one-word query once instead of twice, so a warm search answers 10 to 20 ms sooner. Results are unchanged.

@josephfarina
