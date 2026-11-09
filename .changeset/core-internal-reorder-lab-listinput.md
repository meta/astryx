---
'@astryxdesign/core': patch
---

[chore] Internal: the undocumented `@astryxdesign/core/internal/reorder` entry also gives Lab's `ListInput` List's reorder session for rows that are not ListItems: `useListReorderScope` and `ListReorderScope`. `List` runs its own rows' session through the same session hooks, so its callers see no change. A ListInput string joins Core's message catalog. Internal entries are outside the public API and its compatibility promise.

@vjeux
