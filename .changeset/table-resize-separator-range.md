---
'@astryxdesign/core': patch
---

[fix] A Table column-resize handle on a column with no maximum width now announces a maximum at or above its value, so a screen reader no longer reads the width past ARIA's default maximum of 100. It uses the window's width as the stand-in maximum, as an unbounded Resizable region does, and announces its value in words, for example "133 pixels". A column with `maxWidth` is unchanged.

@cixzhang
