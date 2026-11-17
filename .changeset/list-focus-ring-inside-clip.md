---
'@astryxdesign/core': patch
---

[fix] ListItem focus rings stay visible at the list's inline edges. Rows inside List now draw their keyboard focus ring inside the row box, which the list clips for swipe actions; standalone ListItem focus rings keep their existing offset.

@bezabyte
