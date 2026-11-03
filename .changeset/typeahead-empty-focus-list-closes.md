---
'@astryxdesign/core': patch
---

[fix] `Typeahead`: with focus entries on, an open list whose focus entries come back empty, or fail to load (for example after the query is cleared), now closes instead of staying open and empty. A typed search with no results still shows its message.

@cixzhang
