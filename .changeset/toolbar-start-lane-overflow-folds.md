---
'@astryxdesign/core': patch
---

[fix] An `OverflowList` placed directly in a horizontal `Toolbar`'s `startContent` now folds its actions into its overflow trigger beside `endContent`, instead of pushing the end content past the toolbar's edge. A single-row `OverflowList` also never shrinks below its folded width, so a squeezed row keeps its trigger whole; it is never wider than its items.

@quocluongg @cixzhang
