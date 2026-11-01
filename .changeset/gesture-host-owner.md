---
'@astryxdesign/core': patch
---

[chore] Internal: the gesture host becomes the one document-level touch owner: the finger count, touch gates, and a kept press for continuous-tracking controls, whose element gets `touch-action: manipulation`. A scroll lock's page hold and the finger-scroll watch keep their own listeners and ask the host only about the touches it owns. A second finger fails a one-finger pan that has not claimed, so the page can pinch. A scroll-edge pan holds a lone finger from the first move that pulls away from an edge every scroller under it is at, so those moves are cancelled before it begins; with a second finger anywhere on the screen the page keeps its pinch. A press tracker whose hold acts (a stepper's hold-repeat) can bring a selection lock for its presses, as a recognizer can. Internal, for the touch components that adopt them; not exported from the package entry point.

@vjeux
