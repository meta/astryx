---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] In Chrome on Android, on a touch screen, a Tall BottomSheet places the focused field just above the on-screen keyboard when Chrome reports it, then rides the rest of Gboard's slide; through the hide the sheet's scroll room stays while its content rides down, so nothing jumps while the keyboard is still on screen. Under Reduce Motion it cross-fades instead of moving. The browser-support guide says so.

@vjeux
