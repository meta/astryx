---
'@astryxdesign/core': patch
---

[fix] ResizeHandle: a caller's `onFocus`, `onBlur` or `onDoubleClick` now runs beside the handle's own, so passing `onFocus` no longer keeps a hover-only grip pill hidden on keyboard focus, passing `onBlur` no longer leaves it shown after focus leaves, and passing `onDoubleClick` no longer stops a double-click from collapsing the pane. The handle also carries its `direction` for theme rules, as its docs say.

@cixzhang
