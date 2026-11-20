---
'@astryxdesign/core': patch
---

[fix] ToggleButtonGroup wraps onto more rows when it is wider than its container, instead of shrinking its buttons until their labels are cut. Each row keeps its own button ends and keyboard order is unchanged; only a single button wider than the whole container still shortens its label. A group that fits looks the same as before.

@josephfarina
