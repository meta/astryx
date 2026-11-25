---
'@astryxdesign/core': patch
---

[perf] `ScrollableArea` and other components built on `useScrollableArea`, a scrolling `LayoutContent`, `LayoutPanel` or `StackItem`, and `AppShell`'s main region under `height="fill"` measure once as they mount. The first resize notifications of the region and of its content arrive together, and the first measurement already reads them, so they no longer schedule a second full measurement for the next frame. A later resize still measures.

@bstcoc
