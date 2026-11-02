---
'@astryxdesign/core': patch
---

[fix] A bottom-sheet DropdownMenu whose sheet preload fails (a dropped connection) no longer reports an unhandled promise rejection, and no longer keeps the failed load, so a module loader that retries loads the sheet's actions on the next open. (#8478)
@vjeux
