---
'@astryxdesign/core': patch
---

[experimental] Gesture host fixes: a scroll the page makes under a still finger (scrollIntoView, a pinned transcript, scroll anchoring) no longer cancels the press or swallows its click; recognizers that never claim (`claimsTouches` false) get no blocking `touchmove` listener, and a finger's target listener is passive unless a recognizer on that touch can claim; a claimed pen holds only its own stylus touches; an element's own `touch-action` is never widened; content slotted into a shadow-tree scroller scrolls with it; the delegated press stays idle while the document press controller holds the same attribute.

@vjeux
