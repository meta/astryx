---
'@astryxdesign/core': patch
---

[fix] `TabList` tabs, including a `TabMenu` tab, grow with a larger text size. Their size now sets a minimum height instead of a fixed one, so at 200% text and above a tab label is no longer clipped. At the default text size nothing changes.

@cixzhang
