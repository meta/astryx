---
'@astryxdesign/core': patch
---

[fix] A finger that catches a settling BottomSheet and holds it no longer starts selecting the sheet's text. Where a long press fires `selectstart`, the sheet cancels it and changes no style, so nothing repaints; on iOS, whose long press fires none, selection and the touch callout are off on the sheet while a finger holds or drags it.

@vjeux
