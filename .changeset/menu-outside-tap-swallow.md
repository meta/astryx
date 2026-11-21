---
'@astryxdesign/core': patch
---

[fix] Under a finger or a pen, a touch outside an open DropdownMenu now only closes it, as a native menu's does. The control under the finger no longer gets the touch's press, its compatibility mouse events or its click. A tap closes the menu at its lift, and a pan as it begins; the page still scrolls and zooms. A mouse and `presentation="popover"` keep their behavior.

@vjeux
