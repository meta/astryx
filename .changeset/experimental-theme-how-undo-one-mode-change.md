---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: an undo that names a mode, said after a change for that same mode in the same ask ("make the accent red in light mode. undo the light mode accent change"), takes that change back, and nothing is written. It no longer reads the undo as ruling that mode out, which wrote the change for the other mode instead. Other undos read as before.

@josephfarina
