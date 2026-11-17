---
'@astryxdesign/core': patch
---

[fix] An `OverflowList` placed directly in a horizontal `Toolbar`'s `startContent` now folds its actions into its overflow trigger beside `endContent`, instead of pushing the end content past the toolbar's edge. A single-row `OverflowList` in a flex row now unfolds again when the row widens, and never shrinks below its folded width, so a squeezed row keeps its trigger whole. Its own width is its unfolded items, at most its parent's width: in a block parent a list whose items fit is now as wide as its items rather than the whole line, and in a flex row a folded list keeps the width the row gives it, so content after it sits after that width. A caller's `width`, `max-width`, or flex basis still sets it.

@quocluongg @cixzhang
