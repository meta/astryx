---
'@astryxdesign/core': patch
---

[fix] Text and Heading: on Android, the first tap on a button or link inside truncated text opens the truncation tooltip, as on iOS. The tap focused the element first, and that focus took the tap; now only a keyboard focus counts. A tap on a text field inside truncated text only focuses the field, so no tooltip covers text you start to type.

@cixzhang
