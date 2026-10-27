---
'@astryxdesign/core': patch
---

[feat] `createReorderable({onReorder, isReorderable})` makes a collection's reorder behavior, and `List` takes it as `reorderable`: each `ListItem` with an `itemKey` gets a reorder handle at its end, and each committed move calls `onReorder({key, to})` once, with the row's key and its index after the move. On a touch screen a finger held still on a handle picks up its row the way an iOS table's reorder control does (a flick on it still scrolls): the row stays in its place, dimmed, while a copy of it follows the finger and an accent line marks where it would land; the other rows stay still, the page scrolls near the edges, and on release the rows rearrange, gliding to their new places. A mouse drags a handle at once with the same copy and line, and rows take their places without motion; a cancelled drag puts everything back at once. Without a drag, a click, Space or Enter on a handle turns on reorder mode for its row: each arrow key moves it a place at once, announced with its place and neighbours, and Escape or another activation ends the mode, keeping the moves. The object's `start(key)` enters the same mode from the app's own UI, such as a row's context menu. A List without `reorderable` loads none of the reorder code.

@vjeux
