---
'@astryxdesign/core': patch
---

[chore] Internal: the gesture host becomes the one document-level touch owner: a scroll lock's page hold, finger scrolls, the finger count, touch gates, and a kept press for continuous-tracking controls. A second finger fails a one-finger pan that has not claimed, so the page can pinch. Where the primary pointer is fine, the host attaches nothing and registers no listener, following the pointer when it changes; a recognizer that reads each event's pointer itself opts out with `perEventPointer`. Not exported from the package entry point; no component uses it yet.

@vjeux
