---
'@astryxdesign/core': patch
---

[fix] `SideNavItem`: in an expanded rail, a label that does not fit wraps onto more lines instead of ending in an ellipsis, so a larger text size never hides it. End content such as a badge sits beside the label's first line while the label's longest word and the end content fit on one line, and otherwise moves to its own line at the row's end.

@cixzhang
