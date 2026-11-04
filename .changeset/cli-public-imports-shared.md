---
'@astryxdesign/cli': patch
---

[chore] Internal: the public-import check's `declaredTargets` and `missingNames` are exported from their foundation module, so the docsite's production registry judges a copied example's imports by the same rule. The CLI's checks and their output are unchanged. Not exported from the package entry point.

@vjeux
