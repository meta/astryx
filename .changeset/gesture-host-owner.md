---
'@astryxdesign/core': patch
---

[chore] Internal: the gesture host becomes the one document-level touch owner: a scroll lock's page hold, finger scrolls, the finger count, touch gates, and a kept press for continuous-tracking controls, whose element gets `touch-action: manipulation` where the pointer is coarse. A second finger fails a one-finger pan that has not claimed, so the page can pinch. A scroll-edge pan holds a lone finger from the first move that pulls away from an edge every scroller under it is at, so those moves are cancelled before it begins; with a second finger anywhere on the screen the page keeps its pinch. Where the primary pointer is fine, the host attaches nothing and registers no listener, following the pointer when it changes; a recognizer that reads each event's pointer itself opts out with `perEventPointer`, and a press tracker with it paints a finger's press feedback only, with no control event and no mouse or pen press. A press tracker whose hold acts (a stepper's hold-repeat) can bring a selection lock for its presses, as a recognizer can. Internal, for the touch components that adopt them; not exported from the package entry point.

@vjeux
