---
'@astryxdesign/cli': patch
---

[fix] Three menu items in two page templates now respond instead of doing nothing. In the grouped issues table, "Edit issue" opens the issue's detail panel and "Duplicate" confirms with a demo toast. On the kanban board, "Assign to me" confirms with a demo toast. Each toast handler carries a comment that marks where to connect the real action.

@josephfarina
