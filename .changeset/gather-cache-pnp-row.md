---
'@astryxdesign/cli': patch
---

[fix] In a run under Yarn Plug'n'Play's loader, such as `yarn astryx`, `doctor`'s search catalog cache row still names the folder and its size and adds that such a run keeps no catalogs, as search and build gather every time there. The plain `astryx` command in the same project keeps them as usual.

@josephfarina
