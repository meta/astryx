---
'@astryxdesign/cli': patch
---

[perf] `experimental theme` commands read each folder of Core's sources once while they build Core's component docs. `experimental theme preview app` and `experimental theme preview add` do the same as they write the Overview and Components pages, instead of once per component name. Every run writes and prints the same.

@vjeux
