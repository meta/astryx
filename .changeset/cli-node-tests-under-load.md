---
'@astryxdesign/cli': patch
---

[chore] Internal: the doc importers import each doc file through one small module that the CLI's own test project loads natively, so its tests no longer time out on a busy machine. No change to any command's output.

@vjeux
