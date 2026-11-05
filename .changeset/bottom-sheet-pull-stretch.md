---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a finger's pull up past the top stretches the sheet on every pull, on iOS's rubber band, with no 48 px cap, unless the caller sizes or styles the sheet (an inline block size, any `xstyle` or class name), which keeps it. The sheet keeps enough of its surface below the screen that the page never shows. A pull on the content stretches it too once the content has no room left to scroll: at once for content that fits, and after a long list reaches its end. A mouse or a pen keeps its current stretch.

@vjeux
