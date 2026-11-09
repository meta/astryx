---
'@astryxdesign/core': patch
---

[chore] Internal: the undocumented `@astryxdesign/core/internal/reorder` entry lets Lab's `TransferList` and `TransferListSelector` reorder through a `createReorderable` object: `adaptReorderable` runs the owner's engine with the collection's own moves, and the owner's `start(key)` still finds the collection's list. Existing `List` callers are unchanged. Internal entries are outside the public API and its compatibility promise.

@vjeux
