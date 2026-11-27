---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[chore] Internal: the palette's code colors and status text colors fill both modes when a caller passes one, taking the drawn mode's stop as the other derivations do. A dark-only call no longer throws. Every caller passes both modes, so no output changes.

@vjeux
