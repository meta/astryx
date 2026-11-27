---
'@astryxdesign/cli': patch
---

[perf] `astryx search` and `astryx build` score each word of a query faster. The word's forms are worked out once per word, not once for every entry. Whether it has a space is tested once per entry, not for every name and keyword, and the word without its spaces is worked out once per entry, not for every name. A one-word term is no longer joined or read as a spelled-out name, which needs a space. Results are unchanged.

@josephfarina
