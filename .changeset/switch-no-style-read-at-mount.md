---
'@astryxdesign/core': patch
---

[perf] `Switch` no longer reads styles when it mounts. It read its writing direction when it mounted, and under a coarse pointer also a theme's thumb size and its fade colour. Each read made the browser compute styles inside the task that mounts the switch, such as a dialog's open. Each is now read at its first use, at the first press or value change. Dragging, right-to-left layouts, theme thumb sizes and the colour fade work as before.

@vjeux
