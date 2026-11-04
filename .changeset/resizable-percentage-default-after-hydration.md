---
'@astryxdesign/core': patch
---

[fix] A server-rendered `useResizable` region whose `defaultSize` is a percentage and that has no `containerRef` hydrates with the server's markup, then resolves the percentage against the window, instead of keeping the size the server resolved.

@vjeux
