---
'@astryxdesign/core': patch
---

[chore] Internal: one input hold for every layer (`Layer/inputHold`). While a layer presents, a finger's or a pen's touch, press or click anywhere reaches nothing, and a mouse passes once it moves (keys and assistive technology still act, and a pinch still zooms the page). While it dismisses, every press and click reaches nothing, and the layer's content is inert. The gesture host asks the hold about each touch (`holdsTouch`), and `isInputShield` lets a hit test see past a hold's shield. Not exported from the package entry point; Dialog's and Drawer's entrance holds and MobileNav's drawer use it.

@vjeux
