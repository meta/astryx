---
'@astryxdesign/core': patch
---

[fix] BottomSheet: when a touch flick closes a sheet, the dim behind it now clears in step with the sheet. Before, the sheet was gone in about a tenth of a second while the dim was still mostly there, and it kept fading for over half a second more. The fade now follows the close spring's own progress. Reduced motion and every other close are unchanged.

@cixzhang @vjeux
