---
'@astryxdesign/core': patch
---

[chore] On iOS, a touch on an element the compositor animator is moving reaches what is drawn: the animator reports each moving element's offset from its layout box, and the gesture host sends the touch, press bounds and the tap's click there instead of to the layout position iOS WebKit hit-tests.

@vjeux
