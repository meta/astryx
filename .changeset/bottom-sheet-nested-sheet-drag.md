---
'@astryxdesign/core': patch
---

[fix] A BottomSheet opened from inside another sheet's content drags down to dismiss on its own. The covered sheet underneath no longer takes the gesture, so dragging the top sheet's grabber no longer moves or dismisses the sheet beneath it.

@imdreamrunner
