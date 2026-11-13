---
'@astryxdesign/core': patch
---

[fix] A Link whose label has no break opportunity, such as a bare URL, now wraps inside a narrow column instead of running past it and making the page scroll sideways. The Link stops at its container, and its label may shrink so that its text wraps. A Link in a line wide enough for its label looks the same.

@cixzhang
