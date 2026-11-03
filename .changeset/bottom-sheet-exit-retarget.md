---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a sheet whose height moves by a fraction of a pixel as it starts closing now slides off instead of vanishing. This happens in Chromium, for example, when a sheet that fits its content is dismissed by a drag. The browser replaces the exit's transform transition when that transition's end value changes mid-flight. The exit treated the cancelled transition as its end and closed the dialog before the sheet had moved. It now waits for the replacement transition to finish.

@vjeux
