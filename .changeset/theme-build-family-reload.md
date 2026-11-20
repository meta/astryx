---
'@astryxdesign/cli': patch
---

[fix] `themeBuildFamily` (`astryx theme build --family`) builds each member as it is at that build. Before, a second family build in the same process, such as a tool or a test that builds in process, built a member file changed since the first build from the module the first build had loaded.

@josephfarina
