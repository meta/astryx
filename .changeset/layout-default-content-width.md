---
'@astryxdesign/core': patch
---

[fix] A `Layout` with no `contentWidth` no longer caps its `LayoutHeader` and `LayoutFooter` at the viewport's width. In a frame wider than the viewport, such as a scrolling canvas or a wide embed, their content now spans the frame like the rest of the Layout.

@cixzhang
