---
'@astryxdesign/core': patch
---

[fix] In block and inline layout, a Link whose label has no break opportunity, such as a bare URL from `useLinkify`, now wraps inside its line instead of running past it and making the page scroll sideways. The Link stops at its container and its label may shrink, so its text wraps. In a flex row, a Link whose label is wider than the row is now capped at the row's width and wraps. A Link in a line wide enough for its label looks the same. A content-sized grid or table column still grows to the label's longest word.

@cixzhang
