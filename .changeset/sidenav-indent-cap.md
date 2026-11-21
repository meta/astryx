---
'@astryxdesign/core': patch
---

[fix] `SideNavItem`: at a large text size in a narrow rail, the nesting indent stops growing once a row would have less than 4em of room for its label and end content, so a deep row's label and badge stay readable inside the row. At the default text size nothing changes.

@cixzhang
