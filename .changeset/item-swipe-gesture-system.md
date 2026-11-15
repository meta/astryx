---
'@astryxdesign/core': patch
---

[fix] Swipe actions on `Item` and `ListItem` run on the gesture system. A row claims a sideways touch at 8 px, before a browser commits to scrolling it. From the claim the row follows the finger one for one, so the part under the finger stays under it. A pen now swipes the row as a finger does. A second finger that lands before the claim leaves the touch to the browser's pinch; once the row has claimed its finger, a second finger no longer cancels the swipe. The click a browser synthesizes after a swipe is cancelled at its source instead of being swallowed by a 400 ms timer.

@vjeux
