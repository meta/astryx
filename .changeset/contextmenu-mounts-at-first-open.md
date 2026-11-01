---
'@astryxdesign/core': patch
---

[fix] A context menu that was never opened no longer mounts its menu surface; it mounts at the first open and shows as it attaches. A Table whose cells carry context menus (row expansion gives every body cell one) showed its first rows after a minute or more at 2,000 rows in Safari; it now shows them in a few seconds.
@vjeux
