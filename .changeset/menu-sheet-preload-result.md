---
'@astryxdesign/core': patch
---

[chore] A bottom-sheet DropdownMenu's internal sheet preload reports a failed load in its result, with the loader's error, instead of catching it with an empty handler. Nothing changes for callers: a failed preload still raises no unhandled rejection, and the next open loads the sheet's actions.

@vjeux
