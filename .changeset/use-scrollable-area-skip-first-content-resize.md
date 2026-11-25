---
'@astryxdesign/core': patch
---

[chore] Internal: `useScrollableArea` skips the content box's first resize notification so a mounted scrollable area measures once instead of scheduling a second pass on the next frame.

@rheatkhs
