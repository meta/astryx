---
'@astryxdesign/core': patch
---

[feat] TimeInput, DateTimeInput: under a finger, the bottom sheet's minute wheel loops, as UIDatePicker's does: past 59 comes 00, and the hour stays, as on iOS. A drag, a fling, a tap or an arrow key passes the seam. Home, End and a click on a minute never pass it. The hour wheel does not loop yet. Each minute is still listed once for assistive technology.

@vjeux
