---
'@astryxdesign/cli': patch
---

[fix] Icon sets: after you rename an icon-set package in package.json, the next `experimental icon` command that writes the set (a refresh with `new-set --from`, `add`, or `map`, even one that changes nothing else) writes the new package name to the data file's `module`. Before, the old name stayed, and `integration check` failed until you edited the file by hand. Only the experimental icon commands and `integration check` on an icon set change.
@josephfarina
