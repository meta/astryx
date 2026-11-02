---
'@astryxdesign/core': patch
---

[chore] Internal: the picker wheel takes an owner's rest rule and turns from script, for the time and date-time columns that use them. Under a finger, `resolveRest` names the row a wheel moves on to after resting on another (by default the nearest enabled row), and `spinTo` on the wheel's ref turns it onto a row on the tap spin, then commits it as a rest would; under a fine pointer `spinTo` commits the row at once. Either way it reports whether that row was committed, refusing a disabled row, an index outside the rows and a row the owner's rest moves off, and a turn the wheel's unmounting cuts short reports that it did not arrive. A rest on the committed row still commits nothing. Nothing public changes: the wheel is not exported from the package entry point.

@vjeux
