---
'@astryxdesign/core': patch
---

[fix] A swizzled ListItem inside the package's List (or a package ListItem inside a swizzled List) now leaves the way a package row does: it keeps what it showed on screen, such as a swipe's travel, for its exit. Before, the List and the ListItem kept separate records of the rows the List reported and of the presentation a leaving row kept, so the row's exit lost that presentation. No API changes.

@cixzhang
