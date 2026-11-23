---
'@astryxdesign/core': patch
---

[perf] The header cells of a truncating Table now start to load the module for their cut headings after the browser paints the table, not before. The Table's own commit ran their effects before the paint, so the load started first. A Button's cut label waits the same way. Keyboard focus on a cut heading or label shows it in full as before.

@vjeux
