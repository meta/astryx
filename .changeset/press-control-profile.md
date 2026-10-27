---
'@astryxdesign/core': patch
---

[fix] Under a finger, a button, card, link or other control now highlights in the frame the finger lands, as UIKit's controls do, instead of after a 150 ms delay; inside a scroller it still waits that delay (a flick paints nothing), and a scroll that takes a held press cancels it with no fade. List rows (Item, TreeList) wait the 150 ms delay only inside a scroll view, and are cancelled by 10 px of travel. `usePressFeedback` is unchanged: a local pressable it marks is tracked as a control. The press controller now keeps only two passive listeners on the document at rest and attaches the rest while a press is live. A mouse on a desktop keeps `:active`.

@vjeux
