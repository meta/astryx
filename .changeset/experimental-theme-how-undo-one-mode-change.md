---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: an undo that names a mode, said right after a change of that mode in the same ask ("make the accent red in light mode. undo the light mode accent change"), takes that change back, and nothing is written, also on a theme that already sets the thing. It no longer reads the undo as ruling that mode out, which wrote the change for the other mode instead.

- An undo that names one mode takes back only a change said for that mode: after a change said for the other mode, or for both modes, nothing is taken back, and the answer says so.
- On its own, an undo that names a mode ("undo the light mode accent change") takes back a setting saved for that mode only. A setting saved the same for both modes is named as such, with how to take it back in both.

@josephfarina
