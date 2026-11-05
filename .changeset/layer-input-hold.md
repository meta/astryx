---
'@astryxdesign/core': patch
---

[chore] Internal: one input hold for every layer (`Layer/inputHold`). While a layer presents, a finger's or a pen's touch, press or click reaches nothing: anywhere around a modal layer, and only on the layer itself around a non-modal one, whose page stays live. A mouse passes once it moves, at once when the page last heard a mouse (keys and assistive technology still act, and a pinch still zooms the page). While it dismisses, every press and click reaches nothing, and the layer's content is inert. The gesture host asks the hold about each touch (`holdsTouch`), and `isInputShield` lets a hit test see past a hold's shield. Not exported from the package entry point; Dialog's and Drawer's entrance holds and MobileNav's drawer use it.

@vjeux
