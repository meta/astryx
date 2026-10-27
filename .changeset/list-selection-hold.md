---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[chore] Internal: under a finger, a list row tapped to push can stay selected while the pushed screen covers it, then deselect as the screen pops, as a UIKit table row does; with a mouse the press releases at the lift as before. The hold that drives it (`List/selectionHold.ts`) is internal to core, so no public export changes. The deselect runs on the compositor, and a divided list keeps the dividers around the held row hidden.

@vjeux
