---
'@astryxdesign/core': patch
---

[fix] The touch press feedback and the gesture recognizers now listen on the window's capture phase through one shared input stream: one passive listener per event type for both. An app's own capture-phase `stopPropagation` at the document no longer starves them, and a page of pressables registers no listener that can hold a scroll.

@vjeux
