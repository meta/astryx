---
'@astryxdesign/core': patch
---

[fix] A finger held on a DropdownMenu trigger may drift up to 13px on each axis and still open the menu under every primary pointer, a phone's, a tablet's and a touchscreen laptop's alike, as AST-094 FR29 allows; it cancelled past 10px. No menu, row or trigger reads the pointer query.

@vjeux
