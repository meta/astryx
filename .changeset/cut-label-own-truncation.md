---
'@astryxdesign/core': patch
---

[fix] On a right-to-left page, a cut Latin label keeps its start in Outline item labels, the Chat trigger menu's default item labels (a trigger without `renderItem`), ChatToolCalls' tool names and targets, and TopNav's plain-text mobile-bar heading, as Button and SegmentedControl labels already do. A label with a right-to-left letter keeps the page's direction.

@cixzhang
