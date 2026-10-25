---
'@astryxdesign/core': patch
---

[fix] Tapping the clear button of a TextInput or NumberInput that is not focused now brings up the iOS keyboard. The field took focus a frame after the tap, and iOS Safari only raises its keyboard for a focus made while handling the touch, so the field ended up focused with no keyboard. The focus now happens inside the tap, still with `preventScroll`, so a scrolled page stays put.

@vjeux
