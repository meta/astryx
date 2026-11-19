---
'@astryxdesign/core': patch
---

[perf] A scrolling `LayoutContent`, `LayoutPanel` or `StackItem`, and `AppShell`'s main region under `height="fill"`, read no layout while they mount. Each one measures whether it overflows at the browser's first resize notification after layout. A region that mounts with a `Dialog`'s body no longer forces a style and layout pass before the dialog opens. The region's group role and name, and main's tab stop, arrive with that first notification.

@vjeux
