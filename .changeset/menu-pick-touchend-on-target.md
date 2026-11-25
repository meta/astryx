---
'@astryxdesign/core': patch
---

[fix] DropdownMenu and every menu on the press model: a finger's pick that closes the menu now cancels that touch's `touchend` on the node the touch began on, so the browser sends no click to the control beneath the finger. A pick in a submenu takes its row out of the document before the `touchend` arrives, so the window never received it, and on a busy main thread the browser's click reached what was under the finger after the 400 ms click guard window. Item and radio item picks are covered.

@vjeux
