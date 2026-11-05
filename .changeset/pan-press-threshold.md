---
'@astryxdesign/core': patch
---

[chore] Internal: a pan gesture's begin threshold can be read from each press's first touch, so a mouse or a pen can begin a pan sooner than a finger. It is not exported from the package entry point, and nothing changes for existing callers.

@vjeux
