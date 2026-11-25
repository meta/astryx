---
'@astryxdesign/core': patch
---

[fix] List: where the primary pointer is fine (a computer with a mouse or trackpad, a touchscreen laptop included), a drop now glides the rows to their new places on the settle spring a phone's or tablet's drop uses, the dropped row starting from where its copy was let go, at the release's speed. Before, the rows took their places at once. Where the primary pointer is coarse, the drop's motion is unchanged, except that a ListInput record that gains or loses the column labels now starts where its fields were, as it does with a mouse. Under Reduce Motion a drop where the primary pointer is fine still lands at once. Lab ListInput and TransferList follow, and a moved ListInput record that gains or loses the column labels glides from where its fields were.

@ernestt
