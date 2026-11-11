---
'@astryxdesign/core': patch
---

[fix] Text and Heading: on Android, the first tap on a focusable element inside truncated text (a button or link in the clamped line) opens the truncation tooltip, as on iOS. The tap focused the element first, and that pointer focus took the tap; now only a keyboard-visible focus counts.

@cixzhang
