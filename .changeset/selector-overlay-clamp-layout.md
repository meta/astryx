---
'@astryxdesign/core': patch
---

[fix] A `Selector` opened near the bottom of the viewport keeps its whole option list inside the viewport, and a page scroll with the list open keeps it there too. The selected-item overlay realized its viewport clamp as a negative margin on the anchored layer, which anchor positioning's fit check swallowed, so the last options lay past the viewport's end and could not be pointed at. The overlay's layer now clamps in layout: it takes no position fallbacks, and its insets place the selected row on the trigger inside the viewport's gutters, so the software keyboard's cap and every other reader of the layer's box see the same place. At an inline edge of the viewport the list now keeps the runtime's gutter instead of sitting 2px from the edge. No public API change: `useSelectedItemOffset` keeps its `offset` and `isPositioned` return.

@vjeux
