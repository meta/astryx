---
'@astryxdesign/core': patch
---

[chore] Touch animations now start on the first frame after the current input event, so a later listener that holds the page cannot make the motion skip ahead. (#9261)

@vjeux
