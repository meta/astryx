---
'@astryxdesign/core': patch
---

[fix] Selector: when the options move or reload while the list is open, the highlight stays on its option instead of naming whatever option now sits at its old position. If its option leaves, the highlight moves to the next remaining enabled option after it, or the previous one when none remains after it, and with none left nothing is highlighted.

@cixzhang
