---
'@astryxdesign/core': patch
---

[fix] Toast ids and haptic label ids are now one sequence across the package and a swizzled copy. Before, each copy counted from 1, so a toast from a swizzled component and a toast from the package could share an id in the same queue, and dismissing one removed the other; two haptic switches could also give their labels the same element id, which breaks their names. No API changes.

@cixzhang
