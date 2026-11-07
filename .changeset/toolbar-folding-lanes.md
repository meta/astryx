---
'@astryxdesign/core': patch
---

[fix] A Toolbar start or end lane that holds an OverflowList, or a TabList that scrolls its tabs, now shrinks with the Toolbar. Before, the list kept its full width and pushed the controls beside it out of the Toolbar, or, in a start lane beside an end lane, showed only its "+N" trigger. The list shows as many items as fit and folds the rest into "+N"; two such lanes share the room in proportion to their content; the lanes beside them, such as a TableSelectionToolbar's count and Clear, keep their full width. Content that can't fold overflows as before, and so does the row once every folding list is down to its "+N". An OverflowList or TabList folds this way as a direct child of the lane; inside your own wrapper element it sizes as before. Outside a Toolbar, a one-row OverflowList that can fold (including Tokenizer's token row) now keeps a minimum width of its "+N" plus the items `minVisibleItems` keeps. To keep a list from folding, set OverflowList's `minVisibleItems` to its item count, or TabList's `overflow="visible"`.

@cixzhang
