---
'@astryxdesign/core': patch
---

[fix] BottomSheet: a window resize while the sheet settles (after a release, or after a drag is cancelled) now carries the sheet to its detent as the new window resolves it. Before, a phone rotation during that settle could leave the sheet at its old height, off its stop, until the next resize, which then moved it in one jump.

@vjeux
