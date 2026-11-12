---
'@astryxdesign/core': patch
---

[fix] ToastViewport syncs its committed list at commit. A toast that only a render React discards showed, such as a suspended transition, reports no `onHide` when a repeat replaces it and the same handler then dismisses it.

@vjeux
