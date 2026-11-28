---
'@astryxdesign/core': patch
---

[perf] In the document that loads Astryx, opening a menu, popover, hover card or other anchored layer restyles fewer elements. The entrance-side values reach the layer and the element directly inside it, not every element inside the layer. The entrance is unchanged. Apply `layerAnimations` to the layer or its direct child; a deeper element is not guaranteed the landed side.

@cixzhang
