---
'@astryxdesign/core': patch
---

[fix] In forced colors (Windows High Contrast), a lone `Avatar`'s initials and default person icon now take the color around them, as the browser forces it, instead of always showing CanvasText: inside a control that paints itself disabled they show GrayText. Faces inside an `AvatarGroup` keep CanvasText on the group's ring. Outside forced colors nothing changes.

@cixzhang
