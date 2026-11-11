---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a move of a touch drag no longer restyles the sheet's content. Each move writes the scrim's opacity on the dialog as a custom property, and the property inherited into the sheet, so the browser restyled every element in the sheet on every move: 51 elements a move in a Tall sheet with a short list, 84 in PowerSearch's Filters sheet with three filters, and more with more content. The sheet's panel now ends that inheritance, and a move restyles the dialog, its backdrop, the panel and the edge tint. The scrim follows the drag as before. This applies to the sheet that owns the scrim: a single BottomSheet, or the first sheet of a stack, such as PowerSearch's Filters sheet and Tokenizer's sheet.

@imdreamrunner
