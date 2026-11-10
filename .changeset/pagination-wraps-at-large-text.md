---
'@astryxdesign/core': patch
---

[fix] `Pagination` wraps its row when its controls don't fit, as at a larger text size on a phone, instead of scrolling the page sideways and pushing Next off-screen. Previous stays first and Next stays last. Beside other content in a flex row, Pagination can now shrink to its widest control and wrap at the default text size too, where it held one line before; give it `flexShrink: 0` through `xstyle` to keep one line there.

@cixzhang
