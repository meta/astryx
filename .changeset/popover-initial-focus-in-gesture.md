---
'@astryxdesign/core': patch
---

[fix] `Popover` and `usePopover`: in the anchored presentation, initial focus now lands within the tap or click that opens the popover, so on iOS a text or number field in it raises the on-screen keyboard at once. Focus that `onShow` moves inside the popover is no longer pulled back to the first control.

@cixzhang @HelloOjasMutreja
