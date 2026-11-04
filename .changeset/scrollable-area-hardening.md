---
'@astryxdesign/core': patch
---

[fix] `getContentProps` from `useScrollableArea` now applies a caller's `xstyle` instead of leaking it to the DOM. (#6314)

A viewport that lost overflow while focused drops its leftover `tabindex` as soon as it is blurred, and a focused viewport in another document keeps focus when it loses overflow. `ScrollableArea`'s viewport also sheds the obsolete `-webkit-overflow-scrolling` and initial-value scrollbar declarations.

@AKnassa
