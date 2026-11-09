---
'@astryxdesign/core': patch
---

[fix] `useChatStreamScroll`'s `scrollToMessage` now puts the message at the top of the viewport when the scroller is the page itself. It landed off by the page's own scroll.
@vjeux
