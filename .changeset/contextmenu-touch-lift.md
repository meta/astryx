---
'@astryxdesign/core': patch
---

[feat] ContextMenu where the primary pointer is coarse and the menu opens at the finger: when the held finger opens the menu on a block trigger, the trigger lifts out of the page, as on iOS. It grows by up to 15% above a tinted page, its spot in the page held, and the menu fades in beside it, below when it fits, else above. A tap on the tint closes the menu and reaches nothing beneath; the trigger returns to its place. The lifted trigger casts no shadow; one with no background of its own, such as a row of text, lifts on the theme's surface, rounded. An inline trigger, the bottom sheet, `presentation="popover"` and a menu opened by mouse or keyboard keep today's look.

@vjeux
