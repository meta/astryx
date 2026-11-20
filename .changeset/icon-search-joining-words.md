---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental icon` and the icons block of `astryx search` leave out the words that only join others (`with`, `and`) when they look for icons that carry a query's words, so `card with an icon of a star` no longer lists an icon only because its name holds `with`. A query that no whole word answers as typed is now read without them, so `user with plus` finds `user-plus` directly.

@josephfarina
