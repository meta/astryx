---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a sheet closed from a control inside it, such as a Done button, a Selector's search field or a menu row, marked itself `inert` and `aria-hidden` while that control still had focus. The browser then dropped focus to the page, or screen readers were left in a hidden subtree, for the length of the exit. Now a standalone sheet that closes with focus inside it stays out of `inert` and `aria-hidden` while that focus stays, and ignores pointer and keyboard activation during its exit; when the exit ends, it closes and returns focus to its opener. The exit still plays. A sheet that closes with focus elsewhere, or that focus leaves during the exit, goes inert at once, as before.

@cixzhang
