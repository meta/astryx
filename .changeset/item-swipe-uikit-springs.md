---
'@astryxdesign/core': patch
---

[feat] Under a finger, swipe actions on `Item` and `ListItem` move like a UIKit list row, the same on every touch device. The row follows the finger on UIKit's own spring and settles on it from where it is and as fast as it was moving, so a release no longer stops dead and restarts. A flick opens the row or closes it, by its direction, and no longer fires the outermost action, which only a full swipe does (with `swipeBehavior="commit"` too). Under Reduce Motion nothing a release starts travels or springs: the row cross-fades to where it lands, as `design:reduced-motion` asks. A finger that lands on a moving row catches it instead of being ignored until the row stops.

@vjeux
