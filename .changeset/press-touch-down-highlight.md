---
'@astryxdesign/core': patch
---

[fix] Under a finger, a pressable (a button, card, link, list row or any other surface) now highlights in the frame the finger lands, as UIKit's controls do, instead of after a 150 ms delay. Inside a scroller it still waits that delay, so a flick paints nothing, and a scroll that takes a held press cancels it with no fade. A mouse on a desktop keeps `:active`.

@vjeux
