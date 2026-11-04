---
'@astryxdesign/core': patch
---

[chore] Internal: the picker wheel turns from script, for the time columns that use it. Under a finger, `spinTo` on the wheel's ref turns it onto a row on the tap spin, then commits it as a rest would; under a fine pointer it commits the row at once. Either way it reports whether that row was committed: it refuses a disabled row and an index outside the rows, and a turn the wheel's unmounting cuts short reports that it did not arrive. Nothing public changes: the wheel is not exported from the package entry point. (#8179)

@vjeux
