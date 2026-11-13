---
'@astryxdesign/core': patch
---

[feat] A reorderable List's drop glides the rows to their new places with every pointer: each row the drop moved, the dropped row included, from its place before the drag, on the theme's move curve (`--ease-move` over `--duration-medium`), so it follows the theme's `character` and `tempo`. Before, a mouse drop put the rows there at once, and a finger's drop settled the dropped row from where its copy was released, on the slower settle spring. Under a finger, reorder mode's moves play the same curve. Lab TransferList and ListInput follow. Under Reduce Motion a mouse drop still lands at once; a cancelled drag still puts everything back at once.

@ernestt
