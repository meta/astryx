---
'@astryxdesign/core': patch
---

[fix] BottomSheet: in Safari, and in every browser on iPhone and iPad, a swipe on the sheet's content that starts slowly now moves the sheet, so a slow swipe down can close it. Before, on content that fits, when the finger's first move was 8 px or less, in either direction, the sheet stopped answering that swipe: it stayed open, or moved a few pixels and fell back. Fast swipes and swipes on the grab bar already worked, and Chromium browsers were not affected. The fix applies wherever the touched content has nothing to scroll: a sheet whose content fits, and the fixed header or footer around a list. That includes the PowerSearch and Tokenizer sheets. At the top of a list that scrolls, a pull down now also moves the sheet when the finger first wobbles up by less than 5 px; a move up of 5 px or more still scrolls the list. In every browser, the sheet now decides who owns a touch on its content once, at the first move past 8 px. A mostly vertical pull at a scroll edge is the sheet's. A mostly sideways move, such as a swipe along a row of chips, is not the sheet's for the rest of that touch. Before, at the top of a list, a sideways swipe that drifted more than 8 px down, or a pull that began more sideways than down, also moved the sheet.

@imdreamrunner
