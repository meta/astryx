---
'@astryxdesign/core': patch
---

[fix] Under a finger, a pressable (a button, card, link, list row or any other surface) outside a scroll view now highlights in the frame the finger lands, as UIKit's controls do, instead of after a 150 ms delay. Inside a scroll view it still waits that delay, so a flick paints nothing, and a scroll that takes a held press cancels it with no fade. A page that scrolls counts as a scroll view, so on a page taller than the screen a press still waits; a control in a fixed bar, or on a page that fits, highlights at once. A mouse on a desktop keeps `:active`.

@vjeux
