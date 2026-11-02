---
'@astryxdesign/core': patch
---

[fix] CommandPalette no longer shows its "Type to search" text after you have typed. While the first search is still loading, the list stays empty and the field's loading spinner shows; the no-results text appears once that search finishes with nothing. Clearing the field brings "Type to search" back.

@cixzhang
