---
'@astryxdesign/core': patch
---

[perf] Opening a menu, popover, hover card or other anchored layer does less work in the press handler. The layer writes its entrance side in the frame after it shows, before that frame's paint, instead of during the press, so moving focus in and measuring touch targets no longer restyle the layer inside the tap's own task. The entrance-side values no longer pass to every element inside the layer. At a slow phone's speed a Popover's press handler finishes about 4–5 ms sooner, and its first visible frame lands at the same time as before. The entrance is unchanged. Apply `layerAnimations` to the layer or its direct child; a deeper element plays the placement's default side.
