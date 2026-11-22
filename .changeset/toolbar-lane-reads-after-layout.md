---
'@astryxdesign/core': patch
---

[fix] A Toolbar with a bottom divider no longer reads its lanes' boxes while it mounts. It reads them at the browser's first resize notification, after layout, so a mount does not force layout early. A row that wraps still keeps a tab's indicator on its tab.

@cixzhang
