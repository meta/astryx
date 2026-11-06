---
'@astryxdesign/core': patch
---

[chore] Internal: `Dialog`, `Drawer` and `BottomSheet` hand the toast viewport back to the page through a callback ref when they close or unmount, in place of a layout cleanup. A toast still stays on screen while the modal closes. Apps see no change.

@cixzhang
