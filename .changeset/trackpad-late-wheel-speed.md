---
'@astryxdesign/core': patch
---

[chore] Internal: when a main-thread stall delivers a late trackpad wheel and bunched wheels after it, a followed pan reads the fingers' speed over the late wheel's interval, so a flick no longer coasts short. The reading never passes the speed before the stall. Not exported from the package entry point.

@vjeux
