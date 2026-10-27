---
'@astryxdesign/core': patch
---

[fix] A finger held on a DropdownMenu trigger may drift up to 13px on each axis and still open the menu where the primary pointer is coarse (phones and tablets), as AST-094 FR29 allows; it cancelled past 10px. Where the primary pointer is fine (a touchscreen laptop, a pen tablet), the trigger keeps its 10px. The trigger reads the pointer when its press starts, so no menu or row observes the pointer query.

@vjeux
