---
'@astryxdesign/core': patch
---

[fix] ResizeHandle: a caller's `onFocus`, `onBlur` or `onDoubleClick` now runs beside the handle's own, so passing one no longer hides a hover-only grip pill on keyboard focus or stops a double-click from collapsing the pane. The handle also carries its `direction` for theme rules, as its docs say.

@cixzhang
