---
'@astryxdesign/cli': patch
---

[fix] `astryx search` puts a component, hook or template in its every-word tier only when two of the query's words match it strongly: a word of its own name or title, or a keyword. One strong word and a passing mention of the others no longer lifts it above entries that answer the whole ask. Docs keep the bar of one strong word, since they answer in prose. `astryx build` ranks as before.

@josephfarina
