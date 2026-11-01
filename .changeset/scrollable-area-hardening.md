---
'@astryxdesign/core': patch
---

[fix] Harden ScrollableArea and useScrollableArea composition and focus behavior. (#6306)

`getContentProps` now consumes caller `xstyle` instead of leaking it to the DOM, a focused viewport that lost overflow drops its retained tab stop as soon as it is blurred (focus is now tracked with events rather than read during render), and the viewport styles shed the obsolete `-webkit-overflow-scrolling` and initial-value scrollbar declarations.

@AKnassa
