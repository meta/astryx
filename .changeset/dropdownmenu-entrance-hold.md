---
'@astryxdesign/core': patch
---

[fix] On a phone or a tablet, a finger's tap or drag that lands while a DropdownMenu is still opening is now ignored, as on iOS: the menu finishes opening, stays open and keeps focus, and nothing under the tap reacts. The finger that opened the menu still picks a row. Keys and assistive technology stay live. A mouse, a finger on a touchscreen laptop and `presentation="popover"` are unchanged.

@vjeux
