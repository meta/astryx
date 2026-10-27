---
'@astryxdesign/core': patch
---

[internal] One tracker for a held finger across a group of targets (an alert's or an action sheet's actions, a menu's rows, a segmented control's segments, a page control's dots): it reads the targets' rects once, resolves the finger against them (or by the owner's rule), paints or reports the highlight, and runs the target through its own click at the lift. Nothing a consumer sees changes.

@vjeux
