---
'@astryxdesign/core': patch
---

[fix] Every filled button now visibly changes on hover and on press. The primary, secondary and destructive Button paint each state with a tint chosen for their own fill and label in each mode that keeps the label at 4.5:1 or more, and shows wherever a tint can do both. Before, the page's one-way overlay vanished on near-black, pale or saturated fills. A theme's own button rule for `--color-overlay-hover` or `--color-overlay-pressed` still wins; ghost buttons keep the page overlay.

@josephfarina
