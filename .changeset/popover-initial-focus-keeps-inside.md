---
'@astryxdesign/core': patch
---

[fix] Popover, usePopover: the initial-focus frame no longer takes focus back from a control inside the popover. A field the app focuses in `onShow`, or a control the person presses before the frame runs, keeps focus instead of moving to the first control. (#8984)
@HelloOjasMutreja
