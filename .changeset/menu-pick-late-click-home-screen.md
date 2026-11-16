---
'@astryxdesign/core': patch
---

[fix] In a web app added to the iOS Home Screen, a finger's pick no longer clicks the control beneath. This holds for DropdownMenu and every menu on the press model. There WebKit can make a touch's `touchstart` uncancelable. It then still sends `mousedown`, `mouseup` and a click after the pick's cancelled `touchend`, at the point where the touch began. The click guard now stays armed for them when the `touchstart` was not cancelable, for 400 ms from that `touchend`.

@vjeux
