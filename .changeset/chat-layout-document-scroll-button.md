---
'@astryxdesign/core': patch
---

[fix] ChatLayout's scroll-to-bottom button now appears when `scrollRef` names the document's scroller and the reader scrolls the page up. The stream scroll also stops following there, so a streaming reply no longer pulls that reader back to the newest message.
@vjeux
