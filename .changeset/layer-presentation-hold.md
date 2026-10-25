---
'@astryxdesign/core': patch
---

[chore] Internal: one presentation hold for every layer (`Layer/presentationHold`). While a layer presents, a touch, a press or a click anywhere reaches nothing (keys and assistive technology still act, and a pinch still zooms the page); while it dismisses, the same, and the layer's content is inert. The gesture host holds the layer's touches through its touch gates. Not exported from the package entry point; no component uses it yet.

@vjeux
