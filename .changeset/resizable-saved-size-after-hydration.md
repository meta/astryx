---
'@astryxdesign/core': patch
---

[fix] A server-rendered `useResizable` region with an `autoSaveId` hydrates with the server's markup and takes its saved size in the next commit, so hydration no longer reports a mismatch and the handle announces the saved size.

@vjeux
