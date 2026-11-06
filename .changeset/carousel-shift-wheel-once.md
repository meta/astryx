---
'@astryxdesign/core': patch
---

[fix] Shift and one mouse wheel notch now scroll a `Carousel` row by the notch, once. Before, Firefox also scrolled the row on its own, so each notch moved it twice: React's wheel listener is passive, so Carousel could not stop the browser's scroll. A wheel with a horizontal delta, such as a trackpad swipe, and a row with nothing to scroll keep the browser's own scroll.

@vjeux
