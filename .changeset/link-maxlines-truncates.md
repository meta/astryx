---
'@astryxdesign/core': patch
---

[fix] Link: `maxLines` now truncates when the link sits in a line narrower than its text. The link, as an anchor or a button, stops at its container and its label draws an ellipsis, instead of growing to its whole text and being clipped with no ellipsis.

@cixzhang
