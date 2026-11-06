---
'@astryxdesign/core': patch
---

[fix] A modal `Dialog` or `Drawer` that starts or ends with a group of native radios that share a `name` now keeps Tab inside it. The group is one Tab stop, as the browser treats it: Tab from its checked radio (or its first, when none is checked) wraps to the first control, Shift+Tab from the first control wraps into the group at its checked radio, and the same holds for a group at the start.
