---
'@astryxdesign/core': patch
---

[fix] The layer runtime syncs its close-start and replayed-show refs at commit, not during render, and its keep-open press reads the committed open state or the shown layer. A render React discards no longer leaves its values for later callbacks.

@vjeux
