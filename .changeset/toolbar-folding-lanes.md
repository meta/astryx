---
'@astryxdesign/core': patch
---

[fix] A Toolbar start or end lane that holds an OverflowList, or a TabList that scrolls its tabs, now shrinks with the Toolbar instead of collapsing the list to its "+N" trigger or pushing the other lane out of the row. The list shows as many items as fit and folds the rest into "+N"; two such lanes share the room in proportion to their content; the lanes beside them, such as a TableSelectionToolbar's count and Clear, keep their full width. Content that can't fold overflows as before. To keep a list from folding, set OverflowList's `minVisibleItems` to its item count, or TabList's `overflow="visible"`.

@cixzhang
