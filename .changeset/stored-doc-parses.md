---
'@astryxdesign/cli': patch
---

[perf] The published CLI reads its own shipped docs as already checked against their schema at publish, instead of checking each one on every read, so `docs` answers about 25 ms sooner. A doc that was edited or is not shipped is checked as before. Output is unchanged.

@josephfarina
