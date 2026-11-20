---
'@astryxdesign/core': patch
---

[fix] In a web app added to the iOS Home Screen, a finger's pick no longer clicks the control beneath. This holds for DropdownMenu and every menu on the press model. There WebKit can still send `mousedown`, `mouseup` and a click after the pick's cancelled `touchend`, at the point where the touch began. The click guard now stays armed for them, for 400 ms from that `touchend` or until the next press.

@vjeux
