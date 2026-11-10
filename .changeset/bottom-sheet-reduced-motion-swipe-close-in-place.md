---
'@astryxdesign/core': patch
---

[fix] Under reduced motion, a `BottomSheet` that a finger's swipe dismisses fades out where the finger left it. Before, it jumped back to its open position in one frame and faded from there. With motion, the next open after such a swipe rises from below the screen again, instead of starting where the finger left the sheet.
@vjeux
