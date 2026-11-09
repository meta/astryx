---
'@astryxdesign/core': patch
---

[docs] Tab's docs show how to run the selected indicator edge to edge in one strip: a nested `Theme` that takes the app's color mode, extends the app's theme and sets `insetInline: '0'` on the `tab-indicator` target, so other TabLists keep the default indicator. The override is best effort across releases.

@cixzhang
