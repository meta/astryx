---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a sheet closed from a control inside it, such as a Done button, a Selector's search field or a menu row, marked itself `inert` and `aria-hidden` while that control still had focus. The browser then dropped focus to the page, or screen readers were left in a hidden subtree, for the length of the exit. Now a sheet that closes with focus inside it stays out of `inert` and `aria-hidden` and ignores pointer input during its exit, then returns focus to its opener and closes. The exit still plays. A sheet that closes with focus elsewhere goes inert at once, as before.

@cixzhang
