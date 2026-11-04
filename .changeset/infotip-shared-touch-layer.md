---
'@astryxdesign/core': patch
---

[fix] Under a finger, `InfoTip`'s button takes taps through the same invisible touch layer as `List` rows. Its target still grows toward 44px where its neighbors leave room. It now waits for motion around the button to end before it grows, and it clears when the button stops taking taps.

@vjeux
