---
'@astryxdesign/core': patch
---

[chore] Internal: the touch presentations' animator rechecks a finished animation's end in frame callbacks, starting a frame before it and looking again while up to two frames remain, instead of only on timers that a loaded page can run a frame or two late, so the frame that reaches the curve's end drops the animation before it paints, unless the timer that starts those rechecks itself runs more than a frame late. The timers remain for a page that draws no frames. Not exported from the package entry point.

@vjeux
