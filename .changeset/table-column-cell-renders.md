---
'@astryxdesign/core': patch
---

[fix] With `useTableColumnsVirtualization`, a horizontal scroll that changes which columns are mounted now renders only the cells of the columns that enter. Before, every mounted cell of every mounted row ran its plugin transforms and rendered again. Each body cell is now its own memoized element, so cells whose inputs stay the same skip both. `useTableStickyColumns` now returns a new plugin object when its pinned keys change, so changing `startKeys` or `endKeys` at runtime pins and unpins body cells together with their header; before, body rows kept their old pinning until they rendered for another reason.

@humbertovirtudes
