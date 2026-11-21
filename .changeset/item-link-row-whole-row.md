---
'@astryxdesign/core': patch
---

[fix] An `Item` or `ListItem` with `href` now follows its link from anywhere on the row, not only from the label: a press on the start content, the end content or the row's padding activates the row's link. Presses on nested controls and text selections still do nothing to the link, and a modified or middle press does what the same press on the link does. (#9537)

@cixzhang @duytbp
