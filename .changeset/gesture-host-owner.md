---
'@astryxdesign/core': patch
---

[chore] Internal: the gesture host becomes the one document-level touch owner: a scroll lock's page hold, finger scrolls, the finger count, touch gates, and a kept press for continuous-tracking controls. A second finger fails a one-finger pan that has not claimed, so the page can pinch. Where the primary pointer is fine, the host attaches nothing and registers no listener, following the pointer when it changes; a recognizer that reads each event's pointer itself opts out with `perEventPointer`, and a press tracker with it gets press feedback only. A press tracker whose hold acts (a stepper's hold-repeat) can bring a selection lock for its presses, as a recognizer can. Internal, used by the touch components; not exported from the package entry point.

@vjeux
