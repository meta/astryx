---
'@astryxdesign/core': patch
---

[fix] A swizzled `List`, `TransferList` or `ListInput` and the package now agree on a `createReorderable` object: its reorder machinery is read through a registered, versioned key. Before, a swizzled `List` found no machinery on an object from the package and showed no reorder handles. No API changes.
@vjeux
