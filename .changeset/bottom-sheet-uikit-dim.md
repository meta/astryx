---
'@astryxdesign/core': patch
---

[fix] Under a finger, on every touch device, a BottomSheet's scrim follows the sheet the way an iOS sheet's dim does. Dragged below its shortest detent, the dim thins in a straight line with the sheet's position and clears only when the sheet reaches the bottom of the screen; it used to clear 40 % of the shortest detent's height below it. A standalone sheet's dim follows the finger at once instead of easing behind it over the theme's medium duration (410 ms by default). When the sheet settles or is flung away, the dim rides the same spring frame for frame, on the compositor. Under a mouse the dim follows the same line, clearing only once the sheet is gone, and the host still eases it. A peek detent's lighter scrim is unchanged.

@vjeux
