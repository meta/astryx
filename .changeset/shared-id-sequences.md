---
'@astryxdesign/core': patch
---

[fix] Toast ids are now one sequence across the package and a swizzled copy of `useToast`. Before, each copy counted from 1, so a toast from a swizzled Toast and a toast from the package could share an id in the same queue, and dismissing one removed the other. No API changes.

@cixzhang
