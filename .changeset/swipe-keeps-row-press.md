---
'@astryxdesign/core': patch
---

[fix] A finger's or a pen's swipe on an `Item` or `ListItem` row keeps the row's pressed tint through the drag. The tint no longer goes out as the row starts to move. It clears when the finger lifts, and a row that rests open shows none. A flick that starts before the tint shows still shows none.

@vjeux
