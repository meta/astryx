---
'@astryxdesign/core': patch
---

[fix] OverflowList: in a theme whose spacing scale differs from the default, or when the root font size changes, the list now fits items with the gap it actually renders, so the last visible item and the overflow indicator are no longer cut off at the list's edge.

@cixzhang
