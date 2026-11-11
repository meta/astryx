---
'@astryxdesign/core': patch
'@astryxdesign/richtext': patch
---

[fix] Email autolinking now bounds the local part and domain before matching, so a long token that is not an email address cannot make the browser spend seconds backtracking through the regular expression.

@bezabyte
