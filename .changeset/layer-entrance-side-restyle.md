---
'@astryxdesign/core': patch
---

[perf] Opening a menu, popover, hover card or other anchored layer restyles fewer elements. The entrance-side values reach the layer and the element directly inside it, not every element inside the layer. The entrance is unchanged. Apply `layerAnimations` to the layer or its direct child; a deeper element plays the placement's default side.

@cixzhang
