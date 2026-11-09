---
'@astryxdesign/core': patch
---

[perf] Closing a Popover or DropdownMenu with Escape, or a DropdownMenu with a pick or a press on its trigger, runs one layout again, not two. A closed trigger stops being a CSS anchor, and these closes took the trigger's anchor name away after the hide's own layout, so the browser laid out once more. Our hide now drops the name before its layout, unless the layer's closed state keeps it shown to fade out. A close the browser runs itself, such as a light dismiss, still drops the name at its toggle event. A layer that fades out keeps the name until its fade ends.

@vjeux
