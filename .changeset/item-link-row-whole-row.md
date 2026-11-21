---
'@astryxdesign/core': patch
---

[fix] An `Item` or `ListItem` with `href` and no `onClick` now follows its link from anywhere on the row, not only from the label: a press on the start content, the end content or the row's padding activates the row's link. Under a finger a `ListItem` row already did this, so the change is for a mouse or a pen, and for a standalone `Item` under any pointer. A press that starts or ends on a nested control, and a text selection, do nothing to the link, and a modified or middle press does what the same press on the link does. (#9537)

@cixzhang @duytbp
