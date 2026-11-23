---
'@astryxdesign/core': patch
---

[fix] `useResizable` with `autoSaveId` saves a size after a person resizes the region: a drag, a key step, or a collapse, expand or `resize()` call. A first load no longer saves the default's size, so a percentage default keeps following the window or container on later visits until someone resizes. A size already saved is still corrected on load when the current bounds or snap points change it.

@cixzhang
