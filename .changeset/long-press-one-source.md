---
'@astryxdesign/core': patch
---

[fix] `useLongPress` (ContextMenu's long press, and the held finger that opens a menu from its trigger) now cancels when the finger travels more than 10px from where it landed, measured as a distance, as UIKit's long press does. Before, it allowed 10px on each axis, so a diagonal drift of up to about 14px kept the press. Its duration and tolerance now come from the same source as the long-press gesture recognizer.

@vjeux
