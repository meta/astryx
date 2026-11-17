---
'@astryxdesign/cli': patch
---

[fix] `astryx search` reads another entry's name as that entry's evidence. A block no longer ranks above a component because it uses components that match the query's words, and a guide whose title sits in the query no longer ranks above a component the query names that the guide does not answer. `build` is unchanged.

@josephfarina
