---
'@astryxdesign/core': patch
---

[feat] Stepper: the current step's `step`, `step-indicator` and `step-label` targets carry the `selected` theme state, the state tabs, side and top navigation and segmented controls use for their chosen item, so a theme can give the current step a selected look with a `selected` rule on those targets. Screen readers still hear "current step".

@josephfarina
