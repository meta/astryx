---
'@astryxdesign/core': patch
---

[fix] List: a mouse drop now glides the rows to their new places on the same settle spring a finger's drop uses, with the dropped row starting from where its copy was let go, at the release's speed. Before, a mouse drop put the rows there at once. A finger's drop is unchanged. Under Reduce Motion a mouse drop still lands at once. Lab ListInput and TransferList follow.

@ernestt
