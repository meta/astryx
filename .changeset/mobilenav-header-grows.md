---
'@astryxdesign/core': patch
---

[fix] `MobileNav`'s header row grows with its content. It was a fixed one-bar height, so a header taller than one row (a title with a search field under it, or a title that wraps at a larger text size) overflowed the row: the bottom border ran through it and the content ran into the first navigation item. The row is now at least one bar high, so a one-line header looks as before. `SideNav` in drawer mode, which passes its `header` to `MobileNav`, gets the same fix.

@cixzhang
