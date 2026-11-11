---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a finger's pull down on the sheet's content is handled by the sheet's touch listeners alone, and it releases at the speed of the whole pull. Before, the content's pointer handlers, which serve a mouse or a pen, began the same drag first and took pointer capture, and the capture change cancelled that drag one move later. The touch listeners then began the drag again, or, in Chromium, the content's own pan could start under it. The release speed counted only the moves after the drag began, so a fast flick on the content that the page received as two or three moves read as no speed and sprang back, where the same flick on the grab handle closed the sheet. A flick on the content now closes the sheet as a flick on the grab handle does. This also applies to the sheets that Tokenizer and PowerSearch open. A mouse or pen pull from the content also releases at the speed of the whole pull. No release threshold changes.

@imdreamrunner
