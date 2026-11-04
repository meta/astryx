---
'@astryxdesign/core': patch
---

[chore] Internal: `Overlay` copies its first child's corner radius onto its wrapper from the wrapper's ref callback, not from a layout Effect. The radius still lands before the first paint. Nothing a consumer imports or renders changes.

@cixzhang
