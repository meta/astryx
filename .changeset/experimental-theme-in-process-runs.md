---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: a process that runs several editor commands (an API caller) reads the app as it is now: a font package removed since an earlier command is no longer counted as installed, and an app copy folder that was not writable and is now no longer blocks `compile --check` with the old reason. The locks `compile` takes for a run are released when the run ends, however it ends, and `new` refuses an option given a value before it starts, as the other editor commands do.

@josephfarina
