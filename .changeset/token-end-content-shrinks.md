---
'@astryxdesign/core': patch
---

[fix] Token: a token cut by its width keeps its Remove button inside the token, visible and reachable. Long end content, such as a PowerSearch filter's value, now shrinks with the label instead of pushing the button out of view. This holds at any text size, including 200% text, and the label keeps a width. A screen reader still reads the token's full name.

@cixzhang
