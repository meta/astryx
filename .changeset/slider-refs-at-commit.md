---
'@astryxdesign/core': patch
---

[fix] Slider syncs its values, change-end callback and touch update refs at commit. After a render React discards, as a suspended transition does, a press on the track reports the committed value to the committed `onChangeEnd`, and a finger dragging a thumb reports to the committed `onChange`.

@vjeux
