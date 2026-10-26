---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] Under a finger, on every touch device (iOS and Android alike), a ContextMenu opened by a held finger now presents as iOS 26's does. A block trigger itself lifts out of the page, with no copy and with its spot in the page held: it grows on from the press to 26 px larger on its longer side (15% at most), with the theme's high shadow fading in under it, over the theme's overlay, and it stays inside the layer runtime's viewport gutter. A tap on the tint closes the menu; while the lift is still growing, a tap or a drag closes nothing and reaches nothing under it, and the menu finishes opening (keys still work). The menu sits 16 px from the lifted trigger, below it when it fits and above it otherwise, centered on it or flush with the edge it is held against (right-to-left pages included), and fades in, with no row lit until the finger moves onto one. Closing returns the trigger to its place. Under Reduce Motion the animator cross-fades everything in place instead, in 200 ms, as the reduced-motion design record asks: nothing travels or grows. Inline triggers, pointer opens and the bottom sheet are unchanged. A fine pointer keeps today's menu at the cursor.

The tint is the theme's modal overlay (`--color-overlay`).

@vjeux
