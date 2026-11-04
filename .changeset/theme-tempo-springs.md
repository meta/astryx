---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] Motion: a theme's `tempo` now times the springs of touch motion as well as its CSS durations. Each spring keeps its shape and takes `tempo` times as long, and so does the animated-layout glide. Finger tracking and busy loops stay as measured, a theme with only a duration scale leaves the springs at tempo 1, and the springs don't follow `character` yet. The motion doc says so.

@vjeux
