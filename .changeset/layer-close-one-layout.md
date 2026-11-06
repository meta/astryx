---
'@astryxdesign/core': patch
---

[perf] A layer placed against its trigger (Popover, DropdownMenu, Tooltip and the like) runs one layout again, not two, when its own hide closes it: a trigger press, Escape or a pick. A closed trigger stops being a CSS anchor, and the close took the trigger's anchor name away after the hide's own layout, so the browser laid out once more. That hide now drops the name before its layout, unless the layer stays in view to fade out. A close the browser runs itself, such as a light dismiss, still drops the name at its toggle event, once it can see whether the layer still fades. A layer that fades out keeps the name until its fade ends.

@vjeux
