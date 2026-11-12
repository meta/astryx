---
'@astryxdesign/core': patch
---

[fix] Text and Heading: on Android, the first tap on a button or link inside truncated text opens the truncation tooltip, as on iOS. The tap focused the element first, and that focus took the tap; now only a keyboard focus counts. Tooltip: a tap on a text field inside a tooltip's trigger focuses the field and no longer opens or closes the tooltip. This includes a text field inside truncated text.

@cixzhang
