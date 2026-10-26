---
'@astryxdesign/core': patch
---

[chore] Internal: under a finger or pen where the primary pointer is coarse, a gesture recognizer whose hold does something (a long press by default, or any recognizer given a `selectionLock`) suppresses text selection and the iOS callout for its press, and restores them when the contact ends. A hold that does nothing keeps the browser's long-press selection, text fields keep their selection, and a mouse or a fine primary pointer never takes the lock. Not exported from the package entry point.

@vjeux
