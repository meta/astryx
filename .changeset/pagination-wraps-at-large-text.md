---
'@astryxdesign/core': patch
---

[fix] `Pagination` wraps its row when its controls don't fit, as at a larger text size on a phone, instead of scrolling the page sideways and pushing Next off-screen. Previous stays first and Next stays last, and nothing changes when the controls fit.

@cixzhang
