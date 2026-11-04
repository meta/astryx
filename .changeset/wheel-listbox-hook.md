---
'@astryxdesign/core': patch
---

[chore] Internal: the Wheel's two presentations, the scrolling column under a mouse and the picker wheel under a finger, share one listbox hook for their ids, ARIA attributes, Arrow, Page, Home and End keys, and row clicks. Each keeps where its moves start: the scrolling column steps from the row under its band, and the picker wheel from the row it is heading to.

@vjeux
