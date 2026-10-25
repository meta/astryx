---
'@astryxdesign/core': patch
---

[chore] Internal: the gesture host becomes the one document-level touch owner: a scroll lock's page hold, finger scrolls, the finger count, touch gates, and a kept press for continuous-tracking controls. A second finger fails a one-finger pan that has not claimed, so the page can pinch. Not exported from the package entry point; no component uses it yet.

@vjeux
