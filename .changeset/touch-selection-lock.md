---
'@astryxdesign/core': patch
---

[fix] Under a finger or pen, holding a control whose hold does something (a slider's thumb, a switch's or a segmented control's drag) no longer starts text selection or the iOS callout; they come back when the finger lifts. A control or row whose hold does nothing keeps the browser's long-press selection. Text fields keep their selection, a link keeps its native menu and preview, and where the primary pointer is fine (a mouse, a trackpad, a touchscreen laptop, a desktop pen tablet) every contact keeps desktop selection. There, the press controller also registers no touch listener.

@vjeux
