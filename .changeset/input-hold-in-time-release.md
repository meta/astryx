---
'@astryxdesign/core': patch
---

[fix] A tap that lands just before a touch presentation's entrance ends no longer acts when it reaches the page just after that end. It is held if it arrives within two frame intervals of the end. Before, it could pick a menu row.
@vjeux
