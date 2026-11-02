---
'@astryxdesign/core': patch
---

[feat] Under a finger (a coarse primary pointer, on every touch device), a determinate ProgressBar moves to a new value the way iOS's progress view does: linearly, taking one second per full track of change at the theme's default tempo (0.8 s from 10% to 90%), and from wherever the fill is drawn when the value changes again mid-way. A theme's tempo scales that time. Above zero the fill never draws shorter than two track heights, and at zero it is not drawn. The motion runs on the compositor, so it keeps going while a script runs; under reduced motion, or with forced colors on, a new value lands at once. A mouse or trackpad keeps the theme's duration and easing.

@vjeux
