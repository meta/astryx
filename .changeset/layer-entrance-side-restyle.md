---
'@astryxdesign/core': patch
---

[perf] Opening a menu, popover, hover card or other anchored layer restyles less. The entrance-side values the layer writes as it shows no longer pass to every element inside it, and the side is written in the frame after the layer shows, before that frame's paint, so moving focus in and measuring touch targets no longer restyle the layer again. At a slow phone's speed a Popover opens about 15 ms sooner and a menu about 6 ms sooner. The entrance is unchanged. Apply `layerAnimations` to the layer or its direct child; a deeper element plays the placement's default side.

@cixzhang
