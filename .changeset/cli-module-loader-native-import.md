---
'@astryxdesign/cli': patch
---

[chore] Internal: the module loader imports a user module through the same small module the doc importers use, which the CLI's own test project loads natively, so a theme build's doc reads no longer time out its tests on a busy machine. No change to any command's output.

@vjeux
