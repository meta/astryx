---
'@astryxdesign/cli': patch
---

[fix] `astryx search` puts an entry that is not a doc in its every-word tier only when two of the query's words match it strongly (a keyword-strength hit, or a word or the start of a word of its own name, display name or title). `astryx build` ranks as before.

@josephfarina
