---
'@astryxdesign/core': patch
---

[chore] Internal: a followed trackpad pan takes no speed from a wheel within 1.5 ms of the one before, so bunched wheels after a main-thread stall no longer carry it past the fingers' travel, at 60 to 500 Hz. Not exported from the package entry point.

@vjeux
