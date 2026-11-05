---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a standalone sheet (not a `BottomSheetSwitcher` step) removed while it is open (rendered only while open, or removed with the rest of a view) returns focus where a close would send it, while that place is still on the page: to `finalFocusRef`, else the control that opened it, or into the sheet beneath. A whole stack of standalone sheets removed at once returns focus to the first sheet's `finalFocusRef` or opener. When none of these is left on the page, for example when the opener is removed with the sheet, focus stays where the browser leaves it. Focus the person had already moved out of a sheet, to the page body, stays where it is. A sheet that opens in the same update keeps focus, and removing a covered sheet under a top sheet that stays moves no focus.

@cixzhang
