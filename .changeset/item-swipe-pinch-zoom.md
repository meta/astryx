---
'@astryxdesign/core': patch
---

[fix] A row with `swipeActions` no longer blocks pinch-zoom. A pinch that started on a swipeable `Item` or `ListItem` did nothing, because the row declared `touch-action: pan-y`, and a sideways pinch could also be taken as a swipe. The row now leaves pinch to the browser (`pan-y pinch-zoom`), and a second finger that lands before the swipe has begun, on the row or anywhere else, hands the touch to the browser, so the page zooms and the row stays where it is. One-finger swipes and vertical scrolling are unchanged.

@vjeux
