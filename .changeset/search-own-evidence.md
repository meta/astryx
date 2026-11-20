---
'@astryxdesign/cli': patch
---

[fix] `astryx search` reads another entry's name as that entry's evidence. A block no longer ranks above a component only because it uses components that match the query's words. A guide whose title sits in the query no longer takes the title's rank when the query also names a component the guide does not answer: it ranks by the words it matches, so a guide whose title is its only match yields to that component. Two cases keep the guide first: a component word that is also a doc's name (`link`, `icon`, `theme` or `calendar`), which may be asking for the docs, and a guide whose own name is a query word. `build` is unchanged.

@josephfarina
