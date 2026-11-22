---
'@astryxdesign/cli': patch
---

[experimental] When `astryx experimental export --pictures` finds no system temp folder to write the pictures to, its skip reason now says what to do: set TMPDIR (TEMP on Windows) to a writable folder outside the home folder, then run the command again.

@josephfarina
