---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[chore] Internal: when a caller asks the palette for one mode, its code colors and the text on each status fill now hold both modes, taking the drawn mode's stop as the other derivations do. A dark-only call no longer throws. Every caller passes both modes, so no output changes.

@vjeux
