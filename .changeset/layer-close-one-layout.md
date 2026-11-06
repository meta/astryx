---
'@astryxdesign/core': patch
---

[perf] Closing a layer placed against its trigger (Popover, DropdownMenu, Tooltip and the like) runs one layout again, not two. A closed trigger stops being a CSS anchor, and the close took the trigger's anchor name away after the hide's own layout, so the browser laid out once more. The name now goes inside the hide, before that layout, when the layer leaves view with the hide. A layer that fades out keeps the name until its fade ends, as before.

@vjeux
