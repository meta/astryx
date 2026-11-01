---
'@astryxdesign/core': patch
---

[fix] A BottomSheet's drag runs on the shared gesture recognizers under every pointer, a finger, a pen and a mouse: it begins after 10 px of travel and moves the sheet by the travel past that, as UIKit's does; a slow pull down from the top of the sheet's content moves the sheet instead of rubber-banding the content; and a second finger that lands during a drag no longer sends the sheet back to its detent. A mouse, like a finger, pulls the sheet down from the top of its content and up from its end while a taller detent exists, and its release dismisses the sheet or picks a detent by the same rule as a finger's. A mouse, and a pen or finger where the primary pointer is fine, keep the pointer's tracking and the theme's release timing.

@vjeux
