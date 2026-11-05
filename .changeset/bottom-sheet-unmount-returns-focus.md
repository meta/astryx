---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a sheet removed while it is open (rendered only while open, or removed with the rest of a view) returns focus where a close would send it: to `finalFocusRef`, else the control that opened it, or into the sheet beneath. Focus no longer drops to the page, so keyboard and screen-reader users keep their place. A sheet that opens in the same update keeps focus, and removing a covered sheet moves no focus.

@cixzhang
