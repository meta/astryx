---
'@astryxdesign/cli': patch
---

[fix] A run under Yarn Plug'n'Play's loader, such as `yarn astryx`, no longer reads a search catalog that a plain `astryx` run kept: it gathers every time, as `doctor` says, since its modules resolve through Plug'n'Play, which a kept catalog's checks do not follow.

@josephfarina
