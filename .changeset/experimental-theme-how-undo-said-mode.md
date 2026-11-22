---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: an undo that names what it takes back and says a mode ("make the accent red in light mode. undo the light mode accent change") takes back only a change said earlier in the ask for that mode, and nothing is written. It no longer reads the undo as ruling that mode out, which wrote the change for the other mode instead.

- A change said for the other mode, or for both modes, stays written, and the answer says so.
- The undo's mode is its own: a clause after it takes no mode from it, and a mode said for an earlier change does not limit it.

@josephfarina
