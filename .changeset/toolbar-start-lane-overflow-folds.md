---
'@astryxdesign/core': patch
---

[fix] An `OverflowList` placed directly in a horizontal `Toolbar`'s `startContent` now folds its actions into its overflow trigger beside `endContent`, instead of pushing the end content past the toolbar's edge. A single-row `OverflowList` in a flex row now unfolds again when the row widens, and never shrinks below its folded width, so a squeezed row keeps its trigger whole. In a flex row its own width is its unfolded items, at most the row's width, so a folded list keeps the width the row gives it and content after it sits after that width. In a block parent it fills the line, as before. A caller's `width`, `max-width`, or flex basis still sets it.

@quocluongg @cixzhang
