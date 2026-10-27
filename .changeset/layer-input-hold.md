---
'@astryxdesign/core': patch
---

[chore] Internal: one input hold for every layer (`Layer/inputHold`). While a layer presents, a touch, a press or a click anywhere reaches nothing (keys and assistive technology still act, and a pinch still zooms the page); while it dismisses, the same, and the layer's content is inert. The gesture host holds the layer's touches through its touch gates, and `isInputShield` lets a hit test see past a hold's shield. Not exported from the package entry point; ContextMenu's touch lift uses it.

@vjeux
