---
'@astryxdesign/cli': patch
---

[perf] `astryx search` and `astryx build` use the scores they already worked out for each word of a request when they order the results, so a long request ranks sooner. The results do not change.

@josephfarina
