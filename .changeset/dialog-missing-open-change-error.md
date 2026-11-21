---
'@astryxdesign/core': patch
---

[fix] In development, `Dialog`, `AlertDialog`, `Drawer`, `BottomSheet` and `Lightbox` without an `onOpenChange` callback (for example with `onClose`) throw an error that names the prop and shows the fix when they close, instead of "onOpenChange is not a function". Production output is unchanged.

@josephfarina
