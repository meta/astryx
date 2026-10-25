---
'@astryxdesign/core': patch
---

[fix] `RadioList`'s pressed circle no longer comes from a `:has()` check that reached every element under the row, so a large page no longer restyles everything under each row whenever anything inside it changes. The row is pressed and the circle shows it exactly as before, and a link or button inside the row still keeps its own press.

@cixzhang
