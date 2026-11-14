---
'@astryxdesign/core': patch
---

[fix] Tab from any radio in a `RadioList` now leaves the group, also from a radio that the app focused by script. Before, Chromium sent Tab from that radio to the group's checked radio when it came next, so the group took two Tab stops, and in a modal `Dialog` the result depended on where the group sat.

@duytbp
