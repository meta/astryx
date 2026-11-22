---
'@astryxdesign/cli': patch
---

[feat] `astryx theme remove` of a shared theme keeps the whole copy, with its receipt, the packages it installed and its working files, when a file of it changed since the add, so the folder stays a whole copy instead of a part of one. Adding the same theme again over it names the changed files and says to delete them (or move the changes out) first.

@josephfarina
