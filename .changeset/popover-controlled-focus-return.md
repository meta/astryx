---
'@astryxdesign/core': patch
---

[fix] `usePopover` keeps its focus-return target when `show()` runs again after initial focus has moved inside the popover, so a close returns focus to the element that opened it instead of losing it.

@vjeux
