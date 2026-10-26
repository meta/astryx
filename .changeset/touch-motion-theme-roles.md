---
'@astryxdesign/core': patch
---

[chore] Internal: the touch motion tables register their springs, durations and curves as internal motion roles, each read once when a motion starts, so every component keeps its measured value. Nothing public changes: themes do not set motion roles, and no shipped component reads the roles yet.

@vjeux
