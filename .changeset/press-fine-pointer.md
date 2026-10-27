---
'@astryxdesign/core': patch
---

[feat] A press with a mouse or a pen now shows the same pressed state a finger's does, on every device. It paints at once when the button goes down (no delay, even in a scrolling list), holds while it is down, and fades at the release on the same clock a finger's press uses, in place of the browser's `:active`. A right click, a ctrl-click on macOS and a pen's barrel button paint nothing, and a Space press is unchanged. A press on a link or a button inside a pressable row (a link in a radio option's description, for example) no longer paints the row, under a finger or a mouse.

@vjeux
