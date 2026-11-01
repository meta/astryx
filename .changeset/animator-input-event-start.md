---
'@astryxdesign/core': patch
---

[chore] Internal: the touch animator takes `start: 'next-frame'` for a call made in an input event's own task (a key, a click, a pointer, a touch). Such a call from rest starts at the first frame after that task, in Chromium and in WebKit, so a later listener of the same event that holds the page delays the motion instead of letting it skip into its curve. Not exported from the package entry point.

@vjeux
