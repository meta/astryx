---
'@astryxdesign/core': patch
---

[perf] Importing `ResizeHandle` on its own no longer pulls in `useResizable` and its resize controller. The handle reads the hook's collapse, release and maximum details from the resize model instead, so its static import graph drops from 90 to 84 modules. A bundler that tree-shakes already dropped most of that code (25 bytes gzip less); one that keeps whole modules loads the controller only with the hook.

@cixzhang
