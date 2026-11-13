---
'@astryxdesign/core': patch
---

[feat] A reorderable List's drop glides the rows to their new places with every pointer, as it does under a finger: the dropped row from where its preview was, at the release's speed, and the rows it passed from their old places, on the theme's settle motion. Before, a mouse drop put them there at once. Lab TransferList and ListInput follow. Under Reduce Motion a mouse drop still lands at once; a cancelled drag still puts everything back at once.

@ernestt
