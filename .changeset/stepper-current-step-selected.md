---
'@astryxdesign/core': patch
---

[feat] Stepper: the current step's `step`, `step-indicator` and `step-label` targets carry the `selected` theme state, so a theme rule for selected items (tabs, side and top navigation, segmented controls and other selection controls) reaches the current step too. Screen readers still hear "current step".

@josephfarina
